import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { aircraftFor, liveryFor, type AircraftType, type Livery } from '../../shared/aircraft.ts';
import { makeProjection } from '../../shared/geo.ts';
import type { CityId } from '../../shared/types.ts';
import type { Plane } from '../../server/planes.ts';
import { LOOK_PARS, lookUniforms, applyToon } from '../themes/look.ts';
import type { FrameInfo, Layer, World } from './world.ts';

// Live aircraft over the city, from community ADS-B receivers. Each plane is a little procedural model of its
// real type (length, wingspan, engine layout) in its airline's colors, flying its real track: positions are
// dead-reckoned from speed, heading and climb rate between polls. Altitude is compressed so a cruising jet
// stays in the frame; a shadow on the ground marks where it really is.

const POLL_MS = 10_000;
/** Trail samples per plane (one per ~0.5 s of flight): about 70 s of history behind each plane. */
const TRAIL_N = 140;
/** Map height for a pressure altitude in feet: approach heights nearly true, cruise compressed. */
export const displayY = (ft: number) => 6 + 950 * (1 - Math.exp(-(ft * 0.3048) / 3200));

export interface LivePlane {
  data: Plane;
  type: AircraftType;
  livery: Livery;
  group: THREE.Group;
  body: THREE.Mesh;
  strobe: THREE.Mesh;
  shadow: THREE.Mesh;
  /** Where the latest fix puts the plane (map x, map y) and when (server ms). */
  fix: { x: number; y: number; t: number };
  /** What's drawn: smoothed toward the dead-reckoned position. */
  pos: THREE.Vector3;
  heading: number; // radians, map frame (0 = +x/east, counterclockwise)
  bank: number;
  pitch: number;
  fade: number; // 0..1 entrance/exit
  missing: number; // polls without this plane
  phase: number;
  /** Where it has been, oldest first (map x, height, map z), sampled every ~0.5 s. */
  trail: THREE.Vector3[];
  trailAt: number;
}

// ---------------------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------------------
const col = new THREE.Color();
function paint(g: THREE.BufferGeometry, c: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  col.set(c);
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  return geo;
}
/** A flat polygon in the x/z plane, `h` thick, bottom at y. */
function slab(pts: [number, number][], h: number, y: number) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0);
}
/** A flat polygon in the x/y plane (a fin), `w` thick, centered on z. */
function fin(pts: [number, number][], w: number) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2);
}
/** A cylinder along x. */
const tube = (r0: number, r1: number, len: number, x: number, y: number, z: number, seg = 10) =>
  new THREE.CylinderGeometry(r1, r0, len, seg).rotateZ(-Math.PI / 2).translate(x, y, z);

/** Swept wing pair: root chord c, tip chord ct, half-span b, sweep of the leading edge (m) at the tip. */
function wingPair(xLE: number, y: number, c: number, ct: number, b: number, sweep: number, t: number) {
  const half = (s: number): [number, number][] => [
    [xLE, 0],
    [xLE - sweep, s * b],
    [xLE - sweep - ct, s * b],
    [xLE - c, 0],
  ];
  return [slab(half(1), t, y), slab(half(-1).reverse(), t, y)];
}

export interface Built {
  body: THREE.BufferGeometry;
  lights: THREE.BufferGeometry;
  strobe: THREE.BufferGeometry;
}

export function buildModel(ty: AircraftType, lv: Livery): Built {
  const L = ty.len;
  const B = ty.span / 2;
  const lay = ty.layout;
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, c: string) => parts.push(paint(g, c));
  const body = lv.full ? lv.tail : lv.body;
  const light = lay === 'single' || lay === 'singlelow' || lay === 'heli';
  const small = lay === 'aft' || lay === 'turboprop' || lay === 'twinprop';
  let r = light ? L * 0.07 : small ? 0.55 + L * 0.03 : 0.9 + L * 0.03;
  if (lay === 'a380') r *= 1.08;
  const engine = lv.full ? lv.accent : '#d8dce2';
  const dark = '#2b2f36';

  if (lay === 'heli') {
    add(new THREE.SphereGeometry(1, 12, 8).scale(L * 0.28, r * 1.1, r).translate(L * 0.12, 0, 0), body);
    add(tube(r * 0.18, r * 0.35, L * 0.5, -L * 0.25, r * 0.35, 0, 6), body);
    add(fin([[-L * 0.47, r * 0.2], [-L * 0.52, r * 1.6], [-L * 0.44, r * 1.6], [-L * 0.4, r * 0.3]], 0.15), lv.accent);
    add(new THREE.CylinderGeometry(0.2, 0.2, r * 0.5, 6).translate(L * 0.08, r * 1.2, 0), dark);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(B * 2, 0.12, 0.35).rotateY((i * Math.PI) / 4).translate(L * 0.08, r * 1.45, 0), '#3a3f47');
    add(new THREE.BoxGeometry(L * 0.5, 0.15, 0.15).translate(L * 0.1, -r * 1.05, r * 0.8), dark);
    add(new THREE.BoxGeometry(L * 0.5, 0.15, 0.15).translate(L * 0.1, -r * 1.05, -r * 0.8), dark);
  } else {
    // Fuselage: barrel, rounded nose, tail cone sweeping up to the fin.
    const barrel = L * 0.68;
    const deck = lay === 'a380' ? 1.3 : 1;
    add(tube(r, r, barrel, L * 0.04, 0, 0, 12).scale(1, deck, 1), body);
    add(new THREE.SphereGeometry(r, 12, 8).scale(L * 0.12 / r, deck, 1).translate(L * 0.38, 0, 0), body);
    add(tube(r, r * 0.3, L * 0.22, -L * 0.41, r * 0.25, 0, 12).scale(1, deck, 1), body);
    // Cockpit windows and the belly or cheatline.
    if (!light) add(new THREE.BoxGeometry(r * 0.9, r * 0.25, r * 1.3).translate(L * 0.43, r * 0.35 * deck, 0), dark);
    add(new THREE.BoxGeometry(barrel * 0.98, r * 0.28, r * 2.04).translate(L * 0.04, -r * 0.42 * deck, 0), lv.accent);
    if (lay === 'jumbo') add(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(L * 0.2, r * 0.75, r * 0.82).translate(L * 0.25, r * 0.5, 0), body);

    // Wings.
    const high = lay === 'turboprop' || lay === 'single' || lay === 'lifter';
    const jet = lay === 'jet' || lay === 'jet4' || lay === 'jumbo' || lay === 'a380' || lay === 'trijet' || lay === 'aft' || lay === 'lifter';
    const c = ty.span * (jet ? 0.19 : 0.13);
    const ct = c * (jet ? 0.28 : 0.6);
    const sweep = jet && lay !== 'lifter' ? B * 0.5 : B * 0.05;
    const xLE = L * (lay === 'aft' ? 0.1 : 0.14);
    const wy = high ? r * 0.8 : -r * 0.6;
    for (const w of wingPair(xLE, wy, c, ct, B, sweep, Math.max(0.25, r * 0.16))) add(w, body === lv.tail && lv.full ? lv.body : lv.full ? lv.tail : body);
    // Winglet tips in the tail color on airliners.
    if (jet && lay !== 'lifter' && lay !== 'aft') for (const s of [1, -1]) add(fin([[xLE - sweep - ct * 0.1, 0], [xLE - sweep - ct * 0.4, r * 0.9], [xLE - sweep - ct, r * 0.9], [xLE - sweep - ct, 0]], 0.2).translate(0, wy, s * B), lv.tail);

    // Tail: fin and stabilizers (T-tail on aft-engine jets and turboprops).
    const tTail = lay === 'aft' || lay === 'turboprop' || lay === 'lifter';
    const fh = ty.span * (light ? 0.17 : lay === 'aft' ? 0.24 : 0.19);
    const fb = -L * 0.3;
    const fc = L * (light ? 0.16 : 0.2);
    add(fin([[fb, r * 0.4], [fb - fh * 0.75, r * 0.4 + fh], [fb - fh * 0.75 - fc * 0.45, r * 0.4 + fh], [fb - fc, r * 0.4]], Math.max(0.2, r * 0.14)), lv.tail);
    const hs = ty.span * (tTail ? 0.2 : 0.18);
    const hy = tTail ? r * 0.4 + fh * 0.95 : r * 0.25;
    const hx = tTail ? fb - fh * 0.7 : -L * 0.39;
    for (const w of wingPair(hx, hy, fc * 0.8, fc * 0.35, hs, hs * 0.45, 0.2)) add(w, tTail ? lv.tail : body);

    // Engines.
    const er = light ? 0 : r * (lay === 'aft' ? 0.36 : lay === 'turboprop' || lay === 'twinprop' ? 0.34 : 0.5);
    const podAt = (z: number) => {
      const xl = xLE - sweep * (Math.abs(z) / B);
      return xl + er * 1.2;
    };
    const jetPod = (x: number, y: number, z: number) => {
      add(tube(er, er * 0.85, er * 3.4, x, y, z), engine);
      add(new THREE.CylinderGeometry(er * 0.8, er * 0.8, 0.1, 10).rotateZ(-Math.PI / 2).translate(x + er * 1.72, y, z), dark);
    };
    const propPod = (x: number, y: number, z: number) => {
      add(tube(er * 0.7, er * 0.9, er * 3.2, x - er, y, z), body);
      add(new THREE.CylinderGeometry(er * 3.2, er * 3.2, 0.08, 16).rotateZ(-Math.PI / 2).translate(x + er * 0.7, y, z), '#4a4f57');
    };
    if (lay === 'jet' || lay === 'trijet') for (const z of [B * 0.34, -B * 0.34]) jetPod(podAt(z), wy - er * 1.1, z);
    if (lay === 'jet4' || lay === 'jumbo' || lay === 'a380' || lay === 'lifter') for (const z of [B * 0.34, -B * 0.34, B * 0.64, -B * 0.64]) jetPod(podAt(z), wy - er * 1.1, z);
    if (lay === 'trijet') jetPod(fb - fc * 0.35, r * 0.4 + fh * 0.18, 0);
    if (lay === 'aft') for (const z of [r + er * 1.2, -(r + er * 1.2)]) jetPod(-L * 0.24, r * 0.35, z);
    if (lay === 'turboprop' || lay === 'twinprop') for (const z of [B * 0.33, -B * 0.33]) propPod(xLE + er, wy + (high ? -er * 0.3 : er * 0.3), z);
    if (lay === 'single' || lay === 'singlelow') {
      add(new THREE.CylinderGeometry(B * 0.17, B * 0.17, 0.06, 16).rotateZ(-Math.PI / 2).translate(L * 0.5, 0, 0), '#4a4f57');
      add(new THREE.BoxGeometry(L * 0.35, 0.12, 0.12).translate(L * 0.05, -r * 1.5, r * 0.9), dark);
      add(new THREE.BoxGeometry(L * 0.35, 0.12, 0.12).translate(L * 0.05, -r * 1.5, -r * 0.9), dark);
    }
  }

  // Lights: red on the left wingtip, green on the right, white tail light; strobes and a red beacon blink.
  const lp: THREE.BufferGeometry[] = [];
  const st: THREE.BufferGeometry[] = [];
  const ls = Math.max(0.35, ty.span * 0.018);
  const tipX = lay === 'heli' ? 0 : L * 0.14 - (B * 0.5 * (ty.layout === 'jet' || ty.layout === 'jet4' ? 1 : 0.1)) - ty.span * 0.05;
  const tipY = lay === 'turboprop' || lay === 'single' || lay === 'lifter' ? r * 0.8 : lay === 'heli' ? 0 : -r * 0.6;
  const bulb = (x: number, y: number, z: number, c: string, into: THREE.BufferGeometry[], s = ls) => into.push(paint(new THREE.SphereGeometry(s, 6, 4).translate(x, y, z), c));
  if (lay !== 'heli') {
    bulb(tipX, tipY, -B, '#ff2a2a', lp);
    bulb(tipX, tipY, B, '#2aff5a', lp);
    bulb(tipX, tipY, -B, '#ffffff', st, ls * 1.3);
    bulb(tipX, tipY, B, '#ffffff', st, ls * 1.3);
  }
  bulb(-L * 0.5, r * 0.4, 0, '#ffffff', lp);
  bulb(0, r * (lay === 'a380' ? 1.35 : 1.05), 0, '#ff3a2a', st, ls * 1.2);
  return { body: mergeGeometries(parts), lights: mergeGeometries(lp), strobe: mergeGeometries(st) };
}

// ---------------------------------------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------------------------------------
export class PlaneLayer implements Layer {
  readonly group = new THREE.Group();
  readonly planes = new Map<string, LivePlane>();
  selected: LivePlane | null = null;
  enabled = true;
  source = '';
  onChange: () => void = () => {};
  private models = new Map<string, Built>();
  private bodyMat: THREE.MeshLambertMaterial;
  private lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#0b1a2a', transparent: true, opacity: 0.18, depthWrite: false });
  /** Contrails: one ribbon per plane, fading toward the tail, rebuilt each frame into a single mesh. */
  private trails: THREE.Mesh;
  private trailGeo = new THREE.BufferGeometry();
  private trailPos = new Float32Array(0);
  private trailCol = new Float32Array(0);
  /** The selected plane's route: flown track (solid) and the great-circle leg ahead to its destination (dashed). */
  private path: THREE.Mesh;
  private pathGeo = new THREE.BufferGeometry();
  private dest: THREE.Vector3 | null = null;
  private ring: THREE.Mesh;
  private timer = 0;
  private project: (lon: number, lat: number) => [number, number];
  private bounds: { minX: number; maxX: number; minY: number; maxY: number };
  private stopped = false;

  constructor(
    private world: World,
    private city: CityId,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
  ) {
    this.project = makeProjection(city).project;
    const padX = (bounds.maxX - bounds.minX) * 0.12;
    const padY = (bounds.maxY - bounds.minY) * 0.12;
    this.bounds = { minX: bounds.minX - padX, maxX: bounds.maxX + padX, minY: bounds.minY - padY, maxY: bounds.maxY + padY };
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // Glowing themes (neon, circuit) light the planes a little, like the trains.
    this.bodyMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, lookUniforms);
      applyToon(sh);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${LOOK_PARS}`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLk_trainGlow * 0.35;');
    };
    this.bodyMat.customProgramCacheKey = () => 'plane-body';
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
    this.ring.visible = false;
    this.group.add(this.ring);
    this.trails = new THREE.Mesh(this.trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.trails.frustumCulled = false;
    this.trails.renderOrder = 5;
    this.path = new THREE.Mesh(this.pathGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.path.frustumCulled = false;
    this.path.renderOrder = 6;
    this.group.add(this.trails, this.path);
    this.group.renderOrder = 4;
    void this.poll();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.group.visible = on;
    if (!on) this.select(null);
    if (on) void this.poll();
  }

  private async poll() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.poll(), POLL_MS);
    if (!this.enabled || document.hidden) return;
    try {
      const r = await fetch(`/api/${this.city}/planes`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { planes: Plane[]; now: number; source: string };
      if (this.stopped) return;
      this.source = j.source;
      this.ingest(j.planes, j.now);
    } catch {
      this.source = '';
    }
    this.onChange();
  }

  private ingest(list: Plane[], now: number) {
    const seen = new Set<string>();
    for (const p of list) {
      const [x, y] = this.project(p.lon, p.lat);
      if (x < this.bounds.minX || x > this.bounds.maxX || y < this.bounds.minY || y > this.bounds.maxY) continue;
      seen.add(p.hex);
      const fix = { x, y, t: now - p.age * 1000 };
      let lp = this.planes.get(p.hex);
      if (!lp) {
        lp = this.create(p, fix);
        this.planes.set(p.hex, lp);
      } else {
        // A type or callsign that arrives later (or changes) rebuilds the model.
        if (p.t !== lp.data.t || p.cs.slice(0, 3) !== lp.data.cs.slice(0, 3)) this.remodel(lp, p);
        lp.data = p;
        lp.fix = fix;
        lp.missing = 0;
      }
    }
    for (const [hex, lp] of this.planes) if (!seen.has(hex)) lp.missing++;
  }

  private model(ty: AircraftType, lv: Livery) {
    const key = `${ty.name}|${lv.body}|${lv.tail}|${lv.accent}|${lv.full ? 1 : 0}`;
    let m = this.models.get(key);
    if (!m) this.models.set(key, (m = buildModel(ty, lv)));
    return m;
  }

  private create(p: Plane, fix: LivePlane['fix']): LivePlane {
    const type = aircraftFor(p.t, p.cat);
    const livery = liveryFor(p.cs, p.hex);
    const m = this.model(type, livery);
    const group = new THREE.Group();
    const body = new THREE.Mesh(m.body, this.bodyMat);
    body.castShadow = false;
    const lights = new THREE.Mesh(m.lights, this.lightMat);
    const strobe = new THREE.Mesh(m.strobe, this.lightMat);
    group.add(body, lights, strobe);
    const shadow = new THREE.Mesh(m.body, this.shadowMat);
    shadow.renderOrder = 3;
    this.group.add(group, shadow);
    const heading = Math.PI / 2 - (p.trk * Math.PI) / 180;
    const pos = new THREE.Vector3(fix.x, displayY(p.alt), -fix.y);
    return { data: p, type, livery, group, body, strobe, shadow, fix, pos, heading, bank: 0, pitch: 0, fade: 0, missing: 0, phase: Math.random() * 10, trail: [], trailAt: 0 };
  }

  private remodel(lp: LivePlane, p: Plane) {
    lp.type = aircraftFor(p.t, p.cat);
    lp.livery = liveryFor(p.cs, p.hex);
    const m = this.model(lp.type, lp.livery);
    lp.body.geometry = m.body;
    (lp.group.children[1] as THREE.Mesh).geometry = m.lights;
    lp.strobe.geometry = m.strobe;
    lp.shadow.geometry = m.body;
  }

  /** The plane's size multiplier at this zoom (toy exaggeration, like the trains). */
  static scaleFor(mpp: number) {
    return THREE.MathUtils.clamp(mpp * 1.3, 1.8, 18);
  }

  update(f: FrameInfo) {
    if (!this.enabled) return;
    const now = f.now;
    const s = PlaneLayer.scaleFor(f.mpp);
    const k = 1 - Math.exp(-f.dt * 2.5);
    const t = f.time;
    for (const [hex, lp] of this.planes) {
      const d = lp.data;
      // Dead reckoning from the last fix (at most 40 s ahead).
      const dtS = THREE.MathUtils.clamp((now - lp.fix.t) / 1000, 0, 40);
      const v = d.gs * 0.514444;
      const trk = (d.trk * Math.PI) / 180;
      const tx = lp.fix.x + Math.sin(trk) * v * dtS;
      const ty = lp.fix.y + Math.cos(trk) * v * dtS;
      const alt = d.gnd ? 0 : Math.max(0, d.alt + (d.vr / 60) * dtS);
      const target = new THREE.Vector3(tx, d.gnd ? 4 : displayY(alt), -ty);
      if (lp.fade === 0) lp.pos.copy(target);
      else lp.pos.lerp(target, k);
      // Heading eases toward the track; the difference becomes a bank.
      const want = Math.PI / 2 - trk;
      let dh = want - lp.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      lp.heading += dh * k;
      lp.bank += (THREE.MathUtils.clamp(-dh * 1.8, -0.45, 0.45) - lp.bank) * k;
      const climb = v > 20 ? Math.atan2(d.vr * 0.00508, v) * 1.6 : 0;
      lp.pitch += (THREE.MathUtils.clamp(climb, -0.2, 0.25) - lp.pitch) * k;
      // Fade in on arrival; out when the feed has lost it for two polls.
      const gone = lp.missing >= 2;
      lp.fade = THREE.MathUtils.clamp(lp.fade + (gone ? -f.dt : f.dt) * 1.5, 0, 1);
      if (gone && lp.fade <= 0) {
        this.group.remove(lp.group, lp.shadow);
        this.planes.delete(hex);
        if (this.selected === lp) this.select(null);
        continue;
      }
      const sc = s * (0.001 + lp.fade * 0.999);
      const last = lp.trail[lp.trail.length - 1];
      if (f.time - lp.trailAt > 0.5 && lp.fade > 0.5 && (!last || last.distanceToSquared(lp.pos) > 400)) {
        lp.trailAt = f.time;
        lp.trail.push(lp.pos.clone());
        const max = lp === this.selected ? 1800 : TRAIL_N;
        if (lp.trail.length > max) lp.trail.splice(0, lp.trail.length - max);
      }
      lp.group.position.copy(lp.pos);
      lp.group.rotation.set(lp.bank, lp.heading, lp.pitch, 'YZX');
      lp.group.scale.setScalar(sc);
      lp.strobe.visible = ((t + lp.phase) % 1.2) < 0.08;
      // Shadow: flattened onto the ground under the plane, fainter the higher it flies.
      const hFrac = THREE.MathUtils.clamp(lp.pos.y / 900, 0, 1);
      lp.shadow.visible = hFrac < 0.95;
      lp.shadow.position.set(lp.pos.x, 3, lp.pos.z);
      lp.shadow.rotation.set(0, lp.heading, 0);
      lp.shadow.scale.set(sc * (1 + hFrac * 0.4), 0.02, sc * (1 + hFrac * 0.4));
    }
    this.buildTrails(f);
    this.buildPath(f);
    this.shadowMat.opacity = 0.2 * (1 - f.night * 0.6);
    const sel = this.selected;
    this.ring.visible = !!sel;
    if (sel) {
      this.ring.position.copy(sel.pos);
      this.ring.scale.setScalar(Math.max(sel.type.span, sel.type.len) * 0.75 * s);
      (this.ring.material as THREE.MeshBasicMaterial).color.setHSL(0.13, 1, 0.55 + 0.1 * Math.sin(t * 5));
    }
  }

  /** Ribbons behind every plane: widest and brightest at the plane, fading over ~70 s of history. */
  private buildTrails(f: FrameInfo) {
    const w = Math.max(6, f.mpp * 6.5);
    let n = 0;
    for (const lp of this.planes.values()) if (lp.trail.length > 1 && lp !== this.selected) n += Math.min(lp.trail.length, TRAIL_N) + 1; // + the plane itself
    const need = n * 2 * 3;
    if (this.trailPos.length < need) {
      this.trailPos = new Float32Array(need * 1.5);
      this.trailCol = new Float32Array((need / 3) * 4 * 1.5);
      this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
      this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    }
    const idx: number[] = [];
    let v = 0;
    // A sky-blue vapor by day (white would vanish on pale land), pale silver at night.
    const white = f.night > 0.5 ? [0.85, 0.9, 1] : [0.2, 0.42, 0.86];
    for (const lp of this.planes.values()) {
      if (lp.trail.length < 2 || lp === this.selected) continue;
      const pts = lp.trail.slice(-TRAIL_N);
      pts.push(lp.pos);
      const start = v;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const t = i / (pts.length - 1); // 0 oldest .. 1 at the plane
        const hw = w * (0.25 + 0.75 * t) * 0.5;
        const p = pts[i];
        for (const side of [-1, 1]) {
          this.trailPos.set([p.x - dz * hw * side, p.y, p.z + dx * hw * side], v * 3);
          this.trailCol.set([white[0], white[1], white[2], (0.15 + 0.75 * t) * lp.fade], v * 4);
          v++;
        }
        if (i > 0) {
          const q = start + (i - 1) * 2;
          idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
        }
      }
    }
    this.trailGeo.setIndex(idx);
    this.trailGeo.setDrawRange(0, idx.length);
    if (this.trailGeo.getAttribute('position')) {
      (this.trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.trailGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }
    this.trails.visible = idx.length > 0;
  }

  /** Where to draw the selected flight heading: its destination airport, if known (map coordinates). */
  setDestination(lon: number | null, lat: number | null) {
    if (lon === null || lat === null) {
      this.dest = null;
      return;
    }
    const [x, y] = this.project(lon, lat);
    this.dest = new THREE.Vector3(x, 0, -y);
  }

  /** The selected plane's path: everything flown since it was picked (a solid ribbon in the livery's color) and a
   * dashed line ahead to its destination, descending to the ground there. */
  private buildPath(f: FrameInfo) {
    const sel = this.selected;
    if (!sel) {
      this.path.visible = false;
      return;
    }
    const w = Math.max(6, f.mpp * 4.5);
    const col = new THREE.Color(sel.livery.name ? sel.livery.tail : '#ffd23f');
    if (col.getHSL({ h: 0, s: 0, l: 0 }).l > 0.85) col.set('#ffd23f');
    const pos: number[] = [];
    const cols: number[] = [];
    const idx: number[] = [];
    const ribbon = (pts: THREE.Vector3[], alpha: (t: number, i: number) => number) => {
      const start = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const p = pts[i];
        const al = alpha(i / Math.max(1, pts.length - 1), i);
        for (const side of [-1, 1]) {
          pos.push(p.x - dz * w * 0.5 * side, p.y, p.z + dx * w * 0.5 * side);
          cols.push(col.r, col.g, col.b, al);
        }
        if (i > 0) {
          const q = start + (i - 1) * 2;
          idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
        }
      }
    };
    // Behind: the recorded track.
    const behind = [...sel.trail, sel.pos];
    if (behind.length > 1) ribbon(behind, (t) => 0.25 + 0.6 * t);
    // Ahead: a great circle is close to straight at this scale; descend toward the airport, dashed.
    if (this.dest) {
      const ahead: THREE.Vector3[] = [];
      const from = sel.pos;
      const d = Math.hypot(this.dest.x - from.x, this.dest.z - from.z);
      const reach = Math.min(d, 160_000);
      const steps = Math.max(8, Math.min(200, Math.round(reach / (f.mpp * 10))));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + ((this.dest.x - from.x) * t * reach) / d;
        const z = from.z + ((this.dest.z - from.z) * t * reach) / d;
        const y = reach < d ? from.y : from.y * (1 - t) + 6 * t;
        ahead.push(new THREE.Vector3(x, y, z));
      }
      ribbon(ahead, (t, i) => (i % 2 === 0 ? 0.8 : 0.0) * (1 - t * 0.6));
    }
    this.pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.pathGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
    this.pathGeo.setIndex(idx);
    this.path.visible = idx.length > 0;
  }

  pick(px: number, py: number, radiusPx = 20): LivePlane | null {
    if (!this.enabled) return null;
    let best: LivePlane | null = null;
    let bd = radiusPx;
    const v = new THREE.Vector2();
    for (const lp of this.planes.values()) {
      if (lp.fade < 0.5) continue;
      this.world.rig.toScreen(lp.pos, v);
      const dd = Math.hypot(v.x - px, v.y - py);
      if (dd < bd) {
        bd = dd;
        best = lp;
      }
    }
    return best;
  }

  select(lp: LivePlane | null) {
    if (lp !== this.selected) this.dest = null;
    this.selected = lp;
    this.onChange();
  }

  /** The ground point under a plane (for the camera to follow). */
  groundUnder(lp: LivePlane) {
    return new THREE.Vector3(lp.pos.x, 0, lp.pos.z);
  }

  dispose() {
    this.stopped = true;
    clearTimeout(this.timer);
    for (const m of this.models.values()) {
      m.body.dispose();
      m.lights.dispose();
      m.strobe.dispose();
    }
    this.models.clear();
    this.planes.clear();
  }
}
