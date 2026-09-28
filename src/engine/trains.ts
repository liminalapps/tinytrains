import * as THREE from 'three';
import type { LineDef, StockSpec, TrainState, TrainsResponse } from '../../shared/types.ts';
import { STOCK } from '../../shared/stock/index.ts';
import { carModel, consist, genericSpec, MODE, trainUniforms, XRAY_STENCIL, type CarModel, type ConsistBody } from './stockModel.ts';
import { concatPieces, netUniforms, Network, TRACK_Y, type PathPiece } from './network.ts';
import type { FrameInfo, Layer, World } from './world.ts';
import { RouteHint } from './routeHint.ts';

const GAP = 0.8; // meters between cars
const MISSING_GRACE_MS = 50_000;

interface TrainPath {
  x: Float32Array;
  z: Float32Array;
  el: Float32Array;
  lane: Float32Array;
  cum: Float32Array;
  len: number;
  stopD: number[];
  sig: string;
}

export interface TrainStatus {
  kind: 'dwell' | 'moving';
  /** Index into state.stops of the station the train is at (dwell) or heading to (moving). */
  idx: number;
  progress: number; // 0..1 between stops when moving
}

export interface LiveTrain {
  id: string;
  state: TrainState;
  line: LineDef;
  spec: StockSpec;
  model: CarModel;
  bodies: ConsistBody[];
  path: TrainPath;
  born: number;
  dying: number | null;
  /** When the feed stopped reporting this train (it keeps running on its last timeline for a while). */
  missing: number | null;
  /** Displayed center distance along the path (null until placed). */
  disp: number | null;
  prevTarget: number | null;
  // Per-frame outputs.
  pos: THREE.Vector3;
  /** Middle of the train (for markers), and its rendered length. */
  mid: THREE.Vector3;
  length: number;
  heading: number;
  status: TrainStatus;
  centers: THREE.Vector3[];
}

interface Batch {
  mesh: THREE.InstancedMesh;
  xray: THREE.InstancedMesh;
  mode: THREE.InstancedBufferAttribute;
  cap: number;
  n: number;
}

const easeTrip = (f: number) => {
  // Trapezoidal speed profile: accelerate, cruise, brake.
  const a = 0.22;
  if (f <= 0) return 0;
  if (f >= 1) return 1;
  if (f < a) return (f * f) / (2 * a * (1 - a));
  if (f > 1 - a) return 1 - ((1 - f) * (1 - f)) / (2 * a * (1 - a));
  return (f - a / 2) / (1 - a);
};

const easeOutBack = (x: number) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export class TrainLayer implements Layer {
  readonly group = new THREE.Group();
  readonly trains = new Map<string, LiveTrain>();
  private batches = new Map<string, Batch>();
  private xrayMat: THREE.MeshBasicMaterial;
  private glow: Glows;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private color = new THREE.Color();
  selected: LiveTrain | null = null;
  hovered: LiveTrain | null = null;
  private marker: Marker;
  private route = new RouteHint();
  hiddenLines = new Set<string>();
  /** Highlight this line's trains and dim the rest (null = no focus). */
  focusLine: string | null = null;
  /** Lines of the station whose card is open: their tracks stay colorful. */
  stationLines: string[] | null = null;

  /** Track highlighting follows the most specific context: selected train > focused line > open station. */
  refreshFocus() {
    this.net.setFocus(this.selected ? [this.selected.line.id] : this.focusLine ? [this.focusLine] : this.stationLines);
  }
  private lineCounts = new Map<string, number>();
  onChange: () => void = () => {};
  /** The selected train left the map on its own (trip finished, dropped from the feed). */
  onDeselect: () => void = () => {};

  constructor(
    readonly world: World,
    readonly net: Network,
  ) {
    this.xrayMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      // Pull toward the camera so a train never x-rays through itself.
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
      ...XRAY_STENCIL,
    });
    this.glow = new Glows(4000);
    this.marker = new Marker();
    this.group.add(this.glow.points, this.marker.group, this.route.mesh);
  }

  private specFor(id: string, line: LineDef): StockSpec {
    return STOCK[id] ?? STOCK[line.stock] ?? genericSpec(id || 'generic', '#d8dde6');
  }

  // -------------------------------------------------------------------------
  // Data updates
  // -------------------------------------------------------------------------
  setData(resp: TrainsResponse) {
    const nowMs = this.world.now();
    const seen = new Set<string>();
    for (const st of resp.trains) {
      const line = this.net.lines.get(st.line);
      if (!line || st.stops.length === 0) continue;
      seen.add(st.id);
      const existing = this.trains.get(st.id);
      if (existing && existing.dying === null) {
        existing.missing = null;
        this.retime(existing, st, nowMs);
      } else {
        const spec = this.specFor(st.stock, line);
        const path = this.buildPath(st);
        if (!path) continue;
        const t: LiveTrain = {
          id: st.id,
          state: st,
          line,
          spec,
          model: carModel(spec),
          bodies: consist(spec, Math.max(1, st.cars || 1)),
          path,
          born: nowMs,
          dying: null,
          missing: null,
          disp: null,
          prevTarget: null,
          pos: new THREE.Vector3(),
          mid: new THREE.Vector3(),
          length: 0,
          heading: 0,
          status: { kind: 'dwell', idx: 0, progress: 0 },
          centers: [],
        };
        this.trains.set(st.id, t);
        this.noteLength(t);
      }
    }
    // When a whole line drops out at once (a hiccup in one upstream feed), its trains keep gliding on
    // their last timelines for a grace period instead of vanishing and popping back. A single train
    // going missing is normal (trip finished, id reassigned) and it leaves right away.
    const counts = new Map<string, number>();
    for (const st of resp.trains) counts.set(st.line, (counts.get(st.line) ?? 0) + 1);
    const hiccup = (line: string) => {
      const prev = this.lineCounts.get(line) ?? 0;
      return prev >= 3 && (counts.get(line) ?? 0) < prev * 0.5;
    };
    for (const t of this.trains.values()) {
      if (seen.has(t.id) || t.dying !== null) continue;
      if (t.missing === null && !hiccup(t.line.id)) {
        t.dying = nowMs;
        continue;
      }
      t.missing ??= nowMs;
      const last = t.state.stops[t.state.stops.length - 1];
      if (nowMs - t.missing > MISSING_GRACE_MS || nowMs / 1000 > last.d + 20) t.dying = nowMs;
    }
    // Remember healthy counts only, so a multi-poll outage keeps counting as one.
    for (const [line, n] of counts) if (!hiccup(line)) this.lineCounts.set(line, n);
    for (const line of this.lineCounts.keys()) if (!counts.has(line) && !hiccup(line)) this.lineCounts.delete(line);
    this.onChange();
  }

  private retime(t: LiveTrain, st: TrainState, _nowMs: number) {
    const oldCars = t.state.cars;
    const oldStock = t.state.stock;
    const sig = st.stops.map((s) => s.s).join('>') + '|' + st.line;
    if (sig !== t.path.sig) {
      const path = this.buildPath(st);
      if (!path) return;
      // Carry the displayed position over to the new path via a shared station.
      const mapped = t.disp === null ? null : mapPosition(t.state, t.path, t.disp, st, path);
      // If we can't carry the position over, the train re-appears with a little pop.
      if (mapped === null && t.disp !== null) t.born = _nowMs;
      t.path = path;
      t.state = st;
      t.disp = mapped;
      t.prevTarget = null;
    } else {
      t.state = st;
    }
    // A through-running train can change line between polls.
    const line = this.net.lines.get(st.line);
    if (line && line !== t.line) {
      t.line = line;
      if (this.selected === t) this.refreshFocus();
    }
    // Keep status in range of the new timeline until the next frame recomputes it.
    t.status = this.evalD(t, _nowMs / 1000).status;
    if (st.cars !== oldCars || st.stock !== oldStock) {
      const spec = this.specFor(st.stock, t.line);
      t.spec = spec;
      t.model = carModel(spec);
      t.bodies = consist(spec, Math.max(1, st.cars || 1));
      this.noteLength(t);
    }
  }

  /** Tell the network how long this train really is, so its stations' platforms fit it. */
  private noteLength(t: LiveTrain) {
    const n = t.bodies.length;
    this.net.noteTrainLength(t.line.id, n * t.model.bodyLength + (n - 1) * GAP);
  }

  /** Top speed (m/s) we let a train visibly reach, by kind of vehicle. */
  private vmax(t: LiveTrain) {
    switch (t.line.kind) {
      case 'rail':
        return 44;
      case 'cable':
        return 6;
      case 'tram':
        return 16;
      case 'light':
        return 24;
      case 'agt':
        return 20;
      case 'monorail':
        return 26;
      default:
        return 30;
    }
  }

  private buildPath(st: TrainState): TrainPath | null {
    const s = st.stops;
    // Each item is a stretch of track; `stop` is the timeline stop index it starts at (null = lead-in).
    const items: { p: PathPiece; stop: number | null }[] = [];
    const lead = this.net.leadIn(st.line, s[0].s, s.length > 1 ? s[1].s : null);
    if (lead) items.push({ p: lead, stop: null });
    for (let i = 0; i < s.length - 1; i++) {
      const ps = this.net.pieces(st.line, s[i].s, s[i + 1].s);
      if (!ps) return null;
      ps.forEach((p, k) => items.push({ p, stop: k === 0 ? i : null }));
    }
    if (s.length > 1) {
      const out = this.net.leadIn(st.line, s[s.length - 1].s, s[s.length - 2].s);
      if (out) items.push({ p: { x: out.x.slice().reverse(), z: out.z.slice().reverse(), el: out.el.slice().reverse(), lane: -out.lane }, stop: s.length - 1 });
    }
    if (!items.length) {
      const stn = this.net.stations.get(s[0].s);
      if (!stn) return null;
      items.push({ p: { x: new Float32Array([stn.pos.x - 1, stn.pos.x + 1]), z: new Float32Array([stn.pos.z, stn.pos.z]), el: new Float32Array(2), lane: 0 }, stop: null });
    }
    const xs: number[] = [];
    const zs: number[] = [];
    const es: number[] = [];
    const ls: number[] = [];
    const cum: number[] = [];
    const stopD: number[] = new Array(s.length);
    for (const it of items) {
      const p = it.p;
      if (it.stop !== null) stopD[it.stop] = cum.length ? cum[cum.length - 1] : 0;
      for (let i = 0; i < p.x.length; i++) {
        if (cum.length && i === 0) continue;
        const d = cum.length ? cum[cum.length - 1] + Math.hypot(p.x[i] - xs[xs.length - 1], p.z[i] - zs[zs.length - 1]) : 0;
        xs.push(p.x[i]);
        zs.push(p.z[i]);
        es.push(p.el[i]);
        ls.push(p.lane);
        cum.push(d);
      }
    }
    const total = cum[cum.length - 1];
    // The last stop sits at the end of the last timeline piece (or the lead-in, for a lone stop).
    if (stopD[s.length - 1] === undefined) stopD[s.length - 1] = s.length === 1 && lead ? total : total;
    for (let i = 0; i < s.length; i++) if (stopD[i] === undefined) stopD[i] = i === 0 ? 0 : stopD[i - 1];
    return {
      x: new Float32Array(xs),
      z: new Float32Array(zs),
      el: new Float32Array(es),
      lane: new Float32Array(ls),
      cum: new Float32Array(cum),
      len: total,
      stopD,
      sig: s.map((x) => x.s).join('>') + '|' + st.line,
    };
  }

  // -------------------------------------------------------------------------
  // Motion
  // -------------------------------------------------------------------------
  /** Center distance along the path at time t (seconds), from the timeline. */
  evalD(t: LiveTrain, tSec: number): { D: number; status: TrainStatus } {
    const s = t.state.stops;
    const D = t.path.stopD;
    if (tSec <= s[0].d || s.length === 1) return { D: D[0], status: { kind: 'dwell', idx: 0, progress: 0 } };
    for (let i = 0; i < s.length - 1; i++) {
      const a = s[i + 1].a;
      if (tSec < a) {
        const dur = Math.max(1, a - s[i].d);
        const f = THREE.MathUtils.clamp((tSec - s[i].d) / dur, 0, 1);
        return { D: D[i] + easeTrip(f) * (D[i + 1] - D[i]), status: { kind: 'moving', idx: i + 1, progress: f } };
      }
      if (tSec < s[i + 1].d) return { D: D[i + 1], status: { kind: 'dwell', idx: i + 1, progress: 0 } };
    }
    return { D: D[s.length - 1], status: { kind: 'dwell', idx: s.length - 1, progress: 0 } };
  }

  private sample(p: TrainPath, d: number, out: { x: number; z: number; el: number; lane: number; dx: number; dz: number }) {
    const n = p.cum.length;
    if (n < 2) {
      out.x = p.x[0];
      out.z = p.z[0];
      out.el = 0;
      out.lane = 0;
      out.dx = 1;
      out.dz = 0;
      return out;
    }
    let lo = 0;
    let hi = n - 1;
    if (d <= 0) {
      lo = 0;
      hi = 1;
    } else if (d >= p.len) {
      lo = n - 2;
      hi = n - 1;
    } else {
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (p.cum[mid] <= d) lo = mid;
        else hi = mid;
      }
    }
    const segLen = Math.max(1e-6, p.cum[hi] - p.cum[lo]);
    const f = (d - p.cum[lo]) / segLen; // may extrapolate beyond [0, 1] at the ends
    const dx = (p.x[hi] - p.x[lo]) / segLen;
    const dz = (p.z[hi] - p.z[lo]) / segLen;
    out.x = p.x[lo] + (p.x[hi] - p.x[lo]) * f;
    out.z = p.z[lo] + (p.z[hi] - p.z[lo]) * f;
    const fc = THREE.MathUtils.clamp(f, 0, 1);
    out.el = p.el[lo] + (p.el[hi] - p.el[lo]) * fc;
    out.lane = f < 0.5 ? p.lane[lo] : p.lane[hi];
    out.dx = dx;
    out.dz = dz;
    return out;
  }

  private laneAt(p: TrainPath, d: number) {
    const s = this.tmpS;
    let v = 0;
    for (const [o, w] of [
      [-45, 0.2],
      [-15, 0.3],
      [15, 0.3],
      [45, 0.2],
    ] as const) {
      v += this.sample(p, d + o, s).lane * w;
    }
    return v;
  }

  private tmpS = { x: 0, z: 0, el: 0, lane: 0, dx: 1, dz: 0 };
  private tmpA = { x: 0, z: 0, el: 0, lane: 0, dx: 1, dz: 0 };
  private tmpB = { x: 0, z: 0, el: 0, lane: 0, dx: 1, dz: 0 };

  update(f: FrameInfo) {
    const nowMs = f.now;
    const tSec = nowMs / 1000;
    const scale = netUniforms.uScale.value; // cross-section exaggeration
    const lenScale = netUniforms.uLen.value;
    const laneW = netUniforms.uLaneW.value;
    const trackOff = netUniforms.uTrackOff.value * (this.net.leftHand ? -1 : 1);
    const elevH = netUniforms.uElevH.value;

    trainUniforms.uNight.value = this.world.atmosphere.state.night;
    trainUniforms.uTime.value = f.time;
    trainUniforms.uFar.value = THREE.MathUtils.smoothstep(f.mpp, 2.5, 9) * 0.55;

    // Count bodies per batch first so capacities can grow.
    const need = new Map<string, number>();
    for (const t of this.trains.values()) {
      if (this.hiddenLines.has(t.line.id)) continue;
      for (const b of t.bodies) {
        const k = `${t.spec.id}|${b.variant}`;
        need.set(k, (need.get(k) ?? 0) + 1);
      }
    }
    for (const [k, n] of need) this.ensureBatch(k, n);
    for (const b of this.batches.values()) b.n = 0;
    this.glow.reset();

    const A = this.tmpA;
    const B = this.tmpB;
    for (const t of [...this.trains.values()]) {
      let pop = easeOutBack(THREE.MathUtils.clamp((nowMs - t.born) / 650, 0, 1));
      if (t.dying !== null) {
        const k = (nowMs - t.dying) / 500;
        if (k >= 1) {
          this.trains.delete(t.id);
          if (this.selected === t) {
            this.select(null);
            this.onDeselect();
          }
          continue;
        }
        pop *= 1 - k * k;
      }
      const ev = this.evalD(t, tSec);
      t.status = ev.status;
      // Follow the timeline like a real train would: bounded speed, never reversing. When a new
      // prediction puts the train behind us (common: ETAs slip), we simply hold, like waiting at a
      // signal, until it catches up. Only a wildly different position hops, with a little pop.
      const target = ev.D;
      const vT = t.prevTarget === null ? 0 : Math.max(0, (target - t.prevTarget) / Math.max(f.dt, 1e-3));
      t.prevTarget = target;
      if (t.disp === null || target - t.disp > 1800 || target < t.disp - 2500) {
        if (t.disp !== null) t.born = nowMs;
        t.disp = target;
      } else {
        const v = THREE.MathUtils.clamp(vT + (target - t.disp) * 0.9, 0, this.vmax(t));
        t.disp = Math.min(t.disp + v * f.dt, Math.max(target, t.disp));
      }
      const D = t.disp;

      const mode = t === this.selected ? MODE.selected : this.focusLine ? (t.line.id === this.focusLine ? MODE.lineFocus : MODE.dimmed) : MODE.normal;
      // Zoomed out, the selected train (and a focused line's trains) grow a bit so they're easy to spot.
      const far = THREE.MathUtils.smoothstep(f.mpp, 1.2, 6);
      const boost = mode === MODE.selected ? 1 + 0.35 * far : mode === MODE.lineFocus ? 1 + 0.15 * far : 1;
      const bodyL = t.model.bodyLength * lenScale;
      const gap = GAP * lenScale;
      const trainL = t.bodies.length * bodyL + (t.bodies.length - 1) * gap;
      t.length = trainL;
      const hidden = this.hiddenLines.has(t.line.id);
      t.centers.length = t.bodies.length;
      this.color.set(t.line.color);
      for (let k = 0; k < t.bodies.length; k++) {
        const b = t.bodies[k];
        const dc = D + trainL / 2 - bodyL / 2 - k * (bodyL + gap);
        this.sample(t.path, dc + bodyL * 0.36, A);
        this.sample(t.path, dc - bodyL * 0.36, B);
        const lane = this.laneAt(t.path, dc);
        let hx = A.x - B.x;
        let hz = A.z - B.z;
        const hl = Math.hypot(hx, hz) || 1;
        hx /= hl;
        hz /= hl;
        // Right-of-travel normal.
        const nx = -hz;
        const nz = hx;
        const lat = lane * laneW + trackOff;
        const x = (A.x + B.x) / 2 + nx * lat;
        const z = (A.z + B.z) / 2 + nz * lat;
        const el = Math.max(0, (A.el + B.el) / 2);
        const y = TRACK_Y + 0.15 + el * elevH;
        let c = t.centers[k];
        if (!c) c = t.centers[k] = new THREE.Vector3();
        c.set(x, y + t.model.height * scale * 0.5, z);
        if (hidden) continue;
        const heading = Math.atan2(-hz, hx) + (b.flip ? Math.PI : 0);
        this.q.setFromAxisAngle(this.up, heading);
        this.m4.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(lenScale * pop, scale * pop * boost, scale * pop * boost));
        const batch = this.batches.get(`${t.spec.id}|${b.variant}`)!;
        batch.mesh.setMatrixAt(batch.n, this.m4);
        batch.mesh.setColorAt(batch.n, this.color);
        batch.mode.array[batch.n] = mode;
        batch.n++;
        if (k === 0) {
          t.pos.set(x, y, z);
          t.heading = Math.atan2(-hz, hx);
          const fx = x + hx * (bodyL / 2);
          const fz = z + hz * (bodyL / 2);
          this.glow.add(fx, y + 1.2 * scale, fz, 1, 0.95, 0.8, 1);
        }
        if (k === t.bodies.length - 1) {
          this.glow.add(x - hx * (bodyL / 2), y + 1.2 * scale, z - hz * (bodyL / 2), 1, 0.2, 0.15, 0.7);
        }
      }
      const c0 = t.centers[0];
      const c1 = t.centers[t.centers.length - 1];
      if (c0 && c1) t.mid.copy(c0).add(c1).multiplyScalar(0.5);
    }
    for (const b of this.batches.values()) {
      b.mesh.count = b.n;
      b.xray.count = b.n;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      b.mode.needsUpdate = true;
    }
    this.glow.commit(f.mpp, this.world.atmosphere.state.night);
    this.marker.update(this.selected, f, scale);
    this.route.update(f);
  }

  private ensureBatch(key: string, n: number) {
    const cur = this.batches.get(key);
    if (cur && cur.cap >= n) return;
    const [stockId, variant] = key.split('|');
    const spec = STOCK[stockId] ?? [...this.trains.values()].find((t) => t.spec.id === stockId)?.spec ?? genericSpec(stockId);
    const model = carModel(spec);
    const cap = Math.max(16, Math.ceil(n * 1.5));
    // A private copy of the car geometry carries this batch's per-instance display modes.
    const geo = model.geometry(variant as ConsistBody['variant']).clone();
    const mode = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aMode', mode);
    const mesh = new THREE.InstancedMesh(geo, model.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    const xray = new THREE.InstancedMesh(geo, this.xrayMat, cap);
    xray.instanceMatrix = mesh.instanceMatrix;
    xray.instanceColor = mesh.instanceColor;
    xray.frustumCulled = false;
    xray.renderOrder = 10;
    xray.count = 0;
    if (cur) {
      this.group.remove(cur.mesh, cur.xray);
      cur.mesh.geometry.dispose();
      cur.mesh.dispose();
      cur.xray.dispose();
    }
    this.group.add(mesh, xray);
    this.batches.set(key, { mesh, xray, mode, cap, n: 0 });
  }

  // -------------------------------------------------------------------------
  // Picking & selection
  // -------------------------------------------------------------------------
  pick(px: number, py: number, radiusPx = 18): LiveTrain | null {
    let best: LiveTrain | null = null;
    let bd = radiusPx;
    const v = new THREE.Vector2();
    for (const t of this.trains.values()) {
      if (t.dying !== null || this.hiddenLines.has(t.line.id)) continue;
      for (const c of t.centers) {
        if (!c) continue;
        this.world.rig.toScreen(c, v);
        const d = Math.hypot(v.x - px, v.y - py);
        if (d < bd) {
          bd = d;
          best = t;
        }
      }
    }
    return best;
  }

  select(t: LiveTrain | null) {
    if (t && this.trains.get(t.id) !== t) t = null;
    this.selected = t;
    this.route.set(t);
    this.refreshFocus();
    this.onChange();
  }

  count() {
    let n = 0;
    for (const t of this.trains.values()) if (t.dying === null) n++;
    return n;
  }

  dispose() {
    for (const b of this.batches.values()) {
      b.mesh.geometry.dispose();
      b.mesh.dispose();
      b.xray.dispose();
    }
    this.batches.clear();
    this.trains.clear();
    this.xrayMat.dispose();
    this.glow.dispose();
    this.marker.dispose();
    this.route.dispose();
    this.group.clear();
  }
}

/** Map a distance on an old path to the equivalent distance on a new path via shared stations. */
function mapPosition(oldSt: TrainState, oldP: TrainPath, d: number, newSt: TrainState, newP: TrainPath): number | null {
  const os = oldSt.stops;
  let k = 0;
  while (k < os.length - 1 && oldP.stopD[k + 1] <= d) k++;
  const idx = new Map(newSt.stops.map((s, i) => [s.s, i]));
  const j = idx.get(os[k].s);
  if (j !== undefined) {
    const off = d - oldP.stopD[k];
    // Only trust the offset if the next stop matches too (same stretch of track).
    if (off <= 1 || (k + 1 < os.length && idx.get(os[k + 1].s) === j + 1)) return newP.stopD[j] + off;
  }
  if (k + 1 < os.length) {
    const j2 = idx.get(os[k + 1].s);
    if (j2 !== undefined) return newP.stopD[j2] - (oldP.stopD[k + 1] - d);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Headlight / taillight glows (additive points; visible at dusk and night)
// ---------------------------------------------------------------------------
class Glows {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private n = 0;
  private mat: THREE.ShaderMaterial;
  constructor(private cap: number) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 10 }, uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aColor; varying vec4 vC; uniform float uSize;
        void main() { vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * aColor.a; }`,
      fragmentShader: /* glsl */ `
        varying vec4 vC; uniform float uAlpha;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a; gl_FragColor = vec4(vC.rgb * a * uAlpha, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }
  reset() {
    this.n = 0;
  }
  dispose() {
    this.points.geometry.dispose();
    this.mat.dispose();
  }
  add(x: number, y: number, z: number, r: number, g: number, b: number, a: number) {
    if (this.n >= this.cap) return;
    this.pos.set([x, y, z], this.n * 3);
    this.col.set([r, g, b, a], this.n * 4);
    this.n++;
  }
  commit(mpp: number, night: number) {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    this.mat.uniforms.uAlpha.value = THREE.MathUtils.smoothstep(night, 0.25, 0.8);
    this.mat.uniforms.uSize.value = THREE.MathUtils.clamp(26 / Math.sqrt(mpp), 7, 34) * Math.min(devicePixelRatio, 2);
  }
}

// ---------------------------------------------------------------------------
// Selection marker: a bobbing gem, a pulsing halo under the whole train and, zoomed out or after
// dark, a soft beam of light so the selected train is easy to find.
// ---------------------------------------------------------------------------
class Marker {
  readonly group = new THREE.Group();
  private gem: THREE.Mesh;
  private ring: THREE.Mesh;
  private halo: THREE.Mesh;
  private beam: THREE.Mesh;
  private gemMat = new THREE.MeshLambertMaterial({ color: '#ff5a5f', emissive: '#ffffff', emissiveIntensity: 0.15 });
  private ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false });
  private haloMat: THREE.ShaderMaterial;
  private beamMat: THREE.ShaderMaterial;
  constructor() {
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(0.8, 1.25, 0.8), this.gemMat);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.renderOrder = 5;
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p);
          float a = smoothstep(1.0, 0.0, d);
          a = a * a * (0.75 + 0.25 * sin(uTime * 3.0));
          gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35) * a * uAlpha, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.haloMat);
    this.halo.renderOrder = 6;
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
      vertexShader: 'varying float vH; void main() { vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vH;
        void main() { float a = pow(1.0 - vH, 1.6) * uAlpha; gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * a, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.6, 1, 24, 1, true).translate(0, 0.5, 0), this.beamMat);
    this.beam.renderOrder = 7;
    this.beam.frustumCulled = false;
    this.group.add(this.halo, this.beam, this.gem, this.ring);
    this.group.visible = false;
  }
  dispose() {
    for (const m of [this.gem, this.ring, this.halo, this.beam]) m.geometry.dispose();
    this.gemMat.dispose();
    this.ringMat.dispose();
    this.haloMat.dispose();
    this.beamMat.dispose();
  }
  update(t: LiveTrain | null, f: FrameInfo, scale: number) {
    this.group.visible = !!t;
    if (!t) return;
    const s = Math.max(f.mpp * 9, 3.2 * scale);
    const night = f.night;
    this.gemMat.color.set(t.line.color);
    this.gemMat.emissive.set(t.line.color);
    this.gemMat.emissiveIntensity = 0.25 + 0.75 * night;
    const bob = Math.sin(f.time * 3) * 0.18 * s;
    this.gem.position.set(t.pos.x, t.pos.y + t.model.height * scale + s * 2.2 + bob, t.pos.z);
    this.gem.scale.setScalar(s);
    this.gem.rotation.y = f.time * 1.5;
    const k = (f.time * 0.8) % 1;
    this.ring.position.set(t.mid.x, t.mid.y - t.model.height * scale * 0.5 + 0.3, t.mid.z);
    this.ring.scale.setScalar(s * (1.5 + k * 5));
    this.ringMat.opacity = 0.8 * (1 - k);
    // Halo: an ellipse along the train.
    this.haloMat.uniforms.uColor.value.set(t.line.color);
    this.haloMat.uniforms.uTime.value = f.time;
    this.haloMat.uniforms.uAlpha.value = 0.6 + 0.9 * night;
    this.halo.position.set(t.mid.x, t.mid.y - t.model.height * scale * 0.5 + 0.4, t.mid.z);
    this.halo.rotation.y = t.heading;
    this.halo.scale.set(t.length * 1.3 + s * 8, 1, s * 8);
    // Beam: shows when zoomed out or after dark.
    const want = Math.max(THREE.MathUtils.smoothstep(f.mpp, 1.5, 5), night * 0.8);
    this.beamMat.uniforms.uColor.value.set(t.line.color);
    this.beamMat.uniforms.uAlpha.value = 0.55 * want;
    this.beam.visible = want > 0.02;
    this.beam.position.set(t.mid.x, t.mid.y, t.mid.z);
    this.beam.scale.set(s * 0.9, f.mpp * 260, s * 0.9);
  }
}
