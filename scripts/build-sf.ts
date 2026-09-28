// Builds public/data/sf/transit.json and the compact timetables in server/data/sf/ from the BART, SFMTA and
// Caltrain static GTFS feeds, with track levels from OpenStreetMap.
// Run: npx tsx scripts/build-sf.ts [--refresh] [--debug]. With API_511_KEY set, Muni and Caltrain come from 511.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { CITIES } from '../shared/cities.ts';
import { makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, SystemDef, TransitData } from '../shared/types.ts';
import type { PatternDef, Schedule, ServiceDef, TripRow } from '../server/adapters/sf/schedule.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/sf');
const REFRESH = process.argv.includes('--refresh');
const DEBUG = process.argv.includes('--debug');
const { project } = makeProjection('sf');
const [W, S, E, N] = CITIES.sf.bbox;

if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
const KEY = process.env.API_511_KEY;
// With a 511 key, Muni and Caltrain come from 511's datafeeds, whose trip ids match 511's realtime feeds.
const via511 = (op: string) => `https://api.511.org/transit/datafeeds?api_key=${KEY}&operator_id=${op}`;
const SOURCES = {
  bart: 'https://www.bart.gov/dev/schedules/google_transit.zip',
  muni: KEY ? via511('SF') : 'https://data.sfgov.org/download/dni7-qpv3/application%2Fx-zip-compressed', // DataSF mirror of SFMTA's GTFS
  caltrain: KEY ? via511('CT') : 'https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip',
};

// ---------------------------------------------------------------------------
// GTFS loading
// ---------------------------------------------------------------------------

type Row = Record<string, string>;
type Zip = Record<string, Uint8Array>;

async function download(name: keyof typeof SOURCES): Promise<Zip> {
  const file = join(CACHE, `${name}${KEY && name !== 'bart' ? '-511' : ''}.zip`);
  if (REFRESH || !existsSync(file)) {
    console.log(`downloading ${SOURCES[name].replace(/api_key=[^&]+/, 'api_key=…')}`);
    const res = await fetch(SOURCES[name], { redirect: 'follow' });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return unzipSync(readFileSync(file));
}

function splitCsv(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') (cur += '"'), i++;
      else q = false;
    } else if (c === '"') q = true;
    else if (c === ',') out.push(cur), (cur = '');
    else cur += c;
  }
  out.push(cur);
  return out;
}

function* rows(zip: Zip, name: string): Generator<Row> {
  const key = Object.keys(zip).find((k) => k === name || k.endsWith(`/${name}`));
  if (!key) return;
  const lines = new TextDecoder().decode(zip[key]).replace(/^﻿/, '').split(/\r?\n/);
  const head = splitCsv(lines[0]).map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitCsv(lines[i]);
    const row: Row = {};
    for (let j = 0; j < head.length; j++) row[head[j]] = (cells[j] ?? '').trim();
    yield row;
  }
}

const table = (zip: Zip, name: string) => [...rows(zip, name)];
const secs = (t: string) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

interface StopTime {
  stop: string;
  a: number;
  d: number;
}

function loadStopTimes(zip: Zip, keep: Set<string>): Map<string, StopTime[]> {
  const out = new Map<string, (StopTime & { seq: number })[]>();
  for (const r of rows(zip, 'stop_times.txt')) {
    if (!keep.has(r.trip_id)) continue;
    const a = secs(r.arrival_time || r.departure_time);
    const d = secs(r.departure_time || r.arrival_time);
    let list = out.get(r.trip_id);
    if (!list) out.set(r.trip_id, (list = []));
    list.push({ stop: r.stop_id, a, d, seq: Number(r.stop_sequence) });
  }
  for (const list of out.values()) list.sort((x, y) => x.seq - y.seq);
  return out;
}

function loadShapes(zip: Zip, keep: Set<string>): Map<string, Flat> {
  const pts = new Map<string, [number, number, number][]>();
  for (const r of rows(zip, 'shapes.txt')) {
    if (!keep.has(r.shape_id)) continue;
    let list = pts.get(r.shape_id);
    if (!list) pts.set(r.shape_id, (list = []));
    const [x, y] = project(Number(r.shape_pt_lon), Number(r.shape_pt_lat));
    list.push([Number(r.shape_pt_sequence), x, y]);
  }
  const out = new Map<string, Flat>();
  for (const [id, list] of pts) {
    list.sort((a, b) => a[0] - b[0]);
    const flat: Flat = [];
    for (const [, x, y] of list) {
      const n = flat.length;
      if (n && Math.abs(flat[n - 2] - x) < 0.01 && Math.abs(flat[n - 1] - y) < 0.01) continue;
      flat.push(x, y);
    }
    out.set(id, flat);
  }
  return out;
}

function loadServices(zip: Zip, used: Set<string>): Record<string, ServiceDef> {
  const out: Record<string, ServiceDef> = {};
  const get = (id: string) => (out[id] ??= { days: '0000000', start: 0, end: 0 });
  for (const r of rows(zip, 'calendar.txt')) {
    if (!used.has(r.service_id)) continue;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (r[d] === '1' ? '1' : '0')).join('');
    Object.assign(get(r.service_id), { days, start: Number(r.start_date), end: Number(r.end_date) });
  }
  for (const r of rows(zip, 'calendar_dates.txt')) {
    if (!used.has(r.service_id)) continue;
    const s = get(r.service_id);
    if (r.exception_type === '1') (s.add ??= []).push(Number(r.date));
    else (s.rem ??= []).push(Number(r.date));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function simplify(pts: Flat, tol: number): Flat {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const ax = pts[2 * i0], ay = pts[2 * i0 + 1], bx = pts[2 * i1], by = pts[2 * i1 + 1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[2 * i], py = pts[2 * i + 1];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dd = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (dd > best) (best = dd), (bi = i);
    }
    if (best > tol) {
      keep[bi] = 1;
      stack.push([i0, bi], [bi, i1]);
    }
  }
  const out: Flat = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

function cumulative(pts: Flat): number[] {
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  return cum;
}

/**
 * Along-shape positions of each stop, monotonic, minimizing total offset (dynamic programming over the local minima
 * of the distance to the shape). Stops that don't fit (e.g. past the end of a shorter shape) come back null.
 */
function locate(shape: Flat, cum: number[], stops: [number, number][]): ({ s: number; d: number } | null)[] {
  const nseg = shape.length / 2 - 1;
  const SKIP = 400;
  if (nseg < 1) return stops.map(() => null);
  const cands: ({ s: number; d: number } | null)[][] = [];
  for (const [px, py] of stops) {
    const ds: { s: number; d: number }[] = [];
    for (let i = 0; i < nseg; i++) {
      const ax = shape[2 * i], ay = shape[2 * i + 1], bx = shape[2 * i + 2], by = shape[2 * i + 3];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      ds.push({ s: cum[i] + t * Math.sqrt(len2), d: Math.hypot(px - ax - t * dx, py - ay - t * dy) });
    }
    const local = ds.filter((c, i) => c.d < 250 && (i === 0 || c.d <= ds[i - 1].d) && (i === nseg - 1 || c.d <= ds[i + 1].d));
    local.sort((a, b) => a.d - b.d);
    cands.push([...local.slice(0, 8), null]);
  }
  // cost[i][c]: best total with stop i at candidate c; at[i][c]: position of the last placed stop on that path
  const cost: number[][] = [], at: number[][] = [], prev: number[][] = [];
  for (let i = 0; i < cands.length; i++) {
    cost.push([]), at.push([]), prev.push([]);
    for (const c of cands[i]) {
      let best = i === 0 ? 0 : Infinity, bp = -1, pos = -Infinity;
      for (let p = 0; i > 0 && p < cands[i - 1].length; p++) {
        if (c && at[i - 1][p] > c.s + 1e-6) continue;
        if (cost[i - 1][p] < best) (best = cost[i - 1][p]), (bp = p), (pos = at[i - 1][p]);
      }
      cost[i].push(best + (c ? c.d : SKIP));
      prev[i].push(bp);
      at[i].push(c ? c.s : pos);
    }
  }
  const last = cost.length - 1;
  let bc = 0;
  cost[last].forEach((v, c) => v < cost[last][bc] && (bc = c));
  const out: ({ s: number; d: number } | null)[] = new Array(cands.length);
  for (let i = last, c = bc; i >= 0; c = prev[i][c], i--) out[i] = cands[i][c];
  return out;
}

function slice(shape: Flat, cum: number[], s0: number, s1: number): Flat {
  const at = (s: number) => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const len = cum[i + 1] - cum[i];
    const t = len ? Math.max(0, Math.min(1, (s - cum[i]) / len)) : 0;
    return { i, x: shape[2 * i] + t * (shape[2 * i + 2] - shape[2 * i]), y: shape[2 * i + 1] + t * (shape[2 * i + 3] - shape[2 * i + 1]) };
  };
  const a = at(s0), b = at(s1);
  const out: Flat = [a.x, a.y];
  for (let i = a.i + 1; i <= b.i; i++) out.push(shape[2 * i], shape[2 * i + 1]);
  out.push(b.x, b.y);
  return out;
}

function resample(pts: Flat, n: number): [number, number][] {
  const cum = cumulative(pts);
  const total = cum[cum.length - 1];
  const out: [number, number][] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const len = cum[i + 1] - cum[i] || 1;
    const t = Math.max(0, Math.min(1, (s - cum[i]) / len));
    out.push([pts[2 * i] + t * (pts[2 * i + 2] - pts[2 * i]), pts[2 * i + 1] + t * (pts[2 * i + 3] - pts[2 * i + 1])]);
  }
  return out;
}

function reverse(pts: Flat): Flat {
  const out: Flat = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
}

/** Distance from a point to a polyline, and whether the nearest point is one of the polyline's ends. */
function distToLine(px: number, py: number, pts: Flat): { d: number; end: boolean } {
  let best = Infinity, end = false;
  const last = pts.length - 4;
  for (let i = 0; i <= last; i += 2) {
    const ax = pts[i], ay = pts[i + 1], dx = pts[i + 2] - ax, dy = pts[i + 3] - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < best) (best = d), (end = (i === 0 && t === 0) || (i === last && t === 1));
  }
  return { d: best, end };
}

/** Largest sideways gap between two lines, ignoring where one overhangs the other's ends. */
function deviation(a: Flat, b: Flat): number {
  let worst = 0, n = 0;
  for (const [x, y] of resample(a, 16)) {
    const r = distToLine(x, y, b);
    if (r.end) continue;
    n++;
    worst = Math.max(worst, r.d);
  }
  return n >= 6 ? worst : Infinity;
}

/** Same track: similar length and each line stays close to the other (endpoints may be offset along the track). */
function similar(a: Flat, b: Flat, tol: number): boolean {
  const la = cumulative(a).at(-1)!, lb = cumulative(b).at(-1)!;
  if (Math.abs(la - lb) > Math.max(120, 0.3 * Math.max(la, lb))) return false;
  return deviation(a, b) < tol && deviation(b, a) < tol;
}

// ---------------------------------------------------------------------------
// Track levels from OpenStreetMap (tunnel / at grade / bridge or viaduct)
// ---------------------------------------------------------------------------

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const CELL = 100;

interface OsmWay {
  kind: string;
  level: number;
  pts: Flat;
}

async function loadOsmRail(): Promise<OsmWay[]> {
  const file = join(CACHE, 'osm-rail.json');
  if (REFRESH || !existsSync(file)) {
    console.log('querying Overpass for railway levels');
    const q = `[out:json][timeout:180];way["railway"~"^(subway|light_rail|rail|tram|monorail|narrow_gauge|funicular)$"](${S},${W},${N},${E});out tags geom;`;
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': 'tiny-trains-build/0.1' },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  const json = JSON.parse(readFileSync(file, 'utf8')) as { elements: { tags?: Row; geometry?: { lat: number; lon: number }[] }[] };
  const out: OsmWay[] = [];
  for (const e of json.elements) {
    const t = e.tags ?? {};
    if (!e.geometry || t.tunnel === 'building_passage') continue;
    const level = t.tunnel && t.tunnel !== 'no' ? -1 : t.bridge && t.bridge !== 'no' ? 1 : Number(t.layer ?? 0) < 0 ? -1 : 0;
    out.push({ kind: t.railway, level, pts: e.geometry.flatMap((g) => project(g.lon, g.lat)) });
  }
  return out;
}

const osmWays = await loadOsmRail();
const osmGrid = new Map<string, [number, number][]>();
osmWays.forEach((w, wi) => {
  for (let i = 0; i + 3 < w.pts.length; i += 2) {
    const x0 = Math.floor(Math.min(w.pts[i], w.pts[i + 2]) / CELL), x1 = Math.floor(Math.max(w.pts[i], w.pts[i + 2]) / CELL);
    const y0 = Math.floor(Math.min(w.pts[i + 1], w.pts[i + 3]) / CELL), y1 = Math.floor(Math.max(w.pts[i + 1], w.pts[i + 3]) / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const k = `${cx},${cy}`;
        const list = osmGrid.get(k) ?? [];
        osmGrid.set(k, list);
        list.push([wi, i]);
      }
  }
});

/** Level of the nearest OSM track of the given kinds within 25 m, or null. */
function levelAt(x: number, y: number, kinds: Set<string>): number | null {
  let best = 25, level: number | null = null;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (const [wi, i] of osmGrid.get(`${cx + dx},${cy + dy}`) ?? []) {
        const w = osmWays[wi];
        if (!kinds.has(w.kind)) continue;
        const ax = w.pts[i], ay = w.pts[i + 1], ex = w.pts[i + 2] - ax, ey = w.pts[i + 3] - ay, len2 = ex * ex + ey * ey;
        const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0;
        const d = Math.hypot(x - ax - t * ex, y - ay - t * ey);
        if (d < best) (best = d), (level = w.level);
      }
  return level;
}

/** Densify, classify each point's level, drop blips under 40 m, then simplify each constant-level run separately. */
function withLevels(raw: Flat, kinds: Set<string>): { pts: Flat; el: number[] } {
  const dense: Flat = [raw[0], raw[1]];
  for (let i = 2; i < raw.length; i += 2) {
    const n = Math.ceil(Math.hypot(raw[i] - raw[i - 2], raw[i + 1] - raw[i - 1]) / 8);
    for (let k = 1; k <= n; k++) dense.push(raw[i - 2] + ((raw[i] - raw[i - 2]) * k) / n, raw[i - 1] + ((raw[i + 1] - raw[i - 1]) * k) / n);
  }
  const m = dense.length / 2;
  const lv: (number | null)[] = [];
  for (let i = 0; i < m; i++) lv.push(levelAt(dense[2 * i], dense[2 * i + 1], kinds));
  // unknown points take the nearest known level (0 if none)
  for (let i = 0; i < m; i++) {
    if (lv[i] != null) continue;
    let k = 1;
    while (k < m && lv[i - k] == null && lv[i + k] == null) k++;
    lv[i] = lv[i - k] ?? lv[i + k] ?? 0;
  }
  // runs shorter than 40 m (5 dense points) take their predecessor's level
  for (let i = 0; i < m; ) {
    let j = i;
    while (j < m && lv[j] === lv[i]) j++;
    if (j - i < 5 && i > 0) for (let k = i; k < j; k++) lv[k] = lv[i - 1];
    i = j;
  }
  // Each run keeps its own ends, so a level change happens within one 8 m step instead of ramping between vertices.
  const pts: Flat = [];
  const el: number[] = [];
  for (let i = 0; i < m; ) {
    let j = i;
    while (j < m && lv[j] === lv[i]) j++;
    const run = simplify(dense.slice(2 * i, 2 * j), 2);
    for (let k = 0; k < run.length; k += 2) {
      pts.push(run[k], run[k + 1]);
      el.push(lv[i]!);
    }
    i = j;
  }
  return { pts, el };
}

// ---------------------------------------------------------------------------
// Network assembly shared by all agencies
// ---------------------------------------------------------------------------

interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  lines: Set<string>;
}

interface Trip {
  id: string;
  service: string;
  line: string;
  dir: number;
  head: string;
  label: string;
  shape: string;
  stops: { stop: string; station: string; a: number; d: number }[];
}

const stations = new Map<string, Station>();
const segs = new Map<string, { from: string; to: string; lines: Set<string>; pts: Flat; el?: number[]; n: number }[]>();
const stats = { pairs: 0, straight: 0, farEnds: 0, variants: 0 };

function addSegment(from: string, to: string, line: string, pts: Flat, el?: number[]) {
  const [a, b] = from < to ? [from, to] : [to, from];
  const oriented = from < to ? pts : reverse(pts);
  const orientedEl = el && (from < to ? el : [...el].reverse());
  const key = `${a}|${b}`;
  const list = segs.get(key) ?? [];
  segs.set(key, list);
  const hit = list.find((s) => similar(s.pts, oriented, 30));
  if (hit) {
    hit.lines.add(line);
    hit.n++;
    return;
  }
  if (list.length) {
    stats.variants++;
    if (DEBUG) {
      const b = list[0].pts, la = cumulative(oriented).at(-1)!, lb = cumulative(b).at(-1)!;
      const d1 = deviation(oriented, b), d2 = deviation(b, oriented);
      console.log(`variant ${line} ${from}-${to} (${list.map((s) => [...s.lines].join('+')).join(' | ')}) len ${la.toFixed(0)}/${lb.toFixed(0)} dev ${d1.toFixed(0)}/${d2.toFixed(0)}`);
    }
  }
  list.push({ from: a, to: b, lines: new Set([line]), pts: oriented, el: orientedEl, n: 1 });
}

const missing = new Map<string, { from: string; to: string; line: string; pts: Flat }>();

/** Cut the trip's shape into station-to-station pieces (once per distinct stop pattern + shape). */
/** `kinds`: the OSM railway=* values this line's track uses, for the level lookup. */
function addGeometry(trips: Trip[], shapes: Map<string, Flat>, stopXY: (stop: string) => [number, number], kinds: (line: string) => string[]) {
  const done = new Set<string>();
  const cache = new Map<string, number[]>();
  for (const t of trips) {
    const key = `${t.line}|${t.shape}|${t.stops.map((s) => s.stop).join(',')}`;
    if (done.has(key)) continue;
    done.add(key);
    const shape = shapes.get(t.shape);
    const xy = t.stops.map((s) => stopXY(s.stop));
    let loc: ({ s: number; d: number } | null)[] = xy.map(() => null);
    let cum: number[] = [];
    if (shape) {
      cum = cache.get(t.shape) ?? cumulative(shape);
      cache.set(t.shape, cum);
      loc = locate(shape, cum, xy);
    }
    for (let i = 0; i + 1 < t.stops.length; i++) {
      const A = t.stops[i].station, B = t.stops[i + 1].station;
      if (A === B) continue;
      const la = loc[i], lb = loc[i + 1];
      if (!shape || !la || !lb || la.d > 150 || lb.d > 150 || lb.s - la.s < 5) {
        if (DEBUG) console.log(`unplaced ${t.line} ${A}-${B} shape=${t.shape} d=${la?.d.toFixed(0)},${lb?.d.toFixed(0)}`);
        missing.set(`${A}|${B}|${t.line}`, { from: A, to: B, line: t.line, pts: [...xy[i], ...xy[i + 1]] });
        continue;
      }
      stats.pairs++;
      const pts = slice(shape, cum, la.s, lb.s);
      const sa = stations.get(A)!, sb = stations.get(B)!;
      const far = Math.max(Math.hypot(pts[0] - sa.x, pts[1] - sa.y), Math.hypot(pts.at(-2)! - sb.x, pts.at(-1)! - sb.y));
      if (far > 150) {
        stats.farEnds++;
        if (DEBUG) console.log(`far ${t.line} ${A}(${sa.name})-${B}(${sb.name}) ${far.toFixed(0)} m, stop offsets ${la.d.toFixed(0)}/${lb.d.toFixed(0)}`);
      }
      const { pts: out, el } = withLevels(pts, new Set(kinds(t.line)));
      addSegment(A, B, t.line, out, el);
    }
  }
}

/** Straight lines only for station pairs that no shape covered at all. */
function fillMissing() {
  for (const m of missing.values()) {
    const [a, b] = m.from < m.to ? [m.from, m.to] : [m.to, m.from];
    const list = segs.get(`${a}|${b}`);
    if (list?.length) {
      if (!list.some((s) => s.lines.has(m.line))) list[0].lines.add(m.line);
      continue;
    }
    stats.straight++;
    console.warn(`no shape for ${m.line} ${m.from} -> ${m.to}, using a straight line`);
    addSegment(m.from, m.to, m.line, m.pts);
  }
}

/** Dwell for feeds that give a single time per stop, then pack the trips into the compact timetable. */
function buildSchedule(agency: string, trips: Trip[], services: Record<string, ServiceDef>, stopMap: Record<string, string>, routes: Record<string, string>, halfDwell: number): Schedule {
  const pats: PatternDef[] = [];
  const patIdx = new Map<string, number>();
  const tims: number[][] = [];
  const timIdx = new Map<string, number>();
  const heads: string[] = [];
  const headIdx = new Map<string, number>();
  const out: TripRow[] = [];
  for (const t of trips) {
    const st = t.stops.map((s) => s.station);
    const pk = `${t.line}|${t.dir}|${st.join(',')}`;
    if (!patIdx.has(pk)) patIdx.set(pk, pats.push({ line: t.line, dir: t.dir, st }) - 1);
    const t0 = t.stops[0].a;
    const tm: number[] = [];
    const n = t.stops.length;
    for (let i = 0; i < n; i++) {
      let { a, d } = t.stops[i];
      if (a === d && i > 0 && i < n - 1) {
        const h = Math.min(halfDwell, (a - t.stops[i - 1].d) / 4, (t.stops[i + 1].a - d) / 4);
        a -= h;
        d += h;
      }
      tm.push(Math.round(a - t0), Math.round(d - t0));
    }
    const tk = tm.join(',');
    if (!timIdx.has(tk)) timIdx.set(tk, tims.push(tm) - 1);
    if (!headIdx.has(t.head)) headIdx.set(t.head, heads.push(t.head) - 1);
    out.push([t.id, t.service, patIdx.get(pk)!, timIdx.get(tk)!, t0, headIdx.get(t.head)!, t.label]);
  }
  const used = new Set(trips.map((t) => t.service));
  const svc = Object.fromEntries(Object.entries(services).filter(([id]) => used.has(id)));
  return { agency, built: new Date().toISOString(), services: svc, stopMap, routes, heads, pats, tims, trips: out };
}

/** Stations sit at the mean of the platforms that trips actually use (parent-station points can be off by 200 m). */
const platforms = new Map<string, Map<string, [number, number]>>();
function addStation(id: string, name: string, stop: string, lon: number, lat: number) {
  if (!stations.has(id)) stations.set(id, { id, name, x: 0, y: 0, lines: new Set() });
  const m = platforms.get(id) ?? new Map();
  platforms.set(id, m);
  if (m.has(stop)) return;
  m.set(stop, project(lon, lat));
  const pts = [...m.values()];
  const st = stations.get(id)!;
  st.x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  st.y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
}

function markLines(trips: Trip[]) {
  for (const t of trips) for (const s of t.stops) stations.get(s.station)!.lines.add(t.line);
}

/** Merge consecutive visits to the same station (e.g. the SFO reversal) into one stop. */
function dedupeStops(stops: Trip['stops']): Trip['stops'] {
  const out: Trip['stops'] = [];
  for (const s of stops) {
    const p = out.at(-1);
    if (p && p.station === s.station) p.d = Math.max(p.d, s.d);
    else out.push({ ...s });
  }
  return out;
}

// ---------------------------------------------------------------------------
// BART
// ---------------------------------------------------------------------------

const BART_LINES: Record<string, string> = { '1': 'bart-yellow', '2': 'bart-yellow', '3': 'bart-orange', '4': 'bart-orange', '5': 'bart-green', '6': 'bart-green', '7': 'bart-red', '8': 'bart-red', '11': 'bart-blue', '12': 'bart-blue', '19': 'bart-oak', '20': 'bart-oak' };

async function buildBart(lines: LineDef[]): Promise<Schedule> {
  const zip = await download('bart');
  const stopRows = new Map(table(zip, 'stops.txt').map((r) => [r.stop_id, r]));
  const station = (stop: string) => stopRows.get(stop)?.parent_station || stop;
  const routes = table(zip, 'routes.txt');
  const trips = table(zip, 'trips.txt').filter((t) => BART_LINES[t.route_id]);
  const st = loadStopTimes(zip, new Set(trips.map((t) => t.trip_id)));
  const shapes = loadShapes(zip, new Set(trips.map((t) => t.shape_id)));
  const services = loadServices(zip, new Set(trips.map((t) => t.service_id)));

  const LINE_NAMES: Record<string, string> = { 'bart-yellow': 'Yellow Line', 'bart-orange': 'Orange Line', 'bart-green': 'Green Line', 'bart-red': 'Red Line', 'bart-blue': 'Blue Line', 'bart-oak': 'Oakland Airport' };
  const STOCK: Record<string, string> = { 'bart-oak': 'sf-bart-cable-liner' };
  for (const [id, name] of Object.entries(LINE_NAMES)) {
    const r = routes.find((r) => BART_LINES[r.route_id] === id)!;
    lines.push({ id, system: 'bart', name, short: '', color: `#${r.route_color.toUpperCase()}`, textColor: `#${r.route_text_color.toUpperCase()}`, kind: id === 'bart-oak' ? 'agt' : 'metro', bullet: 'bar', stock: STOCK[id] ?? 'sf-bart-fotf' });
  }

  const main: Trip[] = [];
  const geo: Trip[] = [];
  for (const t of trips) {
    const raw = st.get(t.trip_id);
    if (!raw || raw.length < 2) continue;
    const stops = raw.map((s) => ({ stop: s.stop, station: `bart:${station(s.stop)}`, a: s.a, d: s.d }));
    for (const s of stops) {
      const r = stopRows.get(s.stop)!;
      addStation(s.station, stopRows.get(s.station.slice(5))!.stop_name, s.stop, Number(r.stop_lon), Number(r.stop_lat));
    }
    const head = t.trip_headsign.split(' / ').at(-1)!.replace(/\s*\(.*\)$/, '');
    const base: Omit<Trip, 'stops'> = { id: t.trip_id, service: t.service_id, line: BART_LINES[t.route_id], dir: Number(t.direction_id), head, label: '', shape: t.shape_id };
    // Antioch trips are modeled as through trips, but eBART DMUs shuttle Antioch <-> Pittsburg/Bay Point.
    const isE = (s: { stop: string }) => /^E\d/.test(s.stop);
    if (stops.some(isE)) {
      const ebart = stops.filter((s, i) => isE(s) || (s.station === 'bart:PITT' && (isE(stops[i - 1] ?? s) || isE(stops[i + 1] ?? s))));
      geo.push({ ...base, id: `${t.trip_id}e`, stops: dedupeStops(ebart) });
    }
    const kept = dedupeStops(stops.filter((s) => !isE(s)));
    if (kept.length >= 2) main.push({ ...base, stops: kept });
  }
  markLines(main);
  markLines(geo);
  const xy = (stop: string): [number, number] => {
    const r = stopRows.get(stop)!;
    return project(Number(r.stop_lon), Number(r.stop_lat));
  };
  addGeometry(main, shapes, xy, () => ['subway', 'monorail']);
  addGeometry(geo, shapes, xy, () => ['light_rail', 'subway']); // eBART is light_rail in OSM
  const stopMap: Record<string, string> = {};
  for (const [id, r] of stopRows) if (r.location_type === '0' || r.location_type === '') if (stations.has(`bart:${r.parent_station || id}`)) stopMap[id] = `bart:${r.parent_station || id}`;
  return buildSchedule('bart', main, services, stopMap, BART_LINES, 10);
}

// ---------------------------------------------------------------------------
// Muni
// ---------------------------------------------------------------------------

const MUNI_RAIL = ['J', 'K', 'L', 'M', 'N', 'T', 'F', 'E', 'S', 'PH', 'PM', 'CA'];

function muniStationName(name: string): string {
  return name
    .replace(/^Metro\s+/i, '')
    .replace(/\s*\/\s*(Outbound|Outbd|Downtown|Downtn|Inbound|Inbd)$/i, '')
    .replace(/\s+(Outbound|Inbound|Northbound|Southbound|Outbd|Inbd)$/i, '')
    .replace(/\s+Station$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function buildMuni(lines: LineDef[]): Promise<Schedule> {
  const zip = await download('muni');
  const code = (r: Row) => r.route_short_name || r.route_id;
  const routes = table(zip, 'routes.txt').filter((r) => MUNI_RAIL.includes(code(r)) && r.route_type !== '3');
  const routeLine = Object.fromEntries(routes.map((r) => [r.route_id, `muni-${code(r)}`]));
  const trips = table(zip, 'trips.txt').filter((t) => routeLine[t.route_id]);
  const st = loadStopTimes(zip, new Set(trips.map((t) => t.trip_id)));
  const shapes = loadShapes(zip, new Set(trips.map((t) => t.shape_id)));
  const services = loadServices(zip, new Set(trips.map((t) => t.service_id)));
  const stopRows = new Map(table(zip, 'stops.txt').map((r) => [r.stop_id, r]));

  const CABLE = new Set(['PH', 'PM', 'CA']);
  const STOCK: Record<string, string> = { F: 'sf-muni-pcc-1058', E: 'sf-muni-pcc-1058', PH: 'sf-cable-powell', PM: 'sf-cable-powell', CA: 'sf-cable-california' };
  const NAMES: Record<string, string> = { F: 'F Market & Wharves', E: 'E Embarcadero', PH: 'Powell–Hyde Cable Car', PM: 'Powell–Mason Cable Car', CA: 'California Cable Car' };
  const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  for (const r of routes) {
    const c = code(r);
    if (lines.some((l) => l.id === `muni-${c}`)) continue;
    lines.push({
      id: `muni-${c}`,
      system: 'muni',
      name: NAMES[c] ?? `${c} ${title(r.route_long_name)}`,
      short: c,
      color: `#${(r.route_color || '666666').toUpperCase()}`,
      textColor: `#${(r.route_text_color || 'FFFFFF').toUpperCase()}`,
      kind: CABLE.has(c) ? 'cable' : c === 'F' || c === 'E' ? 'tram' : 'light',
      bullet: 'circle',
      stock: STOCK[c] ?? 'sf-muni-lrv4',
    });
  }

  // Merge each stop with its opposite-direction twin (same cleaned name, close together) into one station.
  const used = new Set<string>();
  for (const list of st.values()) for (const s of list) used.add(s.stop);
  const ids = [...used].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const groupOf = new Map<string, string>();
  const groups = new Map<string, { name: string; x: number; y: number; members: string[] }>();
  for (const id of ids) {
    const r = stopRows.get(id)!;
    const name = muniStationName(r.stop_name);
    const [x, y] = project(Number(r.stop_lon), Number(r.stop_lat));
    const limit = /station/i.test(r.stop_name) ? 160 : 70;
    let hit: string | undefined;
    for (const [gid, g] of groups) if (g.name === name && Math.hypot(g.x - x, g.y - y) < limit) hit = gid;
    if (hit) {
      const g = groups.get(hit)!;
      g.members.push(id);
      g.x += (x - g.x) / g.members.length;
      g.y += (y - g.y) / g.members.length;
      groupOf.set(id, hit);
    } else {
      groups.set(`muni:${id}`, { name, x, y, members: [id] });
      groupOf.set(id, `muni:${id}`);
    }
  }
  for (const [gid, g] of groups) stations.set(gid, { id: gid, name: g.name, x: g.x, y: g.y, lines: new Set() });

  const out: Trip[] = [];
  for (const t of trips) {
    const raw = st.get(t.trip_id);
    if (!raw || raw.length < 2) continue;
    const stops = dedupeStops(raw.map((s) => ({ stop: s.stop, station: groupOf.get(s.stop)!, a: s.a, d: s.d })));
    if (stops.length < 2) continue;
    const head = t.trip_headsign || stations.get(stops.at(-1)!.station)!.name;
    out.push({ id: t.trip_id, service: t.service_id, line: routeLine[t.route_id], dir: Number(t.direction_id), head, label: '', shape: t.shape_id, stops });
  }
  markLines(out);
  addGeometry(
    out,
    shapes,
    (stop) => {
      const r = stopRows.get(stop)!;
      return project(Number(r.stop_lon), Number(r.stop_lat));
    },
    (line) => (line === 'muni-F' || line === 'muni-E' ? ['tram'] : CABLE.has(line.slice(5)) ? [] : ['light_rail']),
  );
  const stopMap: Record<string, string> = {};
  for (const [id, g] of groupOf) {
    const c = stopRows.get(id)!.stop_code;
    if (c && !stopRows.has(c)) stopMap[c] = g;
    stopMap[id] = g;
  }
  return buildSchedule('muni', out, services, stopMap, routeLine, 10);
}

// ---------------------------------------------------------------------------
// Caltrain
// ---------------------------------------------------------------------------

async function buildCaltrain(lines: LineDef[]): Promise<Schedule> {
  const zip = await download('caltrain');
  const routes = table(zip, 'routes.txt');
  const LINES: [RegExp, string, string, string][] = [
    [/south county/i, 'ct-south', 'South County Connector', 'SC'],
    [/local/i, 'ct-local', 'Local', 'L'],
    [/limited/i, 'ct-limited', 'Limited', 'LTD'],
    [/express|bullet/i, 'ct-express', 'Express', 'EXP'],
  ];
  const routeLine = new Map<string, string>();
  for (const r of routes) {
    const def = LINES.find(([re]) => re.test(`${r.route_short_name} ${r.route_long_name} ${r.route_desc}`));
    if (!def) continue;
    routeLine.set(r.route_id, def[1]);
    if (lines.some((l) => l.id === def[1])) continue;
    lines.push({ id: def[1], system: 'caltrain', name: `Caltrain ${def[2]}`, short: def[3], color: `#${(r.route_color || 'E31837').toUpperCase()}`, textColor: `#${(r.route_text_color || 'FFFFFF').toUpperCase()}`, kind: 'rail', bullet: 'pill', stock: def[1] === 'ct-south' ? 'sf-caltrain-diesel' : 'sf-caltrain-kiss' });
  }
  const trips = table(zip, 'trips.txt').filter((t) => routeLine.has(t.route_id));
  const st = loadStopTimes(zip, new Set(trips.map((t) => t.trip_id)));
  const shapes = loadShapes(zip, new Set(trips.map((t) => t.shape_id)));
  const services = loadServices(zip, new Set(trips.map((t) => t.service_id)));
  const stopRows = new Map(table(zip, 'stops.txt').map((r) => [r.stop_id, r]));
  const ctName = (name: string) => name.replace(/\s+(Caltrain|Station|Northbound|Southbound|NB|SB)\b/gi, '').trim();
  // Platforms group under their parent station (or, in feeds without parents, under the cleaned station name).
  const parentOf = (r: Row) => r.parent_station || ctName(r.stop_name).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const sid = (parent: string) => `ct:${parent === 'place_MLBR' ? 'millbrae' : parent}`;
  const inside = (r: Row) => {
    const lon = Number(r.stop_lon), lat = Number(r.stop_lat);
    return lon >= W && lon <= E && lat >= S && lat <= N;
  };
  const out: Trip[] = [];
  for (const t of trips) {
    const raw = st.get(t.trip_id);
    if (!raw) continue;
    const stops = raw
      .filter((s) => stopRows.has(s.stop) && inside(stopRows.get(s.stop)!))
      .map((s) => ({ stop: s.stop, station: sid(parentOf(stopRows.get(s.stop)!)), a: s.a, d: s.d }));
    if (stops.length < 2) continue;
    for (const s of stops) {
      const r = stopRows.get(s.stop)!;
      const name = ctName(stopRows.get(r.parent_station)?.stop_name ?? r.stop_name);
      addStation(s.station, name, s.stop, Number(r.stop_lon), Number(r.stop_lat));
    }
    out.push({ id: t.trip_id, service: t.service_id, line: routeLine.get(t.route_id)!, dir: Number(t.direction_id), head: t.trip_headsign, label: t.trip_short_name || t.trip_id, shape: t.shape_id, stops: dedupeStops(stops) });
  }
  markLines(out);
  addGeometry(
    out,
    shapes,
    (stop) => {
      const r = stopRows.get(stop)!;
      return project(Number(r.stop_lon), Number(r.stop_lat));
    },
    () => ['rail'],
  );
  const stopMap: Record<string, string> = {};
  for (const [id, r] of stopRows) if (stations.has(sid(parentOf(r)))) stopMap[id] = sid(parentOf(r));
  return buildSchedule('caltrain', out, services, stopMap, Object.fromEntries(routeLine), 20);
}

// ---------------------------------------------------------------------------

function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  console.log(`wrote ${file.slice(ROOT.length + 1)} (${(text.length / 1024).toFixed(0)} KB)`);
}

const lines: LineDef[] = [];
const bart = await buildBart(lines);
const muni = await buildMuni(lines);
const caltrain = await buildCaltrain(lines);
fillMissing();

const systems: SystemDef[] = [
  { id: 'bart', name: 'BART', live: 'realtime' },
  { id: 'muni', name: 'Muni', live: 'scheduled' },
  { id: 'caltrain', name: 'Caltrain', live: 'scheduled' },
];

const segments: SegmentDef[] = [];
for (const list of segs.values()) {
  list.sort((a, b) => b.n - a.n);
  for (const s of list) {
    const seg: SegmentDef = { from: s.from, to: s.to, lines: [...s.lines].sort(), pts: roundFlat(s.pts) };
    if (s.el?.some((v) => v !== 0)) seg.el = s.el;
    segments.push(seg);
  }
}
const stationDefs: StationDef[] = [...stations.values()]
  .filter((s) => s.lines.size)
  .map((s) => ({ id: s.id, name: s.name, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, lines: [...s.lines].sort() }));

const transit: TransitData = {
  city: 'sf',
  built: new Date().toISOString().slice(0, 10),
  attribution: [
    'BART schedules & realtime: Bay Area Rapid Transit',
    'Muni: SFMTA transit data, reproduced with permission granted by the City and County of San Francisco',
    'Caltrain GTFS: Caltrain / Trillium Transit',
    'Track levels © OpenStreetMap contributors',
  ],
  systems,
  lines,
  stations: stationDefs,
  segments,
};
writeJson(join(ROOT, 'public/data/sf/transit.json'), transit);
writeJson(join(ROOT, 'server/data/sf/bart.json'), bart);
writeJson(join(ROOT, 'server/data/sf/muni.json'), muni);
writeJson(join(ROOT, 'server/data/sf/caltrain.json'), caltrain);
console.log(`stations ${stationDefs.length}, segments ${segments.length}, lines ${lines.length}`);
console.log(`pairs ${stats.pairs}, straight fallbacks ${stats.straight}, far ends ${stats.farEnds}, geometry variants ${stats.variants}`);
console.log(`trips: bart ${bart.trips.length}, muni ${muni.trips.length}, caltrain ${caltrain.trips.length}`);
