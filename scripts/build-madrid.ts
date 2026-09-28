// Builds public/data/madrid/transit.json and the compact timetables in server/data/madrid/ from the CRTM Metro and
// Metro Ligero GTFS feeds and Renfe's Cercanías GTFS. Track geometry is routed over OpenStreetMap's railway network,
// guided by the feeds' shapes and OSM route relations.
// Run: npx tsx scripts/build-madrid.ts [--refresh] [--debug]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { CITIES } from '../shared/cities.ts';
import { makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, SystemDef, TransitData } from '../shared/types.ts';
import { LINES, type MadridLine } from '../server/adapters/madrid/lines.ts';
import type { PatternDef, Schedule, TripRow } from '../server/adapters/madrid/schedule.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/madrid');
const REFRESH = process.argv.includes('--refresh');
const DEBUG = process.argv.includes('--debug');
const UA = 'TinyTrains/0.1 (transit diorama data build)';
const { project, unproject } = makeProjection('madrid');
const [W, S, E, N] = CITIES.madrid.bbox;
const inBox = (lon: number, lat: number) => lon >= W && lon <= E && lat >= S && lat <= N;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SOURCES = {
  metro: 'https://crtm.maps.arcgis.com/sharing/rest/content/items/5c7f2951962540d69ffe8f640d94c246/data',
  // CRTM's current Metro feed (May 2025) lacks Line 3; its March 2025 feed, archived by the Mobility Database, has it.
  metroOld: 'https://files.mobilitydatabase.org/mdb-794/mdb-794-202503270057/mdb-794-202503270057.zip',
  ml: 'https://crtm.maps.arcgis.com/sharing/rest/content/items/aaed26cc0ff64b0c947ac0bc3e033196/data',
  renfe: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',
};
const CACHE_NAMES: Record<keyof typeof SOURCES, string> = { metro: 'metro.zip', metroOld: 'metro-2025-03.zip', ml: 'ml.zip', renfe: 'renfe_cer.zip' };
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const OSM_BOX = `${S - 0.03},${W - 0.02},${N + 0.02},${E + 0.02}`;

// Weekday public holidays in Madrid beyond the feeds' own calendars (national, regional and city).
const EXTRA_HOLIDAYS = [20270101, 20270106, 20270325, 20270326, 20271012, 20271101, 20271109, 20271206, 20271208];

// ---------------------------------------------------------------------------
// Downloads and GTFS parsing
// ---------------------------------------------------------------------------

type Row = Record<string, string>;
type Zip = Record<string, Uint8Array>;

async function download(name: keyof typeof SOURCES): Promise<Zip> {
  const file = join(CACHE, CACHE_NAMES[name]);
  if (REFRESH || !existsSync(file)) {
    console.log(`downloading ${SOURCES[name]}`);
    const res = await fetch(SOURCES[name], { redirect: 'follow', headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return unzipSync(readFileSync(file));
}

async function overpass<T>(name: string, query: string): Promise<T> {
  const file = join(CACHE, name);
  if (!REFRESH && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  let lastErr = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text) as T;
        mkdirSync(CACHE, { recursive: true });
        writeFileSync(file, text);
        return data;
      }
      lastErr = `${res.status} ${url}`;
    } catch (err) {
      lastErr = `${err} ${url}`;
    }
    console.warn(`  retry ${name}: ${lastErr}`);
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`Overpass failed: ${lastErr}`);
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

/** Rows of a GTFS table. With `prefix`, only lines starting with it are decoded (Renfe's stop_times is 240 MB). */
function* rows(zip: Zip, name: string, prefix?: string): Generator<Row> {
  const key = Object.keys(zip).find((k) => k === name || k.endsWith(`/${name}`));
  if (!key) return;
  const buf = zip[key];
  const dec = new TextDecoder();
  const pre = prefix ? new TextEncoder().encode(prefix) : null;
  let head: string[] | null = null;
  for (let start = 0; start < buf.length; ) {
    let end = buf.indexOf(10, start);
    if (end < 0) end = buf.length;
    let skip = false;
    if (head && pre) for (let i = 0; i < pre.length && !skip; i++) skip = buf[start + i] !== pre[i];
    if (!skip) {
      const line = dec.decode(buf.subarray(start, end)).replace(/\r$/, '');
      if (!head) head = splitCsv(line.replace(/^\uFEFF/, '')).map((h) => h.trim());
      else if (line.trim()) {
        const cells = splitCsv(line);
        const row: Row = {};
        for (let j = 0; j < head.length; j++) row[head[j]] = (cells[j] ?? '').trim();
        yield row;
      }
    }
    start = end + 1;
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
  seq: number;
}

function loadStopTimes(zip: Zip, keep: Set<string>, prefix?: string): Map<string, StopTime[]> {
  const out = new Map<string, StopTime[]>();
  for (const r of rows(zip, 'stop_times.txt', prefix)) {
    if (!keep.has(r.trip_id)) continue;
    let list = out.get(r.trip_id);
    if (!list) out.set(r.trip_id, (list = []));
    list.push({ stop: r.stop_id, a: secs(r.arrival_time || r.departure_time), d: secs(r.departure_time || r.arrival_time), seq: Number(r.stop_sequence) });
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

// ---------------------------------------------------------------------------
// Polyline helpers
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
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
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

/** Nearest point of a polyline: distance, along-line position and segment index. */
function nearest(px: number, py: number, pts: Flat, cum: number[], lo = 0, hi = pts.length / 2 - 1): { d: number; s: number; i: number; t: number } {
  let best = { d: Infinity, s: 0, i: lo, t: 0 };
  for (let i = lo; i < hi; i++) {
    const ax = pts[2 * i], ay = pts[2 * i + 1], dx = pts[2 * i + 2] - ax, dy = pts[2 * i + 3] - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
    if (d < best.d) best = { d, s: cum[i] + t * Math.sqrt(len2), i, t };
  }
  return best;
}

/**
 * Along-shape positions of each stop, monotonic, minimizing total offset (dynamic programming over the local minima
 * of the distance to the shape). Stops that don't fit come back null.
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
    const local = ds.filter((c, i) => c.d < 400 && (i === 0 || c.d <= ds[i - 1].d) && (i === nseg - 1 || c.d <= ds[i + 1].d));
    local.sort((a, b) => a.d - b.d);
    cands.push([...local.slice(0, 8), null]);
  }
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

/** Largest sideways gap between two lines, ignoring where one overhangs the other's ends. */
function deviation(a: Flat, b: Flat): number {
  const cb = cumulative(b);
  let worst = 0, n = 0;
  for (const [x, y] of resample(a, 16)) {
    const r = nearest(x, y, b, cb);
    const end = (r.i === 0 && r.t === 0) || (r.i === b.length / 2 - 2 && r.t === 1);
    if (end) continue;
    n++;
    worst = Math.max(worst, r.d);
  }
  return n >= 6 ? worst : Infinity;
}

function similar(a: Flat, b: Flat, tol: number): boolean {
  const la = cumulative(a).at(-1)!, lb = cumulative(b).at(-1)!;
  if (Math.abs(la - lb) > Math.max(120, 0.3 * Math.max(la, lb))) return false;
  return deviation(a, b) < tol && deviation(b, a) < tol;
}

// ---------------------------------------------------------------------------
// OpenStreetMap railway graph and router
// ---------------------------------------------------------------------------

interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string }[];
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
}

const osmRail = await overpass<{ elements: OsmElement[] }>(
  'osm-rail.json',
  `[out:json][timeout:240];way["railway"~"^(subway|light_rail|rail|tram|narrow_gauge|construction|disused)$"](${OSM_BOX});out body geom;`,
);
const osmRoutes = await overpass<{ elements: OsmElement[] }>('osm-routes.json', `[out:json][timeout:120];rel["route"~"^(subway|light_rail|tram|train)$"](${OSM_BOX});out body;`);
const osmStations = await overpass<{ elements: OsmElement[] }>(
  'osm-stations.json',
  `[out:json][timeout:120];(node["railway"~"^(station|halt|tram_stop)$"](${OSM_BOX});node["public_transport"="station"](${OSM_BOX});way["public_transport"="station"](${OSM_BOX});way["railway"="station"](${OSM_BOX}););out center tags;`,
);

const normRef = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** OSM way id -> refs of the route relations (per route type) that use it. */
const wayRoutes = new Map<number, Set<string>>();
for (const r of osmRoutes.elements) {
  const t = r.tags ?? {};
  if (!t.ref) continue;
  const key = `${t.route}:${normRef(t.ref)}`;
  for (const m of r.members ?? []) {
    if (m.type !== 'way') continue;
    let set = wayRoutes.get(m.ref);
    if (!set) wayRoutes.set(m.ref, (set = new Set()));
    set.add(key);
  }
}

const wayLevel = (t: Record<string, string>) =>
  t.tunnel && t.tunnel !== 'no' ? -1 : t.bridge && t.bridge !== 'no' ? 1 : Number(t.layer ?? 0) < 0 || t.location === 'underground' ? -1 : 0;

class RailGraph {
  xs: number[] = [];
  ys: number[] = [];
  out: number[][] = []; // directed edge ids leaving each node
  eFrom: number[] = [];
  eTo: number[] = [];
  eLen: number[] = [];
  eWay: number[] = [];
  ways: { id: number; level: number; name: string; mult: number; tags: Record<string, string> }[] = [];
  private grid = new Map<string, number[]>();

  constructor(elements: OsmElement[], accept: (t: Record<string, string>) => number) {
    const idx = new Map<number, number>();
    for (const e of elements) {
      const t = e.tags ?? {};
      if (e.type !== 'way' || !e.nodes || !e.geometry) continue;
      const mult = accept(t);
      if (!mult) continue;
      const wi = this.ways.push({ id: e.id, level: wayLevel(t), name: t.name ?? '', mult, tags: t }) - 1;
      let prev = -1;
      e.nodes.forEach((nid, k) => {
        let n = idx.get(nid);
        if (n === undefined) {
          const [x, y] = project(e.geometry![k].lon, e.geometry![k].lat);
          n = this.xs.push(x) - 1;
          this.ys.push(y);
          this.out.push([]);
          idx.set(nid, n);
          const key = `${Math.floor(x / 50)},${Math.floor(y / 50)}`;
          const cell = this.grid.get(key) ?? [];
          cell.push(n);
          this.grid.set(key, cell);
        }
        if (prev >= 0 && prev !== n) {
          const len = Math.hypot(this.xs[n] - this.xs[prev], this.ys[n] - this.ys[prev]);
          for (const [a, b] of [[prev, n], [n, prev]]) {
            const id = this.eFrom.push(a) - 1;
            this.eTo.push(b);
            this.eLen.push(len);
            this.eWay.push(wi);
            this.out[a].push(id);
          }
        }
        prev = n;
      });
    }
  }

  near(x: number, y: number, r: number): { n: number; d: number }[] {
    const out: { n: number; d: number }[] = [];
    const c = Math.ceil(r / 50);
    const cx = Math.floor(x / 50), cy = Math.floor(y / 50);
    for (let dx = -c; dx <= c; dx++)
      for (let dy = -c; dy <= c; dy++)
        for (const n of this.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = Math.hypot(this.xs[n] - x, this.ys[n] - y);
          if (d <= r) out.push({ n, d });
        }
    return out.sort((a, b) => a.d - b.d);
  }

  /**
   * Cheapest drivable path between the tracks near two points: no reversals (turns over 100°), edge cost = length ×
   * way multiplier × a penalty that grows with distance from the guide polyline. Returns node points and levels.
   */
  route(ax: number, ay: number, bx: number, by: number, r: number, wayMult: (wi: number) => number, guide: Flat | null, gTol: number, gScale: number) {
    const src = this.near(ax, ay, r).slice(0, 60);
    const dst = new Map(this.near(bx, by, r).slice(0, 60).map((c) => [c.n, c.d * 2]));
    if (!src.length || !dst.size) return null;
    const gcum = guide ? cumulative(guide) : null;
    const gpen = (x: number, y: number) => {
      if (!guide) return 1;
      const d = nearest(x, y, guide, gcum!).d;
      return d <= gTol ? 1 : Math.min(8, 1 + ((d - gTol) / gScale) ** 2);
    };
    const cost = (e: number) => {
      const a = this.eFrom[e], b = this.eTo[e];
      return this.eLen[e] * wayMult(this.eWay[e]) * gpen((this.xs[a] + this.xs[b]) / 2, (this.ys[a] + this.ys[b]) / 2);
    };
    const straight = Math.hypot(bx - ax, by - ay);
    const h = (n: number) => Math.max(0, Math.hypot(this.xs[n] - bx, this.ys[n] - by) - r);
    const dist = new Map<number, number>();
    const prev = new Map<number, number>();
    const heap: [number, number, number][] = []; // [f, g, edge]
    const push = (f: number, g: number, e: number) => {
      heap.push([f, g, e]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1, rr = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    for (const { n, d } of src)
      for (const e of this.out[n]) {
        const g = d * 2 + cost(e);
        if (g < (dist.get(e) ?? Infinity)) dist.set(e, g), prev.set(e, -1), push(g + h(this.eTo[e]), g, e);
      }
    let best = Infinity, bestE = -1, pops = 0;
    const limit = 12 * straight + 8000;
    while (heap.length && pops++ < 300_000) {
      const [f, g, e] = pop();
      if (f >= best) break;
      if (g > (dist.get(e) ?? Infinity) || g > limit) continue;
      const v = this.eTo[e], u = this.eFrom[e];
      const end = dst.get(v);
      if (end !== undefined && g + end < best) (best = g + end), (bestE = e);
      const ux = this.xs[v] - this.xs[u], uy = this.ys[v] - this.ys[u], ul = Math.hypot(ux, uy) || 1;
      for (const e2 of this.out[v]) {
        const w = this.eTo[e2];
        if (w === u) continue;
        const wx = this.xs[w] - this.xs[v], wy = this.ys[w] - this.ys[v];
        if ((ux * wx + uy * wy) / (ul * (Math.hypot(wx, wy) || 1)) < -0.2) continue;
        const g2 = g + cost(e2);
        if (g2 < (dist.get(e2) ?? Infinity)) dist.set(e2, g2), prev.set(e2, e), push(g2 + h(w), g2, e2);
      }
    }
    if (bestE < 0) return null;
    const edges: number[] = [];
    for (let e = bestE; e >= 0; e = prev.get(e)!) edges.push(e);
    edges.reverse();
    const pts: Flat = [this.xs[this.eFrom[edges[0]]], this.ys[this.eFrom[edges[0]]]];
    const lv: number[] = [this.ways[this.eWay[edges[0]]].level];
    let len = 0;
    for (const e of edges) {
      pts.push(this.xs[this.eTo[e]], this.ys[this.eTo[e]]);
      lv.push(this.ways[this.eWay[e]].level);
      len += this.eLen[e];
    }
    return { pts, lv, len };
  }

  /** Level of the nearest track within 25 m, or null. */
  levelAt(x: number, y: number): number | null {
    let best = 25, level: number | null = null;
    for (const { n } of this.near(x, y, 60))
      for (const e of this.out[n]) {
        const a = this.eFrom[e], b = this.eTo[e];
        const ex = this.xs[b] - this.xs[a], ey = this.ys[b] - this.ys[a], len2 = ex * ex + ey * ey;
        const t = len2 ? Math.max(0, Math.min(1, ((x - this.xs[a]) * ex + (y - this.ys[a]) * ey) / len2)) : 0;
        const d = Math.hypot(x - this.xs[a] - t * ex, y - this.ys[a] - t * ey);
        if (d < best) (best = d), (level = this.ways[this.eWay[e]].level);
      }
    return level;
  }
}

const skipService = (t: Record<string, string>) => t.service === 'yard' || t.service === 'siding' || t.service === 'spur';
const GRAPHS = {
  metro: new RailGraph(osmRail.elements, (t) => (t.railway === 'subway' ? (skipService(t) ? 3 : 1) : 0)),
  ml: new RailGraph(osmRail.elements, (t) => (t.railway === 'light_rail' || t.railway === 'tram' ? (skipService(t) ? 3 : 1) : 0)),
  cercanias: new RailGraph(osmRail.elements, (t) => {
    if (t.railway !== 'rail' || t.usage === 'industrial' || t.usage === 'military') return 0;
    if (t.gauge && !t.gauge.split(';').includes('1668')) return 0; // high-speed lines are standard gauge
    return skipService(t) ? 3 : t.highspeed === 'yes' ? 2 : 1;
  }),
};
console.log(`OSM graphs: metro ${GRAPHS.metro.xs.length} nodes, ml ${GRAPHS.ml.xs.length}, cercanías ${GRAPHS.cercanias.xs.length}; ${osmRoutes.elements.length} route relations`);

/** Cost multiplier of an OSM way for a line: its own route relation < unassigned track < another line's track. */
function wayMultFor(line: MadridLine, g: RailGraph): (wi: number) => number {
  const route = line.system === 'metro' ? 'subway' : line.system === 'ml' ? 'light_rail' : 'train';
  const ref = normRef(line.ref);
  const refs = line.system === 'cercanias' ? [ref, ref.replace(/[ab]$/, '')] : [ref];
  const cache = new Map<number, number>();
  return (wi) => {
    let m = cache.get(wi);
    if (m !== undefined) return m;
    const w = g.ways[wi];
    const rs = wayRoutes.get(w.id);
    const own = rs && [...rs].some((k) => refs.some((r) => k === `${route}:${r}` || (line.system === 'ml' && k === `tram:${r}`)));
    // Other lines' tracks: Metro lines never share track; Cercanías lines share a lot, so only a mild preference there.
    const other = rs && [...rs].some((k) => k.startsWith(`${route}:`) || (line.system === 'ml' && k.startsWith('tram:')));
    const named = line.system === 'metro' && /l[íi]nea\s*(\d+|r)\b|ramal/i.exec(w.name);
    const nameOwn = named && (named[1] ? normRef(named[1]) === ref : ref === 'r');
    m = w.mult * (own || nameOwn ? 1 : line.system === 'cercanias' ? 1.3 : other || named ? 3 : 1.5);
    cache.set(wi, m);
    return m;
  };
}

/** Per-point levels from a routed path: drop blips under 40 m, then simplify each constant-level run on its own. */
function withLevels(raw: Flat, lv: number[]): { pts: Flat; el: number[] } {
  const m = raw.length / 2;
  const cum = cumulative(raw);
  const levels = lv.slice();
  for (let i = 0; i < m; ) {
    let j = i;
    while (j < m && levels[j] === levels[i]) j++;
    if (i > 0 && j < m && cum[j - 1] - cum[i] < 40) for (let k = i; k < j; k++) levels[k] = levels[i - 1];
    i = j;
  }
  const pts: Flat = [];
  const el: number[] = [];
  for (let i = 0; i < m; ) {
    let j = i;
    while (j < m && levels[j] === levels[i]) j++;
    const run = simplify(raw.slice(2 * i, 2 * j), 2);
    for (let k = 0; k < run.length; k += 2) {
      pts.push(run[k], run[k + 1]);
      el.push(levels[i]);
    }
    i = j;
  }
  return { pts, el };
}

/** Densify a polyline and look up each point's level on the graph (for shape-based fallbacks). */
function levelsFromGraph(raw: Flat, g: RailGraph, dflt: number): number[] {
  return resample(raw, Math.max(2, Math.ceil((cumulative(raw).at(-1) ?? 0) / 8))).map(([x, y]) => g.levelAt(x, y) ?? dflt);
}

/** Cut a routed path so it starts and ends at the stations' projections onto it. */
function trimToStations(pts: Flat, lv: number[], ax: number, ay: number, bx: number, by: number) {
  const cum = cumulative(pts);
  const n = pts.length / 2;
  if (n < 2) return { pts, lv };
  const total = cum[n - 1];
  let half = 0;
  while (half < n - 2 && cum[half + 1] < total / 2) half++;
  const a = nearest(ax, ay, pts, cum, 0, half + 1);
  const b = nearest(bx, by, pts, cum, half, n - 1);
  if (b.s - a.s < 5) return { pts, lv };
  const at = (r: { i: number; t: number }): [number, number] => [pts[2 * r.i] + r.t * (pts[2 * r.i + 2] - pts[2 * r.i]), pts[2 * r.i + 1] + r.t * (pts[2 * r.i + 3] - pts[2 * r.i + 1])];
  const out: Flat = [...at(a)];
  const ol: number[] = [lv[a.i + 1]];
  for (let i = a.i + 1; i <= b.i; i++) out.push(pts[2 * i], pts[2 * i + 1]), ol.push(lv[i]);
  out.push(...at(b));
  ol.push(lv[b.i + 1]);
  return { pts: out, lv: ol };
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const osmNames = new Map<string, { name: string; x: number; y: number }[]>();
for (const e of osmStations.elements) {
  const name = e.tags?.name;
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  if (!name || lat == null || lon == null) continue;
  const [x, y] = project(lon, lat);
  const k = strip(name);
  osmNames.set(k, [...(osmNames.get(k) ?? []), { name, x, y }]);
}

const LOWER = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en']);
const ROMAN = /^(i|ii|iii|iv|vi|vii|viii|ix|xi|xii|xiii|xxi)$/;
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (w === 'estacion' ? 'estación' : w))
    .map((w, i) => (ROMAN.test(w) || /\d/.test(w) ? w.toUpperCase() : i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

/** Proper (accented) station name: OSM's spelling when a same-named station is close by, else title case. */
function niceName(raw: string, x: number, y: number): string {
  const hit = (osmNames.get(strip(raw)) ?? []).find((o) => Math.hypot(o.x - x, o.y - y) < 1500);
  return hit ? hit.name : titleCase(raw);
}

interface Station {
  id: string;
  name: string;
  plats: Map<string, [number, number]>;
  lines: Set<string>;
}
const stations = new Map<string, Station>();
const alias = new Map<string, string>();
/** Register a platform. A new station id that shares a name with a nearby station of its system joins that one. */
function addPlatform(id: string, name: string, stop: string, x: number, y: number): Station {
  let st = stations.get(alias.get(id) ?? id);
  if (!st) {
    const sys = id.split(':')[0];
    st = [...stations.values()].find((s) => s.id.split(':')[0] === sys && strip(s.name) === strip(name) && Math.hypot(stationXY(s)[0] - x, stationXY(s)[1] - y) < 350);
    if (st) alias.set(id, st.id);
    else stations.set(id, (st = { id, name, plats: new Map(), lines: new Set() }));
  }
  st.plats.set(stop, [x, y]);
  return st;
}
function stationXY(st: Station): [number, number] {
  const p = [...st.plats.values()];
  return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

interface TripStop {
  station: string;
  x: number; // platform position
  y: number;
  a: number;
  d: number;
}

interface Trip {
  line: string;
  dir: number;
  dn: string;
  v?: string;
  head: string;
  label: string;
  mask: number;
  every?: number;
  until?: number;
  stops: TripStop[];
}

/** A station pair to draw, with the platform positions and the feed's shape between them as a routing guide. */
interface PairReq {
  line: string;
  from: string;
  to: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  guide: Flat | null;
}
const pairReqs = new Map<string, PairReq>();

/** Record the station pairs of a trip's stop pattern (once per line, pattern and shape). */
const seenPatterns = new Set<string>();
const shapeCum = new Map<string, number[]>();
function addPairs(t: Trip, shapeId: string, shapes: Map<string, Flat>) {
  const key = `${t.line}|${shapeId}|${t.stops.map((s) => s.station).join(',')}`;
  if (seenPatterns.has(key)) return;
  seenPatterns.add(key);
  const shape = shapes.get(shapeId);
  let loc: ({ s: number; d: number } | null)[] = t.stops.map(() => null);
  let cum: number[] = [];
  if (shape) {
    cum = shapeCum.get(shapeId) ?? cumulative(shape);
    shapeCum.set(shapeId, cum);
    loc = locate(shape, cum, t.stops.map((s) => [s.x, s.y]));
  }
  for (let i = 0; i + 1 < t.stops.length; i++) {
    const A = t.stops[i], B = t.stops[i + 1];
    if (A.station === B.station || !stations.has(A.station) || !stations.has(B.station)) continue;
    const k = `${t.line}|${A.station < B.station ? A.station + '|' + B.station : B.station + '|' + A.station}`;
    const la = loc[i], lb = loc[i + 1];
    const guide = shape && la && lb && la.d < 300 && lb.d < 300 && lb.s - la.s > 5 ? slice(shape, cum, la.s, lb.s) : null;
    if (DEBUG && !guide) console.log(`no guide for ${t.line} ${A.station}-${B.station} shape=${shapeId} d=${la?.d.toFixed(0)},${lb?.d.toFixed(0)}`);
    const had = pairReqs.get(k);
    if (had && (had.guide || !guide)) continue;
    pairReqs.set(k, { line: t.line, from: A.station, to: B.station, ax: A.x, ay: A.y, bx: B.x, by: B.y, guide });
  }
}

/** Direction label of a whole (unclipped) trip: turning sense for loops, else the main compass heading. */
function dirName(stops: TripStop[], loop: boolean): string {
  const a = stops[0], b = stops.at(-1)!;
  if (loop || a.station === b.station) {
    let area = 0;
    for (let i = 0; i < stops.length; i++) {
      const p = stops[i], q = stops[(i + 1) % stops.length];
      area += p.x * q.y - q.x * p.y;
    }
    return area > 0 ? 'Counterclockwise' : 'Clockwise';
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'Eastbound' : 'Westbound') : dy > 0 ? 'Northbound' : 'Southbound';
}

/** Merge consecutive visits to the same station into one stop. */
function dedupeStops(stops: TripStop[]): TripStop[] {
  const out: TripStop[] = [];
  for (const s of stops) {
    const p = out.at(-1);
    if (p && p.station === s.station) p.d = Math.max(p.d, s.d);
    else out.push({ ...s });
  }
  return out;
}

/**
 * Split a trip into the runs of consecutive stops inside the diorama (a trip may leave it and come back) and outside
 * closed sections. A run cut short by a closure terminates at its last station.
 */
function clip(t: Trip): Trip[] {
  const out: Trip[] = [];
  let run: TripStop[] = [];
  const flush = (closed: boolean) => {
    if (run.length >= 2) {
      const shift = run[0].a - t.stops[0].a;
      const head = closed ? stations.get(run.at(-1)!.station)!.name : t.head;
      out.push({ ...t, head, label: out.length ? `${t.label}~${out.length}` : t.label, until: t.until != null ? t.until + shift : undefined, stops: run });
    }
    run = [];
  };
  for (const s of t.stops) {
    if (stations.has(s.station)) run.push(s);
    else flush(closedIds.has(s.station));
  }
  flush(false);
  return out;
}

// ---------------------------------------------------------------------------
// CRTM feeds (Metro, Metro Ligero)
// ---------------------------------------------------------------------------

interface DayTypes {
  keys: string[]; // weekday masks ('1111000') of the day types
  dates: Record<string, number>;
}

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const buildYmd = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()).replace(/-/g, ''));
const holidays = new Set<number>(EXTRA_HOLIDAYS);

// Sections closed for works at build time: trains run up to either side (Line 10 while Santiago Bernabéu is rebuilt).
const CLOSURES = [{ line: 'm10', stop: 'SANTIAGO BERNABEU', from: 20260328, to: 20261231 }];
const closedAt = (line: string, stop: string) => CLOSURES.some((c) => c.line === line && c.stop === stop && buildYmd >= c.from && buildYmd <= c.to);

/** Day type (by weekday mask) of each service, and holidays from the Sunday service added on other days. */
function crtmServices(zip: Zip, dt: DayTypes): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows(zip, 'calendar.txt')) {
    const key = WEEK.map((d) => (r[d] === '1' ? '1' : '0')).join('');
    let i = dt.keys.indexOf(key);
    if (i < 0) i = dt.keys.push(key) - 1;
    out.set(r.service_id, i);
  }
  for (const r of rows(zip, 'calendar_dates.txt')) {
    const i = out.get(r.service_id);
    const ymd = Number(r.date);
    if (i === undefined || r.exception_type !== '1') continue;
    if (dt.keys[i] === '0000001') holidays.add(ymd);
    if (ymd >= buildYmd - 1) dt.dates[ymd] = i;
  }
  return out;
}

function crtmTrips(zip: Zip, system: 'metro' | 'ml', svc: Map<string, number>, skipRoutes: Set<string>): { trips: Trip[]; routes: Set<string> } {
  const lineByRef = new Map(LINES.filter((l) => l.system === system).map((l) => [l.ref, l]));
  const routes = new Map<string, MadridLine>();
  for (const r of rows(zip, 'routes.txt')) {
    const line = lineByRef.get(r.route_short_name);
    if (line && !skipRoutes.has(r.route_id)) routes.set(r.route_id, line);
  }
  const tripRows = table(zip, 'trips.txt').filter((t) => routes.has(t.route_id) && svc.has(t.service_id));
  const stopRows = new Map(table(zip, 'stops.txt').map((r) => [r.stop_id, r]));
  const st = loadStopTimes(zip, new Set(tripRows.map((t) => t.trip_id)));
  const shapes = loadShapes(zip, new Set(tripRows.map((t) => t.shape_id)));
  const freqs = new Map<string, Row[]>();
  for (const f of rows(zip, 'frequencies.txt')) freqs.set(f.trip_id, [...(freqs.get(f.trip_id) ?? []), f]);
  const prefix = system === 'metro' ? 'm' : 'ml';
  // The Metro Ligero feed stores stop times in UTC (summer time, two hours behind) while its trip ids carry the local
  // departure: take the usual difference as the correction.
  const diffs = new Map<number, number>();
  for (const t of tripRows) {
    const m = t.trip_id.match(/_(\d\d:\d\d:\d\d)_/);
    const first = st.get(t.trip_id)?.[0];
    if (!m || !first) continue;
    const d = (((secs(m[1]) - first.d) % 86400) + 86400) % 86400;
    diffs.set(d, (diffs.get(d) ?? 0) + 1);
  }
  const shiftAll = [...diffs].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  if (shiftAll) console.log(`${system}: shifting stop times by ${shiftAll / 3600} h to local time`);
  const stationOf = (r: Row) => {
    if (r.parent_station) return `${prefix}:${r.parent_station}`;
    const guess = `est_${system === 'metro' ? 4 : 10}_${r.stop_code}`;
    return `${prefix}:${stopRows.has(guess) ? guess : r.stop_id}`;
  };
  const out: Trip[] = [];
  let n = 0;
  for (const t of tripRows) {
    const raw = st.get(t.trip_id);
    if (!raw || raw.length < 2) continue;
    const line = routes.get(t.route_id)!;
    const stops: TripStop[] = raw.map((s) => {
      const r = stopRows.get(s.stop)!;
      const lon = Number(r.stop_lon), lat = Number(r.stop_lat);
      const [x, y] = project(lon, lat);
      let station = stationOf(r);
      if (inBox(lon, lat) && !closedAt(line.id, r.stop_name)) station = addPlatform(station, r.stop_name, s.stop, x, y).id;
      return { station, x, y, a: s.a + shiftAll, d: s.d + shiftAll };
    });
    const last = stopRows.get(raw.at(-1)!.stop)!;
    const head = niceName(last.stop_name, ...project(Number(last.stop_lon), Number(last.stop_lat)));
    const dn = dirName(stops, line.id === 'm6' || line.id === 'm12');
    const v = t.shape_id.match(/^\d+__\w+?_([A-Z])_/)?.[1];
    const base: Trip = { line: line.id, dir: Number(t.direction_id) || 0, dn, v, head, label: '', mask: 1 << svc.get(t.service_id)!, stops: dedupeStops(stops) };
    addPairs(base, t.shape_id, shapes);
    const fr = freqs.get(t.trip_id);
    if (!fr?.length) out.push({ ...base, label: String(n++) });
    for (const f of fr ?? []) {
      const start = secs(f.start_time), shift = start - base.stops[0].a;
      out.push({ ...base, every: Number(f.headway_secs), until: secs(f.end_time), stops: base.stops.map((s) => ({ ...s, a: s.a + shift, d: s.d + shift })) });
    }
  }
  return { trips: out, routes: new Set(tripRows.map((t) => t.route_id)) };
}

// ---------------------------------------------------------------------------
// Renfe Cercanías
// ---------------------------------------------------------------------------

const cleanRenfe = (name: string) => name.replace(/^Madrid-/, '').trim();

function renfeTrips(zip: Zip, dt: DayTypes): { trips: Trip[]; stopMap: Record<string, string>; services: Record<string, number> } {
  const lineByRef = new Map(LINES.filter((l) => l.system === 'cercanias').map((l) => [l.ref, l]));
  const routes = new Map<string, MadridLine>();
  for (const r of rows(zip, 'routes.txt')) {
    const line = lineByRef.get(r.route_short_name);
    if (r.route_id.startsWith('10T') && line) routes.set(r.route_id, line);
  }
  const svcDate = new Map<string, number>();
  for (const r of rows(zip, 'calendar.txt')) if (r.service_id.startsWith('10')) svcDate.set(r.service_id, Number(r.start_date));
  // One day type per service date, from yesterday on (up to 31, the width of the trip masks).
  const dates = [...new Set(svcDate.values())].filter((d) => d >= buildYmd - 1).sort().slice(0, 31);
  for (const d of dates) dt.dates[d] = dt.keys.push(String(d)) - 1;
  const tripRows = table(zip, 'trips.txt').filter((t) => routes.has(t.route_id) && dates.includes(svcDate.get(t.service_id) ?? 0));
  const stopRows = new Map(table(zip, 'stops.txt').map((r) => [r.stop_id, r]));
  const st = loadStopTimes(zip, new Set(tripRows.map((t) => t.trip_id)), '10');
  const shapes = loadShapes(zip, new Set(tripRows.map((t) => t.shape_id)));
  const out: Trip[] = [];
  const stopMap: Record<string, string> = {};
  for (const t of tripRows) {
    const raw = st.get(t.trip_id);
    if (!raw || raw.length < 2) continue;
    const line = routes.get(t.route_id)!;
    const stops: TripStop[] = raw.map((s) => {
      const r = stopRows.get(s.stop)!;
      const lon = Number(r.stop_lon), lat = Number(r.stop_lat);
      const [x, y] = project(lon, lat);
      let station = `c:${s.stop}`;
      if (inBox(lon, lat)) stopMap[s.stop] = station = addPlatform(station, cleanRenfe(r.stop_name), s.stop, x, y).id;
      return { station, x, y, a: s.a, d: s.d };
    });
    const num = t.trip_id.slice(t.service_id.length).match(/^\d+/)?.[0] ?? t.trip_id;
    const trip: Trip = {
      line: line.id,
      dir: t.shape_id.endsWith('_INV') ? 1 : 0,
      dn: dirName(stops, false),
      head: cleanRenfe(stopRows.get(raw.at(-1)!.stop)!.stop_name),
      label: num,
      mask: 1 << dt.dates[svcDate.get(t.service_id)!],
      stops: dedupeStops(stops),
    };
    addPairs(trip, t.shape_id, shapes);
    out.push(trip);
  }
  const services = Object.fromEntries([...svcDate].filter(([, d]) => dates.includes(d)));
  return { trips: out, stopMap, services };
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/** Weekday defaults: a CRTM day type covering that weekday, or Renfe's most recent date with that weekday. */
function weekDefaults(dt: DayTypes): number[] {
  return WEEK.map((_, wd) => {
    const byMask = dt.keys.findIndex((k) => k.length === 7 && k[wd] === '1');
    if (byMask >= 0) return byMask;
    const days = Object.entries(dt.dates)
      .map(([ymd, i]) => [Number(ymd), i])
      .filter(([ymd]) => (new Date(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100)).getUTCDay() + 6) % 7 === wd && !holidays.has(ymd));
    return days.length ? days[days.length - 1][1] : 0;
  });
}

function buildSchedule(trips: Trip[], dt: DayTypes, halfDwell: number, stopMap: Record<string, string> = {}, services: Record<string, number> = {}): Schedule {
  const pats: PatternDef[] = [];
  const patIdx = new Map<string, number>();
  const tims: number[][] = [];
  const timIdx = new Map<string, number>();
  const heads: string[] = [];
  const headIdx = new Map<string, number>();
  const rowIdx = new Map<string, TripRow>();
  const out: TripRow[] = [];
  for (const t of trips) {
    const st = t.stops.map((s) => s.station);
    const pk = `${t.line}|${t.dir}|${t.dn}|${t.v}|${st.join(',')}`;
    if (!patIdx.has(pk)) patIdx.set(pk, pats.push({ line: t.line, dir: t.dir, dn: t.dn, ...(t.v ? { v: t.v } : {}), st }) - 1);
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
    const key = `${patIdx.get(pk)}|${timIdx.get(tk)}|${t0}|${headIdx.get(t.head)}|${t.label}|${t.every ?? ''}|${t.until ?? ''}`;
    const had = rowIdx.get(key);
    if (had) {
      had[4] |= t.mask;
      continue;
    }
    const row: TripRow = [patIdx.get(pk)!, timIdx.get(tk)!, t0, headIdx.get(t.head)!, t.mask, t.label];
    if (t.every) row.push(t.every, t.until);
    rowIdx.set(key, row);
    out.push(row);
  }
  // Frequency series and plain trips of the same pattern and day types are distinguished by label; make them unique.
  const seen = new Map<string, number>();
  for (const r of out) {
    if (r[6]) continue;
    const k = `${r[4]}|${r[5]}`;
    const c = seen.get(k) ?? 0;
    seen.set(k, c + 1);
    if (c) r[5] = `${r[5]}#${c}`;
  }
  return { built: new Date().toISOString(), dates: dt.dates, week: weekDefaults(dt), holidays: [...holidays].sort(), stopMap, services, heads, pats, tims, trips: out };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const metroDt: DayTypes = { keys: [], dates: {} };
const metroZip = await download('metro');
const metroSvc = crtmServices(metroZip, metroDt);
const metroNew = crtmTrips(metroZip, 'metro', metroSvc, new Set());
const metroOldZip = await download('metroOld');
const metroOldSvc = crtmServices(metroOldZip, metroDt);
const metroOld = crtmTrips(metroOldZip, 'metro', metroOldSvc, metroNew.routes);
console.log(`metro: ${metroNew.trips.length} trip rows, plus ${metroOld.trips.length} from the March 2025 feed (${[...metroOld.routes].join(', ') || 'none'})`);

const mlDt: DayTypes = { keys: [], dates: {} };
const mlZip = await download('ml');
const ml = crtmTrips(mlZip, 'ml', crtmServices(mlZip, mlDt), new Set());

const renfeDt: DayTypes = { keys: [], dates: {} };
const renfe = renfeTrips(await download('renfe'), renfeDt);
console.log(`renfe: ${renfe.trips.length} trips over ${Object.keys(renfeDt.dates).length} service dates`);

for (const st of stations.values()) {
  const [x, y] = stationXY(st);
  st.name = st.id.startsWith('c:') ? st.name : niceName(st.name, x, y);
}

// Stops of closed sections: inside the diorama but never registered as stations.
const closedIds = new Set(
  [...metroNew.trips, ...metroOld.trips].flatMap((t) => t.stops.filter((s) => !stations.has(s.station) && inBox(...unproject(s.x, s.y))).map((s) => s.station)),
);
const metroTrips = [...metroNew.trips, ...metroOld.trips].flatMap(clip);
const mlTrips = ml.trips.flatMap(clip);
const renfeClipped = renfe.trips.flatMap(clip);
for (const t of [...metroTrips, ...mlTrips, ...renfeClipped]) for (const s of t.stops) stations.get(s.station)!.lines.add(t.line);

// Circular lines: the destination is the loop itself.
for (const t of metroTrips) if (t.line === 'm6' || t.line === 'm12') t.head = t.line === 'm6' ? 'Circular' : 'MetroSur';

// --- geometry ----------------------------------------------------------------

const lineById = new Map(LINES.map((l) => [l.id, l]));
const segs = new Map<string, { from: string; to: string; lines: Set<string>; pts: Flat; el?: number[]; n: number }[]>();
const stats = { routed: 0, shape: 0, straight: 0, variants: 0 };

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
  if (list.length) stats.variants++;
  list.push({ from: a, to: b, lines: new Set([line]), pts: oriented, el: orientedEl, n: 1 });
}

const SYS_ROUTE = {
  metro: { r: 160, gTol: 25, gScale: 50, dflt: -1 },
  ml: { r: 120, gTol: 25, gScale: 50, dflt: 0 },
  cercanias: { r: 250, gTol: 60, gScale: 90, dflt: 0 },
};
const t0 = Date.now();
for (const req of pairReqs.values()) {
  const line = lineById.get(req.line)!;
  const g = GRAPHS[line.system];
  const p = SYS_ROUTE[line.system];
  const guideLen = req.guide ? cumulative(req.guide).at(-1)! : Math.hypot(req.bx - req.ax, req.by - req.ay);
  const guide = req.guide ? simplify(req.guide, 3) : null;
  const mult = wayMultFor(line, g);
  // Some Metro platforms are filed at the station complex's centroid, a couple of hundred meters from their line's
  // tunnel: the stops' projections onto the feed shape are better anchors. Renfe's stops are exact, its shapes coarse.
  const onShape = req.guide && line.system !== 'cercanias';
  const [ax, ay, bx, by] = onShape ? [req.guide![0], req.guide![1], req.guide!.at(-2)!, req.guide!.at(-1)!] : [req.ax, req.ay, req.bx, req.by];
  const res = g.route(ax, ay, bx, by, p.r, mult, guide, p.gTol, p.gScale) ?? g.route(ax, ay, bx, by, 2.2 * p.r, mult, guide, p.gTol, p.gScale);
  // A route much shorter or longer than the feed's shape snapped to the wrong tracks (OSM tunnels have gaps).
  const plausible = (len: number) =>
    req.guide ? len > Math.min(0.8 * guideLen, guideLen - 200) && len < Math.max(1.25 * guideLen, guideLen + 300) : len > 0.7 * guideLen && len < Math.max(1.5 * guideLen, guideLen + 600);
  if (res && plausible(res.len)) {
    const cut = trimToStations(res.pts, res.lv, ax, ay, bx, by);
    const { pts, el } = withLevels(cut.pts, cut.lv);
    stats.routed++;
    if (DEBUG && req.guide) {
      const dev = Math.max(deviation(pts, req.guide), deviation(req.guide, pts));
      if (dev > 60) console.log(`  deviates ${dev.toFixed(0)} m from the feed shape: ${req.line} ${stations.get(req.from)!.name} - ${stations.get(req.to)!.name} (${res.len.toFixed(0)} m vs ${guideLen.toFixed(0)} m)`);
    }
    addSegment(req.from, req.to, req.line, pts, el);
    continue;
  }
  const raw = req.guide ?? [req.ax, req.ay, req.bx, req.by];
  if (req.guide) stats.shape++;
  else stats.straight++;
  const sa = stations.get(req.from)!.name, sb = stations.get(req.to)!.name;
  console.warn(`  ${res ? `detour (${res.len.toFixed(0)} m vs ${guideLen.toFixed(0)} m)` : 'no OSM route'} for ${req.line} ${sa} - ${sb}; using ${req.guide ? 'the feed shape' : 'a straight line'}`);
  const dense = resample(raw, Math.max(2, Math.ceil(cumulative(raw).at(-1)! / 8)));
  const { pts, el } = withLevels(dense.flat(), levelsFromGraph(raw, g, p.dflt));
  addSegment(req.from, req.to, req.line, pts, el);
}
console.log(`routed ${stats.routed} station pairs in ${((Date.now() - t0) / 1000).toFixed(1)} s; shape fallbacks ${stats.shape}, straight ${stats.straight}, geometry variants ${stats.variants}`);

// --- output --------------------------------------------------------------------

function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  console.log(`wrote ${file.slice(ROOT.length + 1)} (${(text.length / 1024).toFixed(0)} KB)`);
}

const usedLines = new Set([...stations.values()].flatMap((s) => [...s.lines]));
const lines: LineDef[] = LINES.filter((l) => usedLines.has(l.id)).map((l) => ({
  id: l.id,
  system: l.system,
  name: l.name,
  short: l.short,
  color: l.color,
  textColor: l.textColor,
  kind: l.kind,
  bullet: l.bullet,
  stock: l.fleet[0][0],
}));
const systems: SystemDef[] = [
  { id: 'metro', name: 'Metro de Madrid', live: 'scheduled' },
  { id: 'ml', name: 'Metro Ligero', live: 'scheduled' },
  { id: 'cercanias', name: 'Cercanías Madrid', live: 'realtime' },
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
  .map((s) => {
    const [x, y] = stationXY(s);
    return { id: s.id, name: s.name, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, lines: [...s.lines].sort() };
  });

const transit: TransitData = {
  city: 'madrid',
  built: new Date().toISOString().slice(0, 10),
  attribution: [
    'Metro & Metro Ligero timetables: Powered by CRTM (Consorcio Regional de Transportes de Madrid)',
    'Cercanías timetables & realtime: Renfe Viajeros open data',
    'Track geometry © OpenStreetMap contributors',
  ],
  systems,
  lines,
  stations: stationDefs,
  segments,
};

const metroSchedule = buildSchedule(metroTrips, metroDt, 12);
const mlSchedule = buildSchedule(mlTrips, mlDt, 10);
const renfeSchedule = buildSchedule(renfeClipped, renfeDt, 15, renfe.stopMap, renfe.services);
writeJson(join(ROOT, 'public/data/madrid/transit.json'), transit);
writeJson(join(ROOT, 'server/data/madrid/metro.json'), metroSchedule);
writeJson(join(ROOT, 'server/data/madrid/ml.json'), mlSchedule);
writeJson(join(ROOT, 'server/data/madrid/cercanias.json'), renfeSchedule);
console.log(`stations ${stationDefs.length}, segments ${segments.length}, lines ${lines.length}`);
console.log(`trip rows: metro ${metroSchedule.trips.length}, ml ${mlSchedule.trips.length}, cercanías ${renfeSchedule.trips.length}; holidays ${holidays.size}`);
if (DEBUG) for (const s of stationDefs) console.log(`  ${s.id} ${s.name} [${s.lines.join(',')}]`);
