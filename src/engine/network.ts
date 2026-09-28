import * as THREE from 'three';
import { STOCK } from '../../shared/stock/index.ts';
import { LOOK_PARS, lookUniforms } from '../themes/look.ts';
import type { CityId, LineDef, SegmentDef, StationDef, TransitData } from '../../shared/types.ts';
import { buildRibbons, RIBBON_VERT_MAIN, RIBBON_VERT_PARS } from './ribbon.ts';
import { groundUniforms, NORMAL_UP } from './island.ts';
import type { FrameInfo, Layer } from './world.ts';

/** Height of ribbons/trains above the ground plane. */
export const TRACK_Y = 1.8;
/** Elevated structure height (meters, before exaggeration). */
export const ELEV_H = 11;

export const netUniforms = {
  uLaneW: { value: 10 },
  uHalfW: { value: 4.5 },
  uElevH: { value: ELEV_H },
  uDetail: { value: 0 },
  uScale: { value: 1 },
  uLen: { value: 1 },
  uTrackOff: { value: 1.6 },
  uFocusCols: { value: Array.from({ length: 16 }, () => new THREE.Vector3(-1, -1, -1)) },
  uFocusN: { value: 0 },
};

export interface SegRec {
  seg: SegmentDef;
  x: Float32Array; // world x
  z: Float32Array; // world z
  el: Float32Array;
  cum: Float32Array;
  len: number;
  colors: string[]; // band colors, left→right relative to the canonical direction
  lane: Map<string, number>; // line id → lane offset (in lane units)
}

export interface PathPiece {
  x: Float32Array;
  z: Float32Array;
  el: Float32Array;
  lane: number; // lane offset in lane units, relative to the direction of travel (+ = right)
}

const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

export class Network implements Layer {
  readonly group = new THREE.Group();
  readonly lines = new Map<string, LineDef>();
  readonly stations = new Map<string, StationDef & { pos: THREE.Vector3 }>();
  readonly segs: SegRec[] = [];
  private byPair = new Map<string, SegRec[]>();
  private byStation = new Map<string, SegRec[]>();
  readonly leftHand: boolean;
  private platforms!: THREE.InstancedMesh;
  private canopies!: THREE.InstancedMesh;
  private pillars: THREE.InstancedMesh | null = null;
  private dots!: THREE.InstancedMesh;
  private dotMat!: THREE.MeshBasicMaterial;
  /** Far-zoom dots: one per station complex, busiest first (for decluttering). */
  private dotSpots: { pos: THREE.Vector3; lines: number }[] = [];
  private dotKey = '';
  private platformDefs: {
    x: number;
    z: number;
    angle: number;
    width: number;
    station: string;
    color: THREE.Color;
    side: number;
    el: number;
    tier: number;
    lines: string[];
    covered: boolean;
    /** How far the track runs straight along the platform axis from the center, back (≤ 0) and ahead (≥ 0). */
    tMin: number;
    tMax: number;
  }[] = [];
  /** Longest real train (meters, unscaled) seen on each line; platforms are sized to fit it. */
  private trainLen = new Map<string, number>();
  private lastScale = -1;

  constructor(
    readonly city: CityId,
    readonly data: TransitData,
  ) {
    this.leftHand = city === 'london' || city === 'tokyo';
    const order = new Map<string, number>();
    data.lines.forEach((l, i) => {
      this.lines.set(l.id, l);
      order.set(l.id, i);
    });
    for (const s of data.stations) this.stations.set(s.id, { ...s, pos: new THREE.Vector3(s.x, TRACK_Y, -s.y) });
    for (const seg of data.segments) {
      const n = seg.pts.length / 2;
      if (n < 2) continue;
      const x = new Float32Array(n);
      const z = new Float32Array(n);
      const el = new Float32Array(n);
      const cum = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = seg.pts[i * 2];
        z[i] = -seg.pts[i * 2 + 1];
        el[i] = seg.el ? seg.el[i] : 0;
        if (i) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
      }
      const lines = seg.lines.filter((l) => this.lines.has(l)).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      const colors: string[] = [];
      for (const l of lines) {
        const c = this.lines.get(l)!.color.toLowerCase();
        if (!colors.includes(c)) colors.push(c);
      }
      if (!colors.length) colors.push('#888888');
      const lane = new Map<string, number>();
      for (const l of lines) lane.set(l, colors.indexOf(this.lines.get(l)!.color.toLowerCase()) - (colors.length - 1) / 2);
      const rec: SegRec = { seg, x, z, el, cum, len: cum[n - 1], colors, lane };
      this.segs.push(rec);
      const k = key(seg.from, seg.to);
      if (!this.byPair.has(k)) this.byPair.set(k, []);
      this.byPair.get(k)!.push(rec);
      for (const s of [seg.from, seg.to]) {
        if (!this.byStation.has(s)) this.byStation.set(s, []);
        this.byStation.get(s)!.push(rec);
      }
    }
    this.buildTracks();
    this.buildStations();
    this.buildPillars();
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------
  private buildTracks() {
    // Ribbons are drawn in one pass without writing depth, in a fixed priority order: tunnels, then
    // surface, then elevated; within a level, by line. The GPU rasterizes in submission order, so
    // wherever ribbons cross or run parallel the same one always wins: no z-fighting at any zoom.
    const lineRank = new Map(this.data.lines.map((l, i) => [l.color.toLowerCase(), i]));
    const inputs: { pts: number[]; color: THREE.Color; lane: number; elev: Float32Array; kind: number; prio: number }[] = [];
    for (const r of this.segs) {
      const pts = r.seg.pts;
      let level = 0;
      for (const e of r.el) level = Math.max(level, Math.round(e));
      for (let i = 0; i < r.colors.length; i++) {
        inputs.push({
          pts,
          color: new THREE.Color(r.colors[i]),
          lane: i - (r.colors.length - 1) / 2,
          elev: r.el,
          kind: 0,
          prio: (level + 1) * 1000 - (lineRank.get(r.colors[i]) ?? 999),
        });
      }
    }
    inputs.sort((a, b) => a.prio - b.prio);
    const geo = buildRibbons(inputs, TRACK_Y);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, netUniforms, groundUniforms, lookUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${RIBBON_VERT_PARS}`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `${RIBBON_VERT_MAIN}\nvec3 transformed = rp;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <normal_fragment_begin>', NORMAL_UP)
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying float vSide; varying float vDist; varying float vKind; varying float vElev;
          uniform float uDetail; uniform float uHalfW; uniform float uScale; uniform float uTrackOff;
          uniform vec3 uFocusCols[16]; uniform int uFocusN; uniform float uNight;
          ${LOOK_PARS}`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec3 lineCol = diffuseColor.rgb;
          vec3 inkCol = mix(lineCol, vec3(1.0), uLk_lineWhite);
          float a = abs(vSide);
          vec3 far = mix(inkCol, inkCol * 0.78, smoothstep(0.78, 1.0, a));
          // Diagram styles case each line: at least ~1.3 px (or 12% of the ribbon) of casing color along both edges,
          // dropped once a line is only a few pixels wide so thin far-away lines keep all of their color.
          float caseFw = fwidth(a);
          float caseW = clamp(1.3 * caseFw, 0.12, 0.4);
          float caseOn = smoothstep(2.5, 5.0, 1.0 / max(caseFw, 1e-3)) * uLk_lineCaseK;
          far = mix(far, uLk_lineCase, smoothstep(1.0 - caseW - caseFw, 1.0 - caseW, a) * caseOn);
          // Close up: ballast, sleepers and rails, with the line color kept as edge stripes.
          float across = vSide * uHalfW;
          float gauge = 1.435 * uScale;
          float tDist = min(abs(across - uTrackOff), abs(across + uTrackOff));
          bool tunnel = vElev < -0.5;
          vec3 ballast = tunnel ? vec3(0.56, 0.55, 0.58) : vec3(0.74, 0.70, 0.66);
          vec3 near = ballast;
          float sleeperZone = 1.0 - step(gauge * 0.95, tDist);
          float sleeper = step(fract(vDist / (0.62 * uScale)), 0.42);
          near = mix(near, tunnel ? vec3(0.36, 0.32, 0.3) : vec3(0.48, 0.34, 0.24), sleeperZone * sleeper);
          float rail = 1.0 - smoothstep(0.05 * uScale, 0.1 * uScale, abs(tDist - gauge * 0.5));
          near = mix(near, vec3(0.86, 0.88, 0.92), rail);
          near = mix(near, inkCol, smoothstep(0.8, 0.86, a));
          diffuseColor.rgb = mix(far, near, uDetail * uLk_lineDetail);
          // Glowing styles light the line from within; a dim lit surface keeps overlaps from summing to white.
          diffuseColor.rgb *= 1.0 - 0.75 * uLk_lineGlow;
          float focusHit = 0.0;
          for (int i = 0; i < 16; i++) {
            if (i >= uFocusN) break;
            if (distance(lineCol, uFocusCols[i]) < 0.02) focusHit = 1.0;
          }
          if (uFocusN > 0 && focusHit < 0.5) {
            // Other lines fade to a pale wash so even gray lines (L, Jubilee) stand out when focused.
            float g = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(g) * 0.3 + mix(vec3(0.62), vec3(0.2, 0.24, 0.36), uNight), 0.82);
          } else if (uFocusN > 0) {
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, smoothstep(0.7, 0.9, a) * (1.0 - uDetail));
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += inkCol * max(uNight, uLk_lineGlow) * mix(mix(0.75, 0.25, uDetail * uLk_lineDetail), 0.72, uLk_lineGlow) * (uFocusN > 0 ? mix(0.25, 1.6, focusHit) : 1.0);',
        );
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }

  /**
   * Side platforms for each station: one pair per group of tracks that arrive in the same direction at the
   * same spot. Each pair sits on the actual track (a station's point can be the middle of a big interchange),
   * is as long as the longest train that stops there, and only gets a roof above ground.
   */
  private buildStations() {
    type Group = {
      angle: number;
      bands: number;
      color: string;
      el: number;
      minEl: number;
      sx: number;
      sz: number;
      n: number;
      lines: Set<string>;
      ends: { r: SegRec; atStart: boolean }[];
    };
    for (const st of this.stations.values()) {
      const recs = this.byStation.get(st.id) ?? [];
      const groups: Group[] = [];
      for (const r of recs) {
        const atStart = r.seg.from === st.id;
        const n = r.x.length;
        const i0 = atStart ? 0 : n - 1;
        const rawEl = r.el[i0];
        // Direction of the track leaving the station, measured ~40 m out.
        let j = i0;
        const target = 40;
        if (atStart) while (j < n - 1 && r.cum[j] < target) j++;
        else while (j > 0 && r.len - r.cum[j] < target) j--;
        let dx = r.x[j] - r.x[i0];
        let dz = r.z[j] - r.z[i0];
        if (!atStart) {
          dx = -dx;
          dz = -dz;
        }
        let angle = Math.atan2(dz, dx);
        if (angle < 0) angle += Math.PI;
        if (angle >= Math.PI) angle -= Math.PI;
        const px = r.x[i0];
        const pz = r.z[i0];
        const found = groups.find((g) => {
          const diff = Math.abs(g.angle - angle);
          return Math.min(diff, Math.PI - diff) < 0.45 && Math.hypot(g.sx / g.n - px, g.sz / g.n - pz) < 45;
        });
        if (found) {
          found.bands = Math.max(found.bands, r.colors.length);
          found.el = Math.max(found.el, Math.max(0, rawEl));
          found.minEl = Math.min(found.minEl, rawEl);
          found.sx += px;
          found.sz += pz;
          found.n++;
          for (const l of r.seg.lines) found.lines.add(l);
          found.ends.push({ r, atStart });
        } else
          groups.push({
            angle,
            bands: r.colors.length,
            color: r.colors[0],
            el: Math.max(0, rawEl),
            minEl: rawEl,
            sx: px,
            sz: pz,
            n: 1,
            lines: new Set(r.seg.lines),
            ends: [{ r, atStart }],
          });
      }
      if (!groups.length) {
        const l = this.lines.get(st.lines[0]);
        groups.push({ angle: 0, bands: 1, color: l?.color ?? '#888888', el: 0, minEl: 0, sx: st.x, sz: -st.y, n: 1, lines: new Set(st.lines), ends: [] });
      }
      for (const g of groups) {
        // Walk each track out from the station while it stays close to the platform axis: platforms may only
        // cover straight track that exists (not past a terminus, not off into a curve).
        const cx = g.sx / g.n;
        const cz = g.sz / g.n;
        const ux = Math.cos(g.angle);
        const uz = Math.sin(g.angle);
        let tMin = 0;
        let tMax = 0;
        for (const { r, atStart } of g.ends) {
          const n = r.x.length;
          for (let k = 0; k < n; k++) {
            const i = atStart ? k : n - 1 - k;
            const dx = r.x[i] - cx;
            const dz = r.z[i] - cz;
            const t = dx * ux + dz * uz;
            if (Math.abs(dx * uz - dz * ux) > 8 || Math.abs(t) > 220) break;
            tMin = Math.min(tMin, t);
            tMax = Math.max(tMax, t);
          }
        }
        if (!g.ends.length) (tMin = -60), (tMax = 60);
        for (const side of [-1, 1]) {
          this.platformDefs.push({
            x: g.sx / g.n,
            z: g.sz / g.n,
            angle: g.angle,
            width: g.bands,
            station: st.id,
            color: new THREE.Color(g.color),
            side,
            el: g.el,
            tier: 0,
            lines: [...g.lines],
            // Underground platforms have no roof over them.
            covered: g.minEl > -0.5,
            tMin,
            tMax,
          });
        }
      }
    }
    this.assignPlatformTiers();
    // Platform: white deck with a gray rim. Canopy: roof in line color on two posts.
    const deck = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const platMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    this.platforms = new THREE.InstancedMesh(deck, platMat, this.platformDefs.length);
    // Surface platforms are bright decks; underground ones are low, stone-colored strips that mark the
    // station without piling up where lines cross.
    const deckCol = new THREE.Color('#fbfaf5');
    const belowCol = new THREE.Color('#d3cdc2');
    this.platformDefs.forEach((p, i) => this.platforms.setColorAt(i, p.covered ? deckCol : belowCol));
    this.platforms.castShadow = true;
    this.platforms.receiveShadow = true;
    // A slim roof with a little ridge on four posts.
    const roof = new THREE.BoxGeometry(1, 0.05, 1).translate(0, 1, 0);
    const ridge = new THREE.BoxGeometry(1, 0.08, 0.18).translate(0, 1.05, 0);
    const posts = new THREE.BoxGeometry(0.012, 1, 0.06).translate(0, 0.5, 0);
    const canopyGeo = mergeBoxes([
      roof,
      ridge,
      ...[-0.36, -0.12, 0.12, 0.36].map((x) => posts.clone().translate(x, 0, 0)),
    ]);
    this.canopies = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), this.platformDefs.length);
    this.canopies.castShadow = true;
    this.platformDefs.forEach((p, i) => this.canopies.setColorAt(i, p.color.clone().lerp(new THREE.Color('#ffffff'), 0.18)));
    this.group.add(this.platforms, this.canopies);

    // Far away, stations become classic transit-map dots: white with a dark rim.
    const disc = new THREE.CylinderGeometry(1, 1, 1, 20).translate(0, 0.5, 0);
    const rim = new THREE.CylinderGeometry(1.32, 1.32, 0.9, 20).translate(0, 0.45, 0);
    const paint = (g: THREE.BufferGeometry, c: number) => {
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(c), 3));
      return g;
    };
    const dotGeo = mergeBoxes([paint(disc, 1), paint(rim, 0.16)]);
    this.dotMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    // Glowing styles dim the dots a little so they sit under the bloom and the lines stay the brighter mark.
    this.dotMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, lookUniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${LOOK_PARS}`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.4 * uLk_lineGlow;');
    };
    this.dotMat.customProgramCacheKey = () => 'station-dots';
    // Stations within a short walk of each other (one complex split into several ids, like Châtelet) share a
    // single dot, placed at their middle; interchanges are drawn a little bigger.
    const all = [...this.stations.values()];
    const parent = all.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const CELL = 150;
    const grid = new Map<string, number[]>();
    all.forEach((st, i) => {
      const cx = Math.floor(st.x / CELL);
      const cy = Math.floor(st.y / CELL);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const j of grid.get(`${cx + a},${cy + b}`) ?? []) if (Math.hypot(all[j].x - st.x, all[j].y - st.y) < CELL) parent[find(i)] = find(j);
      const k = `${cx},${cy}`;
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    });
    const clusters = new Map<number, { sx: number; sz: number; n: number; lines: Set<string> }>();
    all.forEach((st, i) => {
      const r = find(i);
      let c = clusters.get(r);
      if (!c) clusters.set(r, (c = { sx: 0, sz: 0, n: 0, lines: new Set() }));
      c.sx += st.pos.x;
      c.sz += st.pos.z;
      c.n++;
      for (const l of st.lines) c.lines.add(l);
    });
    this.dotSpots = [...clusters.values()]
      .map((c) => ({ pos: new THREE.Vector3(c.sx / c.n, TRACK_Y, c.sz / c.n), lines: c.lines.size }))
      .sort((a, b) => b.lines - a.lines);
    this.dots = new THREE.InstancedMesh(dotGeo, this.dotMat, this.dotSpots.length);
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;
    this.group.add(this.dots);
  }

  private buildPillars() {
    const spots: THREE.Vector3[] = [];
    for (const r of this.segs) {
      if (!r.seg.el?.some((v) => v > 0.5)) continue;
      const spacing = 60;
      for (let d = spacing / 2; d < r.len; d += spacing) {
        const p = this.sampleSeg(r, d);
        if (p.el > 0.6) spots.push(new THREE.Vector3(p.x, p.el, p.z));
      }
    }
    if (!spots.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: '#cdbfae' });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, netUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uElevH;\nuniform float uLaneW;')
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x * uLaneW * 0.28, position.y * uElevH, position.z * uLaneW * 0.28);');
    };
    this.pillars = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach((s, i) => {
      m.makeTranslation(s.x, 0, s.z);
      this.pillars!.setMatrixAt(i, m);
    });
    this.pillars.castShadow = false;
    this.pillars.receiveShadow = true;
    this.pillars.frustumCulled = false;
    this.group.add(this.pillars);
  }

  private sampleSeg(r: SegRec, d: number) {
    let i = 1;
    while (i < r.cum.length - 1 && r.cum[i] < d) i++;
    const t = (d - r.cum[i - 1]) / Math.max(1e-6, r.cum[i] - r.cum[i - 1]);
    return {
      x: r.x[i - 1] + (r.x[i] - r.x[i - 1]) * t,
      z: r.z[i - 1] + (r.z[i] - r.z[i - 1]) * t,
      el: r.el[i - 1] + (r.el[i] - r.el[i - 1]) * t,
    };
  }

  /**
   * Platforms of different lines that cross or overlap (Powell St: cable car over BART/Muni) would share a
   * deck height and z-fight. Give each station-direction group the lowest height tier not used by a
   * different group nearby, so overlapping decks and canopies stack instead.
   */
  private assignPlatformTiers() {
    const CELL = 200;
    const grid = new Map<string, number[]>();
    const tiers = new Map<string, number>();
    const group = (p: { station: string; angle: number }) => `${p.station}|${p.angle.toFixed(3)}`;
    this.platformDefs.forEach((p, i) => {
      const k = group(p);
      const cx = Math.floor(p.x / CELL);
      const cz = Math.floor(p.z / CELL);
      if (!tiers.has(k)) {
        const used = new Set<number>();
        for (let a = -1; a <= 1; a++)
          for (let b = -1; b <= 1; b++)
            for (const j of grid.get(`${cx + a},${cz + b}`) ?? []) {
              const q = this.platformDefs[j];
              if (group(q) !== k && Math.abs(q.el - p.el) < 0.5 && Math.hypot(q.x - p.x, q.z - p.z) < 170) used.add(q.tier);
            }
        let t = 0;
        while (used.has(t)) t++;
        tiers.set(k, t);
      }
      p.tier = tiers.get(k)!;
      const key = `${cx},${cz}`;
      const list = grid.get(key);
      if (list) list.push(i);
      else grid.set(key, [i]);
    });
  }

  private layoutStations(scale: number, laneW: number) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const lenK = netUniforms.uLen.value;
    const platW = Math.max(2.2 * scale, laneW * 0.22);
    const need = new Map<string, number>();
    const deckH = 1.1 * scale;
    this.platformDefs.forEach((p, i) => {
      // As long as the longest train that stops here (drawn length), plus a little room at each end.
      let real = 0;
      for (const l of p.lines) {
        let v = need.get(l);
        if (v === undefined) need.set(l, (v = this.trainLength(l)));
        real = Math.max(real, v);
      }
      let platLen = Math.min(320, real * lenK * 1.04 + 3 * scale);
      // Fit inside the straight stretch of track, as centered on the station as it allows (a little overhang
      // is fine: the track's own drawing is wider than its centerline).
      const room = p.tMax - p.tMin + 2 * scale;
      if (platLen > room) platLen = Math.max(room, Math.min(platLen, 20 * scale));
      const start = THREE.MathUtils.clamp(-platLen / 2, p.tMin - scale, p.tMax + scale - platLen);
      const along = start + platLen / 2;
      const bandW = p.width * laneW;
      const h = p.covered ? deckH : deckH * 0.35;
      const off = (bandW / 2 + platW / 2 + laneW * 0.05) * p.side;
      // Lateral direction (perpendicular to the track).
      const lx = -Math.sin(p.angle);
      const lz = Math.cos(p.angle);
      const cx = p.x + Math.cos(p.angle) * along;
      const cz = p.z + Math.sin(p.angle) * along;
      q.setFromAxisAngle(up, -p.angle);
      const y0 = TRACK_Y - 0.4 + p.el * netUniforms.uElevH.value + p.tier * 0.35 * scale;
      m.compose(new THREE.Vector3(cx + lx * off, y0, cz + lz * off), q, new THREE.Vector3(platLen, h, platW * (p.covered ? 1 : 0.8)));
      this.platforms.setMatrixAt(i, m);
      if (p.covered) m.compose(new THREE.Vector3(cx + lx * off, y0 + deckH, cz + lz * off), q, new THREE.Vector3(platLen * 0.7, 2.5 * scale, platW * 0.95));
      else m.makeScale(0, 0, 0);
      this.canopies.setMatrixAt(i, m);
    });
    this.platforms.instanceMatrix.needsUpdate = true;
    this.canopies.instanceMatrix.needsUpdate = true;
    this.platforms.computeBoundingSphere();
    this.canopies.computeBoundingSphere();
  }

  /**
   * Far-zoom station dots: a few pixels across, shrinking as you zoom out, and never overlapping. Busier
   * stations are placed first; a quieter one whose dot would touch an already placed dot is left out.
   */
  private layoutDots(mpp: number) {
    const key = (Math.round(Math.log2(mpp) * 24) / 24).toFixed(3);
    if (key === this.dotKey) return;
    this.dotKey = key;
    // Pixel radius: ~3.2 px near the switch-over, easing to ~2.3 px zoomed right out (still clearly wider than
    // the line under it, so a dot never reads as a dash).
    const k = THREE.MathUtils.clamp(1 - 0.12 * Math.log2(mpp / 3.2), 0.72, 1);
    const placed: { x: number; z: number; r: number }[] = [];
    const CELL = 13 * mpp; // ≥ the largest clash distance, so neighbors are always in the 3×3 cells
    const grid = new Map<string, number[]>();
    const m = new THREE.Matrix4();
    this.dotSpots.forEach((d, i) => {
      const px = (d.lines > 1 ? 4.2 : 3.2) * k; // interchanges a touch bigger
      const r = px * mpp;
      const gx = Math.floor(d.pos.x / CELL);
      const gz = Math.floor(d.pos.z / CELL);
      let clash = false;
      for (let a = -1; a <= 1 && !clash; a++)
        for (let b = -1; b <= 1 && !clash; b++)
          for (const j of grid.get(`${gx + a},${gz + b}`) ?? []) {
            const q = placed[j];
            // Rims are 1.32× the disc; keep a pixel of air between them.
            if (Math.hypot(q.x - d.pos.x, q.z - d.pos.z) < (q.r + r) * 1.32 + mpp) {
              clash = true;
              break;
            }
          }
      if (clash) {
        m.makeScale(0, 0, 0);
      } else {
        placed.push({ x: d.pos.x, z: d.pos.z, r });
        const kk = `${gx},${gz}`;
        const list = grid.get(kk);
        if (list) list.push(placed.length - 1);
        else grid.set(kk, [placed.length - 1]);
        m.makeScale(r, 3, r).setPosition(d.pos.x, TRACK_Y + 0.6, d.pos.z);
      }
      this.dots.setMatrixAt(i, m);
    });
    this.dots.instanceMatrix.needsUpdate = true;
  }

  /** Real length (m) of the longest train seen on a line; before any show up, a typical train of its stock. */
  private trainLength(line: string) {
    const seen = this.trainLen.get(line);
    if (seen) return seen;
    const l = this.lines.get(line);
    const spec = l ? STOCK[l.stock] : undefined;
    if (!l || !spec) return 120;
    const cars = { subway: 8, metro: 6, rail: 8, light: 2, tram: 1, cable: 1, monorail: 6, agt: 4 }[l.kind] ?? 6;
    return spec.length * cars;
  }

  /** The train layer reports each train's real length; stations grow (or shrink from the guess) to fit. */
  noteTrainLength(line: string, meters: number) {
    const prev = this.trainLen.get(line);
    if (prev !== undefined && meters <= prev * 1.02) return;
    this.trainLen.set(line, Math.max(prev ?? 0, meters));
    this.lastScale = -1; // re-lay the platforms on the next frame
  }

  /**
   * Toy exaggeration for the current zoom: trains grow a little in length and a lot in
   * cross-section (chunky, Plarail-style), and the track bands widen to carry them.
   */
  static scaleFor(mpp: number) {
    return {
      len: THREE.MathUtils.clamp(0.9 + mpp * 0.3, 1.35, 3.4),
      cross: THREE.MathUtils.clamp(mpp * 1.8, 2.3, 13),
    };
  }

  update(f: FrameInfo) {
    const { len, cross } = Network.scaleFor(f.mpp);
    const scale = cross;
    netUniforms.uLen.value = len;
    const laneW = Math.max(6.4 * scale, f.mpp * 3.1);
    netUniforms.uScale.value = scale;
    netUniforms.uLaneW.value = laneW;
    netUniforms.uHalfW.value = laneW * 0.5 * 0.94;
    netUniforms.uTrackOff.value = laneW * 0.27;
    netUniforms.uElevH.value = ELEV_H * Math.min(scale, 3.2);
    netUniforms.uDetail.value = 1 - THREE.MathUtils.smoothstep(f.mpp, 0.55, 1.3);
    this.canopies.visible = f.mpp < 3.5;
    const far = f.mpp > 3.2;
    this.platforms.visible = !far;
    this.canopies.visible = this.canopies.visible && !far;
    this.dots.visible = far;
    if (far) this.layoutDots(f.mpp);
    if (Math.abs(scale - this.lastScale) > 0.01 || this.lastScale < 0) {
      this.lastScale = scale;
      this.layoutStations(scale, laneW);
    }
  }

  // -------------------------------------------------------------------------
  // Queries used by trains
  // -------------------------------------------------------------------------

  /** Track geometry from a to b for a line, oriented a→b. */
  piece(line: string, a: string, b: string): PathPiece | null {
    const ps = this.pieces(line, a, b);
    return ps ? (ps.length === 1 ? ps[0] : concatPieces(ps)) : null;
  }

  /** Like piece(), but a multi-hop route comes back as one piece per hop, each with its own lane. */
  pieces(line: string, a: string, b: string): PathPiece[] | null {
    const recs = this.byPair.get(key(a, b));
    if (recs?.length) {
      const r = recs.find((x) => x.lane.has(line)) ?? recs[0];
      return [this.orient(r, r.seg.from === a, line)];
    }
    // Not adjacent: search the line's graph (express runs, data gaps), up to 8 hops.
    const route = this.search(line, a, b);
    if (route) return route.map(([r, fwd]) => this.orient(r, fwd, line));
    const sa = this.stations.get(a);
    const sb = this.stations.get(b);
    if (!sa || !sb) return null;
    return [
      {
        x: new Float32Array([sa.pos.x, sb.pos.x]),
        z: new Float32Array([sa.pos.z, sb.pos.z]),
        el: new Float32Array([0, 0]),
        lane: 0,
      },
    ];
  }

  private orient(r: SegRec, forward: boolean, line: string): PathPiece {
    const lane = r.lane.get(line) ?? 0;
    // Ribbon lanes offset along the normal to the right of the canonical direction. Pieces carry
    // lanes relative to the right of travel, so a reversed traversal flips the sign.
    const rel = forward ? lane : -lane;
    if (forward) return { x: r.x, z: r.z, el: r.el, lane: rel };
    return { x: r.x.slice().reverse(), z: r.z.slice().reverse(), el: r.el.slice().reverse(), lane: rel };
  }

  private search(line: string, a: string, b: string): [SegRec, boolean][] | null {
    const prev = new Map<string, [string, SegRec, boolean]>();
    const seen = new Set([a]);
    let frontier = [a];
    for (let depth = 0; depth < 8 && frontier.length; depth++) {
      const next: string[] = [];
      for (const s of frontier) {
        for (const r of this.byStation.get(s) ?? []) {
          if (!r.lane.has(line)) continue;
          const fwd = r.seg.from === s;
          const o = fwd ? r.seg.to : r.seg.from;
          if (seen.has(o)) continue;
          seen.add(o);
          prev.set(o, [s, r, fwd]);
          if (o === b) {
            const out: [SegRec, boolean][] = [];
            let cur = b;
            while (cur !== a) {
              const [p, rr, f] = prev.get(cur)!;
              out.unshift([rr, f]);
              cur = p;
            }
            return out;
          }
          next.push(o);
        }
      }
      frontier = next;
    }
    return null;
  }

  /** A stretch of track that arrives at `at`, continuing away from `awayFrom` (for trailing cars). */
  leadIn(line: string, at: string, awayFrom: string | null): PathPiece | null {
    const fwdPiece = awayFrom ? this.piece(line, at, awayFrom) : null;
    const recs = (this.byStation.get(at) ?? []).filter((r) => r.lane.has(line));
    let best: PathPiece | null = null;
    let bestScore = -Infinity;
    for (const r of recs) {
      const other = r.seg.from === at ? r.seg.to : r.seg.from;
      if (other === awayFrom) continue;
      const p = this.orient(r, r.seg.to === at, line); // oriented toward `at`
      if (!fwdPiece) return p;
      // Prefer the stretch that continues straight through `at`.
      const n = p.x.length;
      const ix = p.x[n - 1] - p.x[Math.max(0, n - 4)];
      const iz = p.z[n - 1] - p.z[Math.max(0, n - 4)];
      const ox = fwdPiece.x[Math.min(3, fwdPiece.x.length - 1)] - fwdPiece.x[0];
      const oz = fwdPiece.z[Math.min(3, fwdPiece.z.length - 1)] - fwdPiece.z[0];
      const score = (ix * ox + iz * oz) / (Math.hypot(ix, iz) * Math.hypot(ox, oz) + 1e-6);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return bestScore > 0.3 ? best : null;
  }

  /** Nearest station to a world point within maxDist. */
  nearestStation(x: number, z: number, maxDist: number) {
    let best: (StationDef & { pos: THREE.Vector3 }) | null = null;
    let bd = maxDist;
    for (const s of this.stations.values()) {
      const d = Math.hypot(s.pos.x - x, s.pos.z - z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** Keep these lines' tracks in full color and gray out the rest (empty/null = everything normal). */
  setFocus(lineIds: string[] | null) {
    const cols = [...new Set((lineIds ?? []).map((id) => this.lines.get(id)?.color.toLowerCase()).filter(Boolean) as string[])].slice(0, 16);
    netUniforms.uFocusN.value = cols.length;
    cols.forEach((hex, i) => {
      const c = new THREE.Color(hex);
      netUniforms.uFocusCols.value[i].set(c.r, c.g, c.b);
    });
  }

  focusLine(line: LineDef | null) {
    this.setFocus(line ? [line.id] : null);
  }

  /** Bounding box (world x/z) of a line's track, for framing it. */
  lineBounds(lineId: string) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const r of this.segs) {
      if (!r.lane.has(lineId)) continue;
      for (let i = 0; i < r.x.length; i++) {
        minX = Math.min(minX, r.x[i]);
        maxX = Math.max(maxX, r.x[i]);
        minZ = Math.min(minZ, r.z[i]);
        maxZ = Math.max(maxZ, r.z[i]);
      }
    }
    return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : null;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}

export function concatPieces(parts: PathPiece[]): PathPiece {
  const xs: number[] = [];
  const zs: number[] = [];
  const es: number[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.x.length; i++) {
      if (xs.length && i === 0) continue;
      xs.push(p.x[i]);
      zs.push(p.z[i]);
      es.push(p.el[i]);
    }
  }
  return { x: new Float32Array(xs), z: new Float32Array(zs), el: new Float32Array(es), lane: parts[0]?.lane ?? 0 };
}

function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ni = list.map((g) => g.toNonIndexed());
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    if (!ni.every((g) => g.getAttribute(name))) continue;
    const size = ni[0].getAttribute(name).itemSize;
    const arr = new Float32Array(ni.reduce((s, g) => s + g.getAttribute(name).array.length, 0));
    let o = 0;
    for (const g of ni) {
      arr.set(g.getAttribute(name).array as Float32Array, o);
      o += g.getAttribute(name).array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
