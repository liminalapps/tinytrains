// Builds public/data/tokyo/transit.json and server/data/tokyo/schedule.json from the Mini Tokyo 3D data
// (network, track geometry and ODPT-derived timetables). Run: npx tsx scripts/build-tokyo.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CITIES } from '../shared/cities.ts';
import { flatLength, makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, TransitData } from '../shared/types.ts';
import { LINES, SYSTEMS, canonStation, chooseStock, ownerFromNumber, type LineConf } from '../server/adapters/tokyo/lines.ts';
import type { ScheduleData, ScheduleTrip } from '../server/adapters/tokyo/schedule.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/tokyo/mt3d');
const BASE = 'https://raw.githubusercontent.com/nagix/mini-tokyo-3d/master/data/';

interface MtRailway { id: string; title: Record<string, string>; stations: string[]; ascending?: string; descending?: string }
interface MtStation { id: string; coord: [number, number]; title: Record<string, string> }
interface MtSubline {
  type: string;
  coords: [number, number][];
  altitude?: number;
  start?: { altitude?: number; railway?: string };
  end?: { altitude?: number; railway?: string };
}
interface MtCoordRailway { id: string; sublines: MtSubline[]; altitude?: number }
interface MtTitled { id: string; title: Record<string, string> }
interface MtTrain {
  id: string; t: string; r: string; n: string; y: string; d: string;
  os?: string[]; ds?: string[]; pt?: string[]; nt?: string[]; v?: string; nm?: Record<string, string>[];
  tt: { s: string; a?: string; d?: string }[];
}

async function cached<T>(rel: string): Promise<T> {
  const file = join(CACHE, rel);
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    const res = await fetch(BASE + rel);
    if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
    await new Promise((r) => setTimeout(r, 200));
  }
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

const city = CITIES.tokyo;
const { project } = makeProjection('tokyo');
const [W, S, E, N] = city.bbox;
const inBbox = ([lon, lat]: [number, number]) => lon > W && lon < E && lat > S && lat < N;
const RAMP = 300; // meters over which a tunnel portal transitions
const SIMPLIFY = 2;

// ---------------------------------------------------------------------------- geometry helpers

function cumulative(p: Flat): number[] {
  const s = [0];
  for (let i = 2; i < p.length; i += 2) s.push(s[s.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
  return s;
}

/** Candidate positions (arc length) of q along the polyline: local distance minima. */
function candidates(p: Flat, cum: number[], qx: number, qy: number) {
  const n = p.length / 2;
  const ds: { arc: number; d: number }[] = [];
  for (let j = 0; j < n - 1; j++) {
    const ax = p[2 * j], ay = p[2 * j + 1], bx = p[2 * j + 2], by = p[2 * j + 3];
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((qx - ax) * vx + (qy - ay) * vy) / l2)) : 0;
    ds.push({ arc: cum[j] + t * Math.sqrt(l2), d: Math.hypot(ax + t * vx - qx, ay + t * vy - qy) });
  }
  const out = ds.filter((c, j) => c.d < 800 && (j === 0 || c.d <= ds[j - 1].d) && (j === ds.length - 1 || c.d <= ds[j + 1].d));
  if (!out.length) out.push(ds.reduce((a, b) => (b.d < a.d ? b : a)));
  return out.sort((a, b) => a.d - b.d).slice(0, 10);
}

/** Snap stations in order onto the polyline with monotonically increasing arc length (DP over local minima). */
function snapInOrder(p: Flat, cum: number[], qs: [number, number][]) {
  const cands = qs.map(([x, y]) => candidates(p, cum, x, y));
  const cost: number[][] = [];
  const prev: number[][] = [];
  cands.forEach((cs, i) => {
    cost.push(cs.map(() => Infinity));
    prev.push(cs.map(() => -1));
    cs.forEach((c, k) => {
      if (i === 0) return void (cost[0][k] = c.d);
      cands[i - 1].forEach((pc, pk) => {
        if (pc.arc + 1 <= c.arc && cost[i - 1][pk] + c.d < cost[i][k]) {
          cost[i][k] = cost[i - 1][pk] + c.d;
          prev[i][k] = pk;
        }
      });
    });
  });
  const last = cost.length - 1;
  const total = Math.min(...cost[last]);
  if (!Number.isFinite(total)) return null;
  let k = cost[last].indexOf(total);
  const snaps: { arc: number; d: number }[] = [];
  for (let i = last; i >= 0; i--) {
    snaps.unshift(cands[i][k]);
    k = prev[i][k];
  }
  return { total, snaps };
}

/** Sub-polyline between two arc positions (reversed when a1 < a0), with per-point altitude. */
function slice(p: Flat, alt: number[], cum: number[], a0: number, a1: number) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const pts: number[] = [];
  const al: number[] = [];
  const at = (a: number) => {
    let j = 0;
    while (j < cum.length - 2 && cum[j + 1] < a) j++;
    const seg = cum[j + 1] - cum[j];
    const t = seg > 0 ? Math.max(0, Math.min(1, (a - cum[j]) / seg)) : 0;
    pts.push(p[2 * j] + t * (p[2 * j + 2] - p[2 * j]), p[2 * j + 1] + t * (p[2 * j + 3] - p[2 * j + 1]));
    al.push(t < 0.5 ? alt[j] : alt[j + 1]);
  };
  at(lo);
  for (let j = 0; j < cum.length; j++) {
    if (cum[j] > lo + 0.5 && cum[j] < hi - 0.5) {
      pts.push(p[2 * j], p[2 * j + 1]);
      al.push(alt[j]);
    }
  }
  at(hi);
  if (a1 < a0) {
    const rp: number[] = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) rp.push(pts[i], pts[i + 1]);
    return { pts: rp, alt: al.reverse() };
  }
  return { pts, alt: al };
}

function simplify(p: Flat, el: number[], tol: number) {
  const n = p.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  for (let i = 1; i < n; i++) if (el[i] !== el[i - 1]) keep[i] = keep[i - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1, bd = tol;
    const ax = p[2 * a], ay = p[2 * a + 1], bx = p[2 * b], by = p[2 * b + 1];
    const len = Math.hypot(bx - ax, by - ay);
    for (let i = a + 1; i < b; i++) {
      const x = p[2 * i], y = p[2 * i + 1];
      const d = len > 0 ? Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len : Math.hypot(x - ax, y - ay);
      if (d > bd) (bd = d), (best = i);
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const pts: number[] = [];
  const e: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) pts.push(p[2 * i], p[2 * i + 1]), e.push(el[i]);
  return { pts, el: e };
}

// ---------------------------------------------------------------------------- load

const railways = new Map((await cached<MtRailway[]>('railways.json')).map((r) => [r.id, r]));
const mtStations = new Map((await cached<MtStation[]>('stations.json')).map((s) => [s.id, s]));
const coordRailways = new Map((await cached<{ railways: MtCoordRailway[] }>('coordinates.json')).railways.map((r) => [r.id, r]));
const trainTypes = new Map((await cached<MtTitled[]>('train-types.json')).map((t) => [t.id, t.title]));
const railDirections = new Map((await cached<MtTitled[]>('rail-directions.json')).map((t) => [t.id, t.title]));

const stationCoord = (raw: string): [number, number] => {
  const s = mtStations.get(raw) ?? mtStations.get(canonStation(raw)) ?? mtStations.get(raw.replace(/\.\d+$/, ''));
  if (!s) throw new Error(`no coordinates for ${raw}`);
  return s.coord;
};
const titleCase = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => `-${c.toUpperCase()}`).replace(/\s*<([^>]+)>/, ' ($1)');
const stationTitle = (raw: string): [string, string] => {
  const s = mtStations.get(raw) ?? mtStations.get(canonStation(raw)) ?? mtStations.get(raw.replace(/\.\d+$/, ''));
  if (!s) return [raw.split('.').pop()!, ''];
  return [titleCase(s.title.en), s.title.ja];
};

// ---------------------------------------------------------------------------- track polylines

/**
 * Projected polyline of a railway. 'sub' sublines share track with another railway (drawn offset in MT3D),
 * and their own coords are often just a stub, so take the geometry from the referenced railway.
 */
const polyCache = new Map<string, Flat>();
function railwayPolyline(id: string, depth = 0): Flat {
  const hit = polyCache.get(id);
  if (hit) return hit;
  const cr = coordRailways.get(id);
  if (!cr) throw new Error(`no coordinates for ${id}`);
  let p: number[] = [];
  for (const sl of cr.sublines) {
    const pts = sublinePoints(sl, depth);
    const skip = p.length && Math.hypot(pts[0] - p[p.length - 2], pts[1] - p[p.length - 1]) < 0.5 ? 1 : 0;
    p = p.concat(pts.slice(skip * 2));
  }
  polyCache.set(id, p);
  return p;
}

function sublinePoints(sl: MtSubline, depth: number): Flat {
  const own = sl.coords.flatMap(([lon, lat]) => project(lon, lat));
  const ref = sl.type === 'sub' && sl.start?.railway;
  if (!ref || depth > 3 || !coordRailways.has(ref) || flatLength(own) / (own.length / 2 - 1) < 300) return own;
  const rp = railwayPolyline(ref, depth + 1);
  const rc = cumulative(rp);
  const nearest = (x: number, y: number) => candidates(rp, rc, x, y)[0];
  const a = nearest(own[0], own[1]), b = nearest(own[own.length - 2], own[own.length - 1]);
  if (a.d > 150 || b.d > 150) return own;
  const sl2 = slice(rp, rp.map(() => 0), rc, a.arc, b.arc).pts;
  // Keep the exact subline ends so neighbors join.
  sl2.splice(0, 2, own[0], own[1]);
  sl2.splice(sl2.length - 2, 2, own[own.length - 2], own[own.length - 1]);
  return sl2;
}

// ---------------------------------------------------------------------------- lines, stations, pieces

interface LineGeo {
  conf: LineConf;
  raw: string[]; // Mini Tokyo 3D station ids along the railway (range-limited)
  ids: string[]; // canonical ids
  inside: boolean[];
  xy: [number, number][]; // snapped station positions
  snapDist: number[];
  pieces: { pts: Flat; el: number[]; len: number }[]; // piece i joins station i and i+1
}

const lineGeo = new Map<string, LineGeo>();
for (const conf of LINES) {
  const rw = railways.get(conf.railway);
  const cr = coordRailways.get(conf.railway);
  if (!rw || !cr) throw new Error(`missing railway ${conf.railway}`);
  let raw = rw.stations;
  if (conf.range) {
    const i0 = raw.findIndex((s) => s.endsWith(`.${conf.range![0]}`));
    const i1 = raw.findIndex((s) => s.endsWith(`.${conf.range![1]}`));
    raw = raw.slice(i0, i1 + 1);
  }
  // Polyline with MT3D altitudes (portal ramps at subline ends).
  let p: number[] = [];
  let alt: number[] = [];
  for (const sl of cr.sublines) {
    const base = sl.altitude ?? cr.altitude ?? 0;
    const pts = sublinePoints(sl, 0);
    const c = cumulative(pts);
    const total = c[c.length - 1];
    const a0 = sl.start?.altitude ?? base, a1 = sl.end?.altitude ?? base;
    const al = c.map((s) => {
      let v = base;
      if (a0 !== base && s < RAMP) v = a0 + ((base - a0) * s) / RAMP;
      if (a1 !== base && total - s < RAMP) v = a1 + ((base - a1) * (total - s)) / RAMP;
      return v;
    });
    const skip = p.length && Math.hypot(pts[0] - p[p.length - 2], pts[1] - p[p.length - 1]) < 0.5 ? 1 : 0;
    p = p.concat(pts.slice(skip * 2));
    alt = alt.concat(al.slice(skip));
  }
  const qs = raw.map((s) => project(...stationCoord(s)));
  if (conf.id === 'MO') {
    // MT3D starts the monorail on the JR corridor; the terminal sits ~150 m west of it.
    p.splice(0, 4, ...qs[0]);
    alt.splice(0, 2, alt[0]);
  }
  let cum = cumulative(p);
  let snap = snapInOrder(p, cum, qs);
  const revP: number[] = [];
  for (let i = p.length - 2; i >= 0; i -= 2) revP.push(p[i], p[i + 1]);
  const revCum = cumulative(revP);
  const rsnap = snapInOrder(revP, revCum, qs);
  if (!snap || (rsnap && rsnap.total < snap.total)) {
    p = revP;
    alt = alt.slice().reverse();
    cum = revCum;
    snap = rsnap;
  }
  if (!snap) throw new Error(`cannot snap stations of ${conf.id}`);
  const snaps = snap.snaps;
  const pieces = snaps.slice(0, -1).map((s, i) => {
    const sl = slice(p, alt, cum, s.arc, snaps[i + 1].arc);
    const el = sl.alt.map((a) => (a < -0.5 ? -1 : conf.surface));
    return { pts: sl.pts, el, len: flatLength(sl.pts) };
  });
  const xy = snaps.map((s, i) => {
    const sl = slice(p, alt, cum, s.arc, s.arc);
    return [sl.pts[0], sl.pts[1]] as [number, number];
  });
  lineGeo.set(conf.id, {
    conf,
    raw,
    ids: raw.map(canonStation),
    inside: raw.map((s) => inBbox(stationCoord(s))),
    xy,
    snapDist: snaps.map((s) => s.d),
    pieces,
  });
}

/** Station path between two stops on a line (index range), choosing the closest occurrences (loops). */
function pathIndices(g: LineGeo, a: string, b: string): [number, number] | null {
  let best: [number, number] | null = null;
  g.ids.forEach((x, i) => {
    if (x !== a || !g.inside[i]) return;
    g.ids.forEach((y, j) => {
      if (y !== b || i === j || !g.inside[j]) return;
      if (!best || Math.abs(i - j) < Math.abs(best[0] - best[1])) best = [i, j];
    });
  });
  return best;
}

function pairGeometry(g: LineGeo, a: string, b: string) {
  const ij = pathIndices(g, a, b);
  if (!ij) return null;
  const [i, j] = ij;
  const pts: number[] = [];
  const el: number[] = [];
  let len = 0;
  const step = j > i ? 1 : -1;
  for (let k = i; k !== j; k += step) {
    const pc = g.pieces[step > 0 ? k : k - 1];
    let pp = pc.pts, ee = pc.el;
    if (step < 0) {
      const rp: number[] = [];
      for (let q = pp.length - 2; q >= 0; q -= 2) rp.push(pp[q], pp[q + 1]);
      pp = rp;
      ee = ee.slice().reverse();
    }
    const skip = pts.length ? 1 : 0;
    pts.push(...pp.slice(skip * 2));
    el.push(...ee.slice(skip));
    len += pc.len;
  }
  return { pts, el, len, hops: Math.abs(j - i) };
}

// ---------------------------------------------------------------------------- timetables

type Cal = string;
interface Stop { s: string; A?: number; D?: number }
interface Leg {
  id: string; t: string; line: string; rw: string; n: string; type: string; dir: string; cal: Cal;
  ds?: string; nm?: string; v?: string; pt: string[]; nt: string[]; stops: Stop[];
}

const toMin = (hhmm: string | undefined) => {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(':').map(Number);
  return (h < 3 ? h + 24 : h) * 60 + m;
};

const legs = new Map<string, Leg>();
const lineTypes = new Map<string, Set<string>>();
for (const conf of LINES) {
  const g = lineGeo.get(conf.id)!;
  const insideSet = new Set(g.ids.filter((_, i) => g.inside[i]));
  const trains = await cached<MtTrain[]>(`train-timetables/${conf.file}.json`);
  for (const tr of trains) {
    const [cal, ...sfx] = tr.id.slice(tr.t.length + 1).split('.');
    let stops: Stop[] = tr.tt.map((x) => ({ s: canonStation(x.s), A: toMin(x.a), D: toMin(x.d) }));
    // Keep times monotonic across midnight.
    let last = -1;
    for (const st of stops) {
      for (const k of ['A', 'D'] as const) {
        if (st[k] === undefined) continue;
        while (st[k]! < last - 600) st[k]! += 1440;
        last = Math.max(last, st[k]!);
      }
    }
    stops = stops.filter((x) => insideSet.has(x.s));
    if (!lineTypes.has(conf.id)) lineTypes.set(conf.id, new Set());
    lineTypes.get(conf.id)!.add(tr.y);
    legs.set(tr.id, {
      id: tr.id, t: sfx.length ? `${tr.t}.${sfx.join('.')}` : tr.t, line: conf.id, rw: tr.r, n: tr.n, type: tr.y, dir: tr.d, cal,
      ds: tr.ds?.[0], nm: tr.nm?.[0]?.en, v: tr.v, pt: tr.pt ?? [], nt: tr.nt ?? [], stops,
    });
  }
}

// Stitch in-scope continuations (Yamanote laps, Tozai <-> Chuo-Sobu Local, Marunouchi branch <-> main).
const nextOf = new Map<string, Leg>();
const hasPrev = new Set<string>();
for (const leg of legs.values()) {
  if (!leg.stops.length) continue;
  for (const id of leg.nt) {
    const nx = legs.get(id);
    if (!nx || !nx.stops.length || hasPrev.has(nx.id) || nx.cal !== leg.cal) continue;
    if (nx.stops[0].s !== leg.stops[leg.stops.length - 1].s) continue;
    nextOf.set(leg.id, nx);
    hasPrev.add(nx.id);
    break;
  }
}

const legOwner = (leg: Leg): string | undefined => {
  const own = ownerFromNumber(leg.line, leg.n);
  if (own) return own;
  for (const id of [...leg.pt, ...leg.nt]) {
    const o = legs.get(id);
    const oo = o && ownerFromNumber(o.line, o.n);
    if (oo) return oo;
  }
  return undefined;
};

interface Run { id: string; line: string; cal: Cal; legs: { start: number; leg: Leg }[]; stops: Stop[]; pairLine: string[] }
const runs: Run[] = [];
for (const leg of legs.values()) {
  if (hasPrev.has(leg.id) || leg.stops.length === 0) continue;
  const run: Run = { id: leg.t, line: leg.line, cal: leg.cal, legs: [], stops: [], pairLine: [] };
  for (let cur: Leg | undefined = leg; cur; cur = nextOf.get(cur.id)) {
    if (run.stops.length) {
      const last = run.stops[run.stops.length - 1];
      const first = cur.stops[0];
      last.D = first.D;
      run.legs.push({ start: run.stops.length - 1, leg: cur });
      run.stops.push(...cur.stops.slice(1));
    } else {
      run.legs.push({ start: 0, leg: cur });
      run.stops.push(...cur.stops.map((s) => ({ ...s })));
    }
    for (let i = 1; i < cur.stops.length; i++) run.pairLine.push(cur.line);
  }
  if (run.stops.length < 2) continue;
  const counts = new Map<string, number>();
  for (const l of run.pairLine) counts.set(l, (counts.get(l) ?? 0) + 1);
  run.line = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  runs.push(run);
}

// ---------------------------------------------------------------------------- times

const BIAS = 20; // printed timetables truncate seconds
function smoothTimes(run: Run): number[] {
  const st = run.stops;
  const n = st.length;
  const dist = [0];
  for (let i = 1; i < n; i++) {
    const g = lineGeo.get(run.pairLine[i - 1])!;
    dist.push(dist[i - 1] + (pairGeometry(g, st[i - 1].s, st[i].s)?.len ?? 1000));
  }
  const key = st.map((s, i) => ((i < n - 1 ? (s.D ?? s.A) : (s.A ?? s.D)) ?? 0) * 60);
  for (let i = 1; i < n; i++) key[i] = Math.max(key[i], key[i - 1]);
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && key[j + 1] === key[i]) j++;
    if (j > i) {
      const hasNext = j + 1 < n;
      const t1 = hasNext ? key[j + 1] : key[i] + 60;
      const c1 = hasNext ? dist[j + 1] : dist[j] + (dist[j] - dist[i]) / (j - i);
      for (let k = i + 1; k <= j; k++) key[k] = key[i] + ((t1 - key[i]) * (dist[k] - dist[i])) / Math.max(1, c1 - dist[i]);
    }
    i = j + 1;
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = key[i] + BIAS;
    let a: number;
    if (i === 0) a = st[0].A !== undefined && st[0].D !== undefined && st[0].D > st[0].A ? st[0].A * 60 + BIAS : d - 20;
    else if (i === n - 1) a = d;
    else if (st[i].A !== undefined && st[i].D !== undefined && st[i].D! > st[i].A!) a = st[i].A! * 60 + BIAS;
    else a = d - Math.max(8, Math.min(25, 0.3 * (d - out[out.length - 1])));
    if (i > 0) a = Math.max(a, out[out.length - 1] + 5);
    const dd = i === n - 1 ? a + 30 : Math.max(d, a);
    out.push(Math.round(a), Math.round(dd));
  }
  return out;
}

// ---------------------------------------------------------------------------- stations & segments output

const stationIdx = new Map<string, number>();
const stationList: string[] = [];
const stationXY = new Map<string, [number, number][]>();
const stationLines = new Map<string, Set<string>>();
const stationRaw = new Map<string, string>();
for (const g of lineGeo.values()) {
  g.ids.forEach((id, i) => {
    if (!g.inside[i]) return;
    if (!stationIdx.has(id)) {
      stationIdx.set(id, stationList.length);
      stationList.push(id);
      stationRaw.set(id, g.raw[i]);
    }
    if (!stationXY.has(id)) stationXY.set(id, []);
    stationXY.get(id)!.push(g.xy[i]);
    if (!stationLines.has(id)) stationLines.set(id, new Set());
    stationLines.get(id)!.add(g.conf.id);
  });
}

interface Cand { from: string; to: string; line: string; pts: Flat; el: number[] }
const cands = new Map<string, Cand[]>();
const addCand = (c: Cand) => {
  if (c.from > c.to) {
    const rp: number[] = [];
    for (let q = c.pts.length - 2; q >= 0; q -= 2) rp.push(c.pts[q], c.pts[q + 1]);
    c = { from: c.to, to: c.from, line: c.line, pts: rp, el: c.el.slice().reverse() };
  }
  const key = `${c.from}|${c.to}`;
  if (!cands.has(key)) cands.set(key, []);
  cands.get(key)!.push(c);
};
const seenPair = new Set<string>();
for (const g of lineGeo.values()) {
  g.pieces.forEach((pc, i) => {
    if (!g.inside[i] || !g.inside[i + 1] || g.ids[i] === g.ids[i + 1]) return;
    seenPair.add(`${g.conf.id}|${g.ids[i]}|${g.ids[i + 1]}`);
    addCand({ from: g.ids[i], to: g.ids[i + 1], line: g.conf.id, pts: pc.pts, el: pc.el });
  });
}
let missingPairs = 0;
for (const run of runs) {
  for (let i = 1; i < run.stops.length; i++) {
    const a = run.stops[i - 1].s, b = run.stops[i].s, line = run.pairLine[i - 1];
    const k = a < b ? `${line}|${a}|${b}` : `${line}|${b}|${a}`;
    if (seenPair.has(`${line}|${a}|${b}`) || seenPair.has(`${line}|${b}|${a}`)) continue;
    seenPair.add(k);
    const geo = pairGeometry(lineGeo.get(line)!, a, b);
    if (!geo) {
      missingPairs++;
      continue;
    }
    addCand({ from: a, to: b, line, pts: geo.pts, el: geo.el });
  }
}

function similar(a: Flat, b: Flat) {
  const la = cumulative(a), lb = cumulative(b);
  const at = (p: Flat, c: number[], f: number) => {
    const target = f * c[c.length - 1];
    let j = 0;
    while (j < c.length - 2 && c[j + 1] < target) j++;
    const t = c[j + 1] > c[j] ? (target - c[j]) / (c[j + 1] - c[j]) : 0;
    return [p[2 * j] + t * (p[2 * j + 2] - p[2 * j]), p[2 * j + 1] + t * (p[2 * j + 3] - p[2 * j + 1])];
  };
  let sum = 0;
  for (let k = 0; k <= 10; k++) {
    const [ax, ay] = at(a, la, k / 10), [bx, by] = at(b, lb, k / 10);
    sum += Math.hypot(ax - bx, ay - by);
  }
  return sum / 11 < 25;
}

const segments: SegmentDef[] = [];
for (const list of cands.values()) {
  const merged: { c: Cand; lines: Set<string> }[] = [];
  for (const c of list) {
    const m = merged.find((x) => similar(x.c.pts, c.pts));
    if (m) m.lines.add(c.line);
    else merged.push({ c, lines: new Set([c.line]) });
  }
  for (const { c, lines } of merged) {
    const s = simplify(c.pts, c.el, SIMPLIFY);
    const seg: SegmentDef = { from: c.from, to: c.to, lines: [...lines], pts: roundFlat(s.pts) };
    if (s.el.some((v) => v !== 0)) seg.el = s.el;
    segments.push(seg);
  }
}

// Through trains shown under another line (Tozai trains west of Nakano) also run over these stretches.
const segByKey = new Map<string, SegmentDef[]>();
for (const seg of segments) {
  const k = `${seg.from}|${seg.to}`;
  if (!segByKey.has(k)) segByKey.set(k, []);
  segByKey.get(k)!.push(seg);
}
for (const run of runs) {
  for (let i = 0; i < run.stops.length; i++) {
    stationLines.get(run.stops[i].s)?.add(run.line);
    if (i === 0 || run.pairLine[i - 1] === run.line) continue;
    const a = run.stops[i - 1].s, b = run.stops[i].s;
    const list = segByKey.get(a < b ? `${a}|${b}` : `${b}|${a}`) ?? [];
    const seg = list.find((s) => s.lines.includes(run.pairLine[i - 1]));
    if (seg && !seg.lines.includes(run.line)) seg.lines.push(run.line);
  }
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const lines: LineDef[] = LINES.map((l) => ({
  id: l.id,
  system: l.system,
  name: l.name,
  nameLocal: l.nameLocal,
  short: l.id,
  color: l.color,
  textColor: luminance(l.color) > 0.62 ? '#1A1A1A' : '#FFFFFF',
  kind: l.kind,
  bullet: 'circle',
  stock: l.stock,
}));

const stations: StationDef[] = stationList.map((id) => {
  const xy = stationXY.get(id)!;
  const [en, ja] = stationTitle(stationRaw.get(id)!);
  const x = xy.reduce((s, p) => s + p[0], 0) / xy.length;
  const y = xy.reduce((s, p) => s + p[1], 0) / xy.length;
  return { id, name: en, nameLocal: ja, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, lines: [...stationLines.get(id)!] };
});

const transit: TransitData = {
  city: 'tokyo',
  built: new Date().toISOString().slice(0, 10),
  attribution: [
    'Timetables & network: Mini Tokyo 3D (nagix, MIT)',
    'Source data: Public Transportation Open Data Center (ODPT)',
    'Realtime: ODPT (Toei)',
    '© OpenStreetMap contributors',
  ],
  systems: SYSTEMS.map((s) => ({ id: s.id, name: s.name, live: s.live })),
  lines,
  stations,
  segments,
};

// ---------------------------------------------------------------------------- schedule output

const names: Record<string, [string, string]> = {};
const types: Record<string, [string, string]> = {};
const dirs: Record<string, [string, string]> = {};
const TYPE_OVERRIDE: Record<string, [string, string]> = {
  'Toei.AirportRapidLimitedExpress': ['Airport Limited Express', 'エアポート快特'],
  'TokyoMonorail.Rapid': ['Section Rapid', '区間快速'],
  'TokyoMetro.Local': ['Local', '各停'],
  'JR-East.Local': ['Local', '各駅停車'],
  'TWR.Local': ['Local', '各駅停車'],
};
for (const id of stationList) names[id] = stationTitle(stationRaw.get(id)!);

const trips: ScheduleTrip[] = [];
const runSamples = new Map<string, number[]>();
for (const run of runs) {
  const times = smoothTimes(run);
  const idx = run.stops.map((s) => stationIdx.get(s.s)!);
  const main = run.legs.map((l) => l.leg).sort((a, b) => b.stops.length - a.stops.length)[0];
  const owner = run.legs.map((l) => legOwner(l.leg)).find(Boolean);
  const vehicle = run.legs.map((l) => l.leg.v).find(Boolean);
  const { stock, cars } = chooseStock({ line: run.line, key: run.id, owner, type: main.type, vehicle, n: main.n });
  const legsOut: ScheduleTrip['legs'] = run.legs.map(({ start, leg }) => {
    if (leg.ds && !names[leg.ds]) names[leg.ds] = stationTitle(leg.ds);
    const tt = trainTypes.get(leg.type);
    if (!types[leg.type]) types[leg.type] = TYPE_OVERRIDE[leg.type] ?? [tt?.en ?? leg.type.split('.').pop()!, tt?.ja ?? ''];
    const rd = railDirections.get(leg.dir);
    if (!dirs[leg.dir]) dirs[leg.dir] = [rd?.en ?? leg.dir, rd?.ja ?? ''];
    return [start, leg.rw, leg.n, leg.type, leg.dir, leg.ds ?? '', leg.nm ?? ''];
  });
  const delta = times.map((t, i) => (i === 0 ? t : t - times[i - 1]));
  trips.push({ id: run.id, line: run.line, cal: run.cal, stock, cars, s: idx, t: delta, legs: legsOut });
  for (let i = 1; i < run.stops.length; i++) {
    const g = lineGeo.get(run.pairLine[i - 1])!;
    const ij = pathIndices(g, run.stops[i - 1].s, run.stops[i].s);
    if (!ij || Math.abs(ij[0] - ij[1]) !== 1) continue;
    const k = `${run.pairLine[i - 1]}|${run.stops[i - 1].s}>${run.stops[i].s}`;
    if (!runSamples.has(k)) runSamples.set(k, []);
    runSamples.get(k)!.push(times[2 * i] - times[2 * i - 1]);
  }
}

const schedLines: ScheduleData['lines'] = {};
for (const g of lineGeo.values()) {
  const ids: number[] = [];
  const cum: number[] = [];
  let d = 0;
  g.ids.forEach((id, i) => {
    if (!g.inside[i]) return;
    if (ids.length) d += g.pieces[i - 1].len;
    ids.push(stationIdx.get(id)!);
    cum.push(Math.round(d));
  });
  const rw = railways.get(g.conf.railway)!;
  const run: Record<string, number> = {};
  for (const [k, v] of runSamples) {
    if (!k.startsWith(`${g.conf.id}|`)) continue;
    v.sort((a, b) => a - b);
    run[k.slice(g.conf.id.length + 1)] = v[v.length >> 1];
  }
  schedLines[g.conf.id] = {
    path: ids,
    cum,
    asc: rw.ascending ?? '',
    desc: rw.descending ?? '',
    services: (lineTypes.get(g.conf.id)?.size ?? 0) > 1,
    run,
  };
  for (const dd of [rw.ascending, rw.descending]) {
    const rd = dd && railDirections.get(dd);
    if (dd && !dirs[dd]) dirs[dd] = [rd ? rd.en : dd, rd ? rd.ja : ''];
  }
}
for (const [id, t] of trainTypes) if (!types[id] && /^(Toei|TokyoMetro)\./.test(id)) types[id] = TYPE_OVERRIDE[id] ?? [t.en, t.ja];
for (const [id, t] of railDirections) if (!dirs[id]) dirs[id] = [t.en, t.ja];
// The live feed names Toei directions by terminal ('Toei.Hikarigaoka'); take those titles from ODPT.
const odptDirFile = join(ROOT, '.cache/tokyo/odpt-raildirection-toei.json');
if (!existsSync(odptDirFile)) {
  const res = await fetch('https://api-public.odpt.org/api/v4/odpt:RailDirection?odpt:operator=odpt.Operator:Toei');
  if (res.ok) writeFileSync(odptDirFile, await res.text());
}
if (existsSync(odptDirFile)) {
  for (const d of JSON.parse(readFileSync(odptDirFile, 'utf8')) as { 'owl:sameAs': string; 'odpt:railDirectionTitle'?: Record<string, string> }[]) {
    const id = d['owl:sameAs'].replace('odpt.RailDirection:', '');
    const t = d['odpt:railDirectionTitle'];
    if (!dirs[id] && t) dirs[id] = [t.en ?? id, t.ja ?? ''];
  }
}

const schedule: ScheduleData = {
  built: transit.built,
  stations: stationList,
  names,
  types,
  dirs,
  lines: schedLines,
  trips,
};

mkdirSync(join(ROOT, 'public/data/tokyo'), { recursive: true });
mkdirSync(join(ROOT, 'server/data/tokyo'), { recursive: true });
const transitJson = JSON.stringify(transit);
writeFileSync(join(ROOT, 'public/data/tokyo/transit.json'), transitJson);
const schedJson = JSON.stringify(schedule);
writeFileSync(join(ROOT, 'server/data/tokyo/schedule.json'), schedJson);

// ---------------------------------------------------------------------------- report

let maxSnap = 0, maxSnapAt = '';
for (const g of lineGeo.values()) g.snapDist.forEach((d, i) => g.inside[i] && d > maxSnap && ((maxSnap = d), (maxSnapAt = g.raw[i])));
console.log(`lines ${lines.length}, stations ${stations.length}, segments ${segments.length}, trips ${trips.length}, missing express pairs ${missingPairs}`);
console.log(`max station snap distance ${maxSnap.toFixed(1)} m at ${maxSnapAt}`);
console.log(`transit.json ${(transitJson.length / 1e6).toFixed(2)} MB, schedule.json ${(schedJson.length / 1e6).toFixed(2)} MB`);
for (const l of LINES) {
  const g = lineGeo.get(l.id)!;
  const n = g.inside.filter(Boolean).length;
  const byCal = new Map<string, number>();
  for (const t of trips) if (t.line === l.id) byCal.set(t.cal, (byCal.get(t.cal) ?? 0) + 1);
  console.log(`  ${l.id.padEnd(3)} ${String(n).padStart(2)} stations (${g.raw.length - n} outside bbox), trips ${[...byCal].map(([c, v]) => `${c}:${v}`).join(' ')}`);
}
