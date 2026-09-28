// Builds public/data/paris/transit.json and server/data/paris/schedule.json from the IDFM GTFS feed (Métro 1–14,
// 3bis, 7bis, RER A–E and Tramway T1–T13, clipped to the diorama bbox), with track levels from OpenStreetMap.
// Run: npx tsx scripts/build-paris.ts [--refresh] [--debug]
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { CITIES } from '../shared/cities.ts';
import { makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, SystemDef, TransitData } from '../shared/types.ts';
import type { ParisSchedule, PatternDef, ServiceDef } from '../server/adapters/paris/schedule.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/paris');
const GTFS_DIR = join(CACHE, 'gtfs');
const REFRESH = process.argv.includes('--refresh');
const DEBUG = process.argv.includes('--debug');
const GTFS_URL = 'https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip';
const UA = 'tiny-trains-build/0.1 (+https://tinytrains.app)';
const { project } = makeProjection('paris');
const [W, S, E, N] = CITIES.paris.bbox;

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

type System = 'metro' | 'rer' | 'tram';

interface LineSpec {
  id: string;
  system: System;
  gtfs: string; // route_short_name
  short: string;
  name: string;
  stock: string; // default stock, see shared/stock/paris.ts
}

const METRO: LineSpec[] = [
  ['1', 'paris-mp05'],
  ['2', 'paris-mf01'],
  ['3', 'paris-mf67'],
  ['3B', 'paris-mf67'],
  ['4', 'paris-mp89ca'],
  ['5', 'paris-mf01'],
  ['6', 'paris-mp89cc'],
  ['7', 'paris-mf77'],
  ['7B', 'paris-mf88'],
  ['8', 'paris-mf77'],
  ['9', 'paris-mf01-stif'],
  ['10', 'paris-mf67'],
  ['11', 'paris-mp14'],
  ['12', 'paris-mf67'],
  ['13', 'paris-mf77-jade'],
  ['14', 'paris-mp14'],
].map(([g, stock]) => ({
  id: `m${g.toLowerCase()}`,
  system: 'metro',
  gtfs: g,
  short: g.replace('B', 'b'),
  name: `Line ${g.replace('B', 'bis')}`,
  stock,
}));

const RER: LineSpec[] = [
  ['A', 'paris-mi09'],
  ['B', 'paris-mi79'],
  ['C', 'paris-z20500'],
  ['D', 'paris-z20500'],
  ['E', 'paris-rerng'],
].map(([g, stock]) => ({ id: `rer-${g.toLowerCase()}`, system: 'rer', gtfs: g, short: g, name: `RER ${g}`, stock }));

const TRAM: LineSpec[] = [
  ['T1', 'paris-citadis305'],
  ['T2', 'paris-citadis302'],
  ['T3a', 'paris-citadis402'],
  ['T3b', 'paris-citadis402'],
  ['T4', 'paris-dualis'],
  ['T5', 'paris-translohr-ste3'],
  ['T6', 'paris-translohr-ste6'],
  ['T7', 'paris-citadis302'],
  ['T8', 'paris-citadis302'],
  ['T9', 'paris-citadis405'],
  ['T10', 'paris-citadis405'],
  ['T11', 'paris-dualis'],
  ['T12', 'paris-dualis'],
  ['T13', 'paris-dualis'],
].map(([g, stock]) => ({ id: g.toLowerCase(), system: 'tram', gtfs: g, short: g, name: `Tramway ${g}`, stock }));

const SPECS = [...METRO, ...RER, ...TRAM];
const ROUTE_TYPE: Record<System, string> = { metro: '1', rer: '2', tram: '0' };

/** IDFM palette, used only if routes.txt lacks a color. */
const PALETTE: Record<string, [string, string]> = {
  m1: ['FFBE00', '000000'], m2: ['0055C8', 'FFFFFF'], m3: ['6E6E00', 'FFFFFF'], m3b: ['82C8E6', '000000'],
  m4: ['A0006E', 'FFFFFF'], m5: ['FF5A00', '000000'], m6: ['82DC73', '000000'], m7: ['FF82B4', '000000'],
  m7b: ['82DC73', '000000'], m8: ['D282BE', '000000'], m9: ['D2D200', '000000'], m10: ['DC9600', '000000'],
  m11: ['6E491E', 'FFFFFF'], m12: ['00643C', 'FFFFFF'], m13: ['82C8E6', '000000'], m14: ['640082', 'FFFFFF'],
  'rer-a': ['EB2132', 'FFFFFF'], 'rer-b': ['5091CB', 'FFFFFF'], 'rer-c': ['FFCC30', '000000'],
  'rer-d': ['008B5B', 'FFFFFF'], 'rer-e': ['B94E9A', 'FFFFFF'],
};

// ---------------------------------------------------------------------------
// GTFS loading
// ---------------------------------------------------------------------------

type Row = Record<string, string>;

async function ensureGtfs() {
  const zip = join(CACHE, 'IDFM-gtfs.zip');
  mkdirSync(CACHE, { recursive: true });
  if (REFRESH || !existsSync(zip)) {
    console.log(`downloading ${GTFS_URL}`);
    const res = await fetch(GTFS_URL, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`GTFS: HTTP ${res.status}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  // stop_times.txt is ~900 MB unzipped, far too big to inflate in memory, so let unzip stream it to disk.
  if (REFRESH || !existsSync(join(GTFS_DIR, 'stop_times.txt'))) {
    console.log('extracting GTFS');
    mkdirSync(GTFS_DIR, { recursive: true });
    const files = ['agency', 'routes', 'trips', 'stops', 'calendar', 'calendar_dates', 'shapes', 'stop_times', 'object_codes_extension'];
    execFileSync('unzip', ['-o', '-q', zip, ...files.map((f) => `${f}.txt`), '-d', GTFS_DIR], { stdio: 'inherit' });
  }
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

/** Streams a GTFS table row by row; `pre` can reject raw lines cheaply before they are split. */
async function* rows(name: string, pre?: (line: string) => boolean): AsyncGenerator<Row> {
  const rl = createInterface({ input: createReadStream(join(GTFS_DIR, name)), crlfDelay: Infinity });
  let head: string[] | null = null;
  for await (const raw of rl) {
    if (!head) {
      head = splitCsv(raw.replace(/^﻿/, '')).map((h) => h.trim());
      continue;
    }
    if (!raw.trim() || (pre && !pre(raw))) continue;
    const cells = splitCsv(raw);
    const row: Row = {};
    for (let j = 0; j < head.length; j++) row[head[j]] = (cells[j] ?? '').trim();
    yield row;
  }
}

async function table(name: string, pre?: (line: string) => boolean): Promise<Row[]> {
  const out: Row[] = [];
  for await (const r of rows(name, pre)) out.push(r);
  return out;
}

const secs = (t: string) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

/** Our trips' rows of stop_times.txt, cached in a small side file because the full table takes a while to scan. */
async function loadStopTimes(keep: Set<string>): Promise<Map<string, { stop: string; a: number; d: number; seq: number }[]>> {
  const file = join(CACHE, 'stop_times-rail.txt');
  const sig = join(CACHE, 'stop_times-rail.sig');
  const want = `${keep.size}:${[...keep].sort().slice(0, 50).join(',')}`;
  if (REFRESH || !existsSync(file) || !existsSync(sig) || readFileSync(sig, 'utf8') !== want) {
    console.log('scanning stop_times.txt');
    const out = createWriteStream(file);
    const rl = createInterface({ input: createReadStream(join(GTFS_DIR, 'stop_times.txt')), crlfDelay: Infinity });
    let first = true;
    for await (const line of rl) {
      if (first || keep.has(line.slice(0, line.indexOf(',')))) out.write(line + '\n');
      first = false;
    }
    await new Promise((r) => out.end(r));
    writeFileSync(sig, want);
  }
  const map = new Map<string, { stop: string; a: number; d: number; seq: number }[]>();
  const lines = readFileSync(file, 'utf8').split('\n');
  const head = lines[0].split(',');
  const [ti, ai, di, si, qi] = ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'].map((h) => head.indexOf(h));
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const c = splitCsv(lines[i]);
    let list = map.get(c[ti]);
    if (!list) map.set(c[ti], (list = []));
    list.push({ stop: c[si], a: secs(c[ai] || c[di]), d: secs(c[di] || c[ai]), seq: Number(c[qi]) });
  }
  for (const list of map.values()) list.sort((x, y) => x.seq - y.seq);
  return map;
}

async function loadShapes(keep: Set<string>): Promise<Map<string, Flat>> {
  const pts = new Map<string, [number, number, number][]>();
  for await (const r of rows('shapes.txt', (l) => keep.has(l.slice(0, l.indexOf(','))))) {
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

async function loadServices(used: Set<string>): Promise<Map<string, ServiceDef>> {
  const out = new Map<string, ServiceDef>();
  const get = (id: string) => out.get(id) ?? out.set(id, { days: '0000000', start: 0, end: 0 }).get(id)!;
  for (const r of await table('calendar.txt')) {
    if (!used.has(r.service_id)) continue;
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (r[d] === '1' ? '1' : '0')).join('');
    Object.assign(get(r.service_id), { days, start: Number(r.start_date), end: Number(r.end_date) });
  }
  for (const r of await table('calendar_dates.txt')) {
    if (!used.has(r.service_id)) continue;
    const s = get(r.service_id);
    if (r.exception_type === '1') (s.add ??= []).push(Number(r.date));
    else (s.rem ??= []).push(Number(r.date));
  }
  for (const s of out.values()) {
    s.add?.sort((a, b) => a - b);
    s.rem?.sort((a, b) => a - b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry (same approach as scripts/build-sf.ts)
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
    const local = ds.filter((c, i) => c.d < 250 && (i === 0 || c.d <= ds[i - 1].d) && (i === nseg - 1 || c.d <= ds[i + 1].d));
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
    const q = `[out:json][timeout:300];way["railway"~"^(subway|rail|light_rail|tram)$"]["service"!~"^(yard|siding|spur)$"](${S},${W},${N},${E});out tags geom;`;
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA },
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
  for (let i = 0; i < m; i++) {
    if (lv[i] != null) continue;
    let k = 1;
    while (k < m && lv[i - k] == null && lv[i + k] == null) k++;
    lv[i] = lv[i - k] ?? lv[i + k] ?? 0;
  }
  for (let i = 0; i < m; ) {
    let j = i;
    while (j < m && lv[j] === lv[i]) j++;
    if (j - i < 5 && i > 0) for (let k = i; k < j; k++) lv[k] = lv[i - 1];
    i = j;
  }
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
// Network
// ---------------------------------------------------------------------------

const inside = (lon: number, lat: number) => lon >= W && lon <= E && lat >= S && lat <= N;

interface Stop {
  id: string;
  name: string;
  lon: number;
  lat: number;
  x: number;
  y: number;
  type: string;
  parent: string;
}

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
  compass: string;
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
    if (DEBUG) console.log(`variant ${line} ${from}-${to} (${list.map((s) => [...s.lines].join('+')).join(' | ')})`);
  }
  list.push({ from: a, to: b, lines: new Set([line]), pts: oriented, el: orientedEl, n: 1 });
}

const missing = new Map<string, { from: string; to: string; line: string; pts: Flat }>();

/** Cut each trip's shape into station-to-station pieces (once per distinct stop pattern + shape). */
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

/** Stations sit at the mean of their track ends, so segments meet them even where a stop point lies between two stations' tracks. */
function recenter() {
  const acc = new Map<string, number[]>();
  const add = (id: string, x: number, y: number) => {
    const a = acc.get(id) ?? [0, 0, 0];
    acc.set(id, [a[0] + x, a[1] + y, a[2] + 1]);
  };
  for (const list of segs.values())
    for (const s of list) {
      add(s.from, s.pts[0], s.pts[1]);
      add(s.to, s.pts.at(-2)!, s.pts.at(-1)!);
    }
  for (const [id, [x, y, n]] of acc) Object.assign(stations.get(id)!, { x: x / n, y: y / n });
}

const cleanName = (name: string) =>
  name
    .replace(/\s+-\s+RER$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * One station per IDFM stop area, except where a big interchange's platforms sprawl: then the lines are grouped into
 * clusters whose platforms all lie within 120 m of the cluster's center (e.g. Châtelet's line 1 and line 14 halls).
 */
function buildStations(stops: Map<string, Stop>, used: Map<string, Set<string>>, lineOrder: string[]) {
  const byParent = new Map<string, { stop: Stop; lines: Set<string> }[]>();
  for (const [id, lines] of used) {
    const s = stops.get(id)!;
    const p = s.parent || s.id;
    const list = byParent.get(p) ?? [];
    byParent.set(p, list);
    list.push({ stop: s, lines });
  }
  const stationOf = new Map<string, string>(); // `${stop}|${line}` -> station id
  const clustersOf = new Map<string, { id: string; x: number; y: number }[]>();
  const rank = (l: string) => lineOrder.indexOf(l);
  for (const [parent, list] of byParent) {
    const lines = [...new Set(list.flatMap((e) => [...e.lines]))].sort((a, b) => rank(a) - rank(b));
    const members = (ls: string[]) => list.filter((e) => ls.some((l) => e.lines.has(l))).map((e) => e.stop);
    const center = (ss: Stop[]) => [ss.reduce((t, s) => t + s.x, 0) / ss.length, ss.reduce((t, s) => t + s.y, 0) / ss.length];
    const spread = (ls: string[]) => {
      const ss = members(ls);
      const [cx, cy] = center(ss);
      return Math.max(...ss.map((s) => Math.hypot(s.x - cx, s.y - cy)));
    };
    let groups = lines.map((l) => [l]);
    for (;;) {
      let best: [number, number, number] | null = null;
      for (let i = 0; i < groups.length; i++)
        for (let j = i + 1; j < groups.length; j++) {
          const sp = spread([...groups[i], ...groups[j]]);
          if (sp <= 120 && (!best || sp < best[2])) best = [i, j, sp];
        }
      if (!best) break;
      groups[best[0]] = [...groups[best[0]], ...groups[best[1]]];
      groups.splice(best[1], 1);
    }
    groups = groups.map((g) => g.sort((a, b) => rank(a) - rank(b))).sort((a, b) => rank(a[0]) - rank(b[0]));
    const num = parent.replace(/^IDFM:/, '');
    const clusters: { id: string; x: number; y: number }[] = [];
    groups.forEach((g, k) => {
      const ss = members(g);
      const id = `idfm:${num}${k ? String.fromCharCode(97 + k) : ''}`;
      const [x, y] = center(ss);
      const names = new Map<string, number>();
      for (const s of ss) names.set(cleanName(s.name), (names.get(cleanName(s.name)) ?? 0) + 1);
      const parentName = stops.get(parent)?.name;
      const name = parentName && names.has(cleanName(parentName)) ? cleanName(parentName) : [...names].sort((a, b) => b[1] - a[1])[0][0];
      stations.set(id, { id, name, x, y, lines: new Set() });
      clusters.push({ id, x, y });
      for (const e of list) for (const l of g) if (e.lines.has(l)) stationOf.set(`${e.stop.id}|${l}`, id);
    });
    clustersOf.set(parent, clusters);
    if (DEBUG && groups.length > 1) console.log(`split ${stations.get(clusters[0].id)!.name}: ${groups.map((g) => g.join('+')).join(' / ')}`);
  }
  return { stationOf, clustersOf };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

await ensureGtfs();

const agencies = new Map((await table('agency.txt')).map((a) => [a.agency_id, a.agency_name]));
// Métro routes are RATP's, RER routes the 'RER' agency's (SNCF-run Transilien lines share route_type 2); trams have several operators.
const specOf = (r: Row) => {
  const agency = agencies.get(r.agency_id);
  const spec = SPECS.find((s) => s.gtfs === r.route_short_name && ROUTE_TYPE[s.system] === r.route_type);
  if (!spec || (spec.system === 'metro' && agency !== 'RATP') || (spec.system === 'rer' && agency !== 'RER')) return undefined;
  return spec;
};
const routes = (await table('routes.txt')).filter((r) => specOf(r));
const routeLine = new Map<string, LineSpec>();
for (const r of routes) routeLine.set(r.route_id, specOf(r)!);
for (const s of SPECS) if (![...routeLine.values()].includes(s)) throw new Error(`no GTFS route for ${s.name}`);
console.log(`routes: ${routes.map((r) => `${r.route_short_name}=${r.route_id}`).join(' ')}`);

const gtfsTrips = await table('trips.txt', (l) => routeLine.has(l.slice(0, l.indexOf(','))));
console.log(`trips: ${gtfsTrips.length}`);
const stopTimes = await loadStopTimes(new Set(gtfsTrips.map((t) => t.trip_id)));

const stops = new Map<string, Stop>();
for (const r of await table('stops.txt')) {
  const lon = Number(r.stop_lon), lat = Number(r.stop_lat);
  const [x, y] = project(lon, lat);
  stops.set(r.stop_id, { id: r.stop_id, name: r.stop_name, lon, lat, x, y, type: r.location_type, parent: r.parent_station });
}

// Which lines use each stop (inside the bbox)
const used = new Map<string, Set<string>>();
for (const t of gtfsTrips) {
  const line = routeLine.get(t.route_id)!.id;
  for (const s of stopTimes.get(t.trip_id) ?? []) {
    const st = stops.get(s.stop);
    if (!st || !inside(st.lon, st.lat)) continue;
    const set = used.get(s.stop) ?? new Set();
    used.set(s.stop, set);
    set.add(line);
  }
}
const lineOrder = SPECS.map((s) => s.id);
const { stationOf, clustersOf } = buildStations(stops, used, lineOrder);

/** The name riders see for a trip's terminus (which may be outside the bbox). */
const terminusName = (stop: string) => {
  const s = stops.get(stop)!;
  return cleanName(stops.get(s.parent)?.name ?? s.name);
};

const trips: Trip[] = [];
let clipped = 0;
for (const t of gtfsTrips) {
  const spec = routeLine.get(t.route_id)!;
  const raw = stopTimes.get(t.trip_id);
  if (!raw || raw.length < 2) continue;
  const first = stops.get(raw[0].stop)!, last = stops.get(raw.at(-1)!.stop)!;
  // Direction from the whole trip's end-to-end displacement, along the line's main axis (set below).
  const dx = last.x - first.x, dy = last.y - first.y;
  const head = terminusName(raw.at(-1)!.stop);
  const label = spec.system === 'rer' && /^[A-Z]{4}$/.test(t.trip_headsign) ? t.trip_headsign : '';
  // Split into runs of consecutive stops inside the bbox.
  const runs: Trip['stops'][] = [[]];
  for (const s of raw) {
    const station = stationOf.get(`${s.stop}|${spec.id}`);
    if (!station) {
      if (runs.at(-1)!.length) runs.push([]);
      continue;
    }
    const prev = runs.at(-1)!.at(-1);
    if (prev && prev.station === station) prev.d = Math.max(prev.d, s.d);
    else runs.at(-1)!.push({ stop: s.stop, station, a: s.a, d: s.d });
  }
  const kept = runs.filter((r) => r.length >= 2);
  if (kept.length !== 1 || kept[0].length !== raw.length) clipped++;
  kept.forEach((stopsIn, k) =>
    trips.push({
      id: kept.length > 1 ? `${t.trip_id}#${k}` : t.trip_id,
      service: t.service_id,
      line: spec.id,
      dir: Number(t.direction_id) || 0,
      head,
      label,
      shape: t.shape_id,
      compass: `${dx},${dy}`,
      stops: stopsIn,
    }),
  );
}
console.log(`trips kept ${trips.length} (${clipped} clipped to the bbox)`);

for (const t of trips) for (const s of t.stops) stations.get(s.station)!.lines.add(t.line);

// Main axis per line decides whether trips are east/westbound or north/southbound.
const axis = new Map<string, 'ew' | 'ns'>();
for (const spec of SPECS) {
  const ss = [...stations.values()].filter((s) => s.lines.has(spec.id));
  const xs = ss.map((s) => s.x), ys = ss.map((s) => s.y);
  axis.set(spec.id, Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'ew' : 'ns');
}
for (const t of trips) {
  const [dx, dy] = t.compass.split(',').map(Number);
  t.compass = axis.get(t.line) === 'ew' ? (dx >= 0 ? 'Eastbound' : 'Westbound') : dy >= 0 ? 'Northbound' : 'Southbound';
}

const shapes = await loadShapes(new Set(trips.map((t) => t.shape)));
console.log(`shapes: ${shapes.size}`);
addGeometry(
  trips,
  shapes,
  (stop) => {
    const s = stops.get(stop)!;
    return [s.x, s.y];
  },
  (line) => (line.startsWith('rer-') ? ['rail'] : line.startsWith('m') ? ['subway'] : ['tram', 'light_rail', 'rail']),
);
fillMissing();
recenter();

// ---------------------------------------------------------------------------
// Compact timetable
// ---------------------------------------------------------------------------

/** RER trips that run past stations other patterns of the line serve are semi-direct. */
function skipsStations(trips: Trip[]): Map<string, boolean> {
  const pats = new Map<string, string[]>();
  for (const t of trips) pats.set(`${t.line}|${t.stops.map((s) => s.station).join(',')}`, t.stops.map((s) => s.station));
  const pos = new Map<string, Map<string, number>[]>();
  for (const [k, st] of pats) {
    const line = k.slice(0, k.indexOf('|'));
    const list = pos.get(line) ?? [];
    pos.set(line, list);
    list.push(new Map(st.map((s, i) => [s, i])));
  }
  const out = new Map<string, boolean>();
  for (const [k, st] of pats) {
    const line = k.slice(0, k.indexOf('|'));
    let skips = false;
    for (let i = 0; i + 1 < st.length && !skips; i++) {
      for (const p of pos.get(line)!) {
        const a = p.get(st[i]), b = p.get(st[i + 1]);
        if (a != null && b != null && Math.abs(b - a) > 1) {
          skips = true;
          break;
        }
      }
    }
    out.set(k, skips);
  }
  return out;
}

function buildSchedule(services: Map<string, ServiceDef>): ParisSchedule {
  const stationIds = [...stations.keys()].filter((id) => stations.get(id)!.lines.size);
  const stationIdx = new Map(stationIds.map((id, i) => [id, i]));
  const lines = SPECS.map((s) => ({ id: s.id, ref: routes.find((r) => routeLine.get(r.route_id) === s)!.route_id.replace(/^IDFM:/, '') }));
  const lineIdx = new Map(lines.map((l, i) => [l.id, i]));
  const svcIds = [...new Set(trips.map((t) => t.service))];
  const svcIdx = new Map(svcIds.map((id, i) => [id, i]));
  const skip = skipsStations(trips);
  const pats: PatternDef[] = [];
  const patIdx = new Map<string, number>();
  const tims: number[][] = [];
  const timIdx = new Map<string, number>();
  const heads: string[] = [];
  const headIdx = new Map<string, number>();
  const labels: string[] = [''];
  const labelIdx = new Map([['', 0]]);
  const rowsOut: number[][] = [];
  for (const t of trips) {
    const st = t.stops.map((s) => stationIdx.get(s.station)!);
    const stKey = `${t.line}|${t.stops.map((s) => s.station).join(',')}`;
    const pk = `${t.line}|${t.dir}|${t.compass}|${st.join(',')}`;
    if (!patIdx.has(pk)) {
      const p: PatternDef = { l: lineIdx.get(t.line)!, d: t.dir, c: t.compass, st };
      if (t.line.startsWith('rer-')) p.x = skip.get(stKey) ? 1 : 0;
      patIdx.set(pk, pats.push(p) - 1);
    }
    const t0 = t.stops[0].a;
    const tm: number[] = [];
    const n = t.stops.length;
    for (let i = 0; i < n; i++) {
      let { a, d } = t.stops[i];
      if (a === d && i > 0 && i < n - 1) {
        const h = Math.min(10, (a - t.stops[i - 1].d) / 4, (t.stops[i + 1].a - d) / 4);
        a -= h;
        d += h;
      }
      tm.push(Math.round(a - t0), Math.round(d - t0));
    }
    const tk = tm.join(',');
    if (!timIdx.has(tk)) timIdx.set(tk, tims.push(tm) - 1);
    if (!headIdx.has(t.head)) headIdx.set(t.head, heads.push(t.head) - 1);
    if (!labelIdx.has(t.label)) labelIdx.set(t.label, labels.push(t.label) - 1);
    rowsOut.push([svcIdx.get(t.service)!, patIdx.get(pk)!, timIdx.get(tk)!, t0, headIdx.get(t.head)!, labelIdx.get(t.label)!]);
  }
  rowsOut.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[3] - b[3]);

  // Realtime feeds name stops by quay ('STIF:StopPoint:Q:22087:') or stop place ('STIF:StopArea:SP:45102:').
  const stopMap: Record<string, number> = {};
  const nearest = (parent: string, x: number, y: number) => {
    const cl = clustersOf.get(parent);
    if (!cl) return undefined;
    let best = cl[0];
    for (const c of cl) if (Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y)) best = c;
    return stationIdx.get(best.id);
  };
  const codeOf = (id: string) => {
    const m = id.match(/^IDFM:(?:(monomodalStopPlace):)?(\d+)$/);
    return m ? `${m[1] ? 'SP' : 'Q'}:${m[2]}` : null;
  };
  for (const s of stops.values()) {
    const code = codeOf(s.id);
    if (!code) continue;
    const lines = used.get(s.id);
    const own = lines && [...lines].map((l) => stationOf.get(`${s.id}|${l}`)).find(Boolean);
    const idx = own ? stationIdx.get(own) : nearest(s.parent, s.x, s.y);
    if (idx != null) stopMap[code] = idx;
  }
  const svcList = svcIds.map((id) => services.get(id) ?? { days: '0000000', start: 0, end: 0 });
  const dates = svcList.flatMap((s) => [s.start, s.end, ...(s.add ?? [])]).filter(Boolean);
  return {
    built: new Date().toISOString(),
    range: [Math.min(...dates), Math.max(...dates)],
    services: svcList,
    lines,
    stations: stationIds,
    stopMap,
    heads,
    labels,
    pats,
    tims,
    trips: rowsOut.flat(),
  };
}

/** Old ZDE quay numbers that realtime feeds may still use, from object_codes_extension.txt. */
async function addAltCodes(sched: ParisSchedule) {
  const byId = new Map<string, number>();
  for (const [code, idx] of Object.entries(sched.stopMap)) if (code.startsWith('Q:')) byId.set(`IDFM:${code.slice(2)}`, idx);
  let n = 0;
  for await (const r of rows('object_codes_extension.txt', (l) => l.startsWith('stop_point,') && l.includes('netex_zder_quay'))) {
    const idx = byId.get(r.object_id);
    if (idx == null || !/^\d+$/.test(r.object_code) || sched.stopMap[`Q:${r.object_code}`] != null) continue;
    sched.stopMap[`Q:${r.object_code}`] = idx;
    n++;
  }
  console.log(`alternate quay codes: ${n}`);
}

const services = await loadServices(new Set(trips.map((t) => t.service)));
const schedule = buildSchedule(services);
await addAltCodes(schedule);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeJson(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  console.log(`wrote ${file.slice(ROOT.length + 1)} (${(text.length / 1024).toFixed(0)} KB)`);
}

const lines: LineDef[] = SPECS.filter((s) => [...stations.values()].some((st) => st.lines.has(s.id))).map((s) => {
  const r = routes.find((r) => routeLine.get(r.route_id) === s)!;
  const [bg, fg] = PALETTE[s.id] ?? ['666666', 'FFFFFF'];
  return {
    id: s.id,
    system: s.system,
    name: s.name,
    short: s.short,
    color: `#${(r.route_color || bg).toUpperCase()}`,
    textColor: `#${(r.route_text_color || fg).toUpperCase()}`,
    kind: s.system === 'metro' ? 'metro' : s.system === 'rer' ? 'rail' : 'tram',
    bullet: s.system === 'metro' ? 'circle' : s.system === 'rer' ? 'square' : 'pill',
    stock: s.stock,
  };
});

const systems: SystemDef[] = [
  { id: 'metro', name: 'Métro', live: 'scheduled' },
  { id: 'rer', name: 'RER', live: 'scheduled' },
  { id: 'tram', name: 'Tramway', live: 'scheduled' },
];

const segments: SegmentDef[] = [];
for (const list of segs.values()) {
  list.sort((a, b) => b.n - a.n);
  for (const s of list) {
    const seg: SegmentDef = { from: s.from, to: s.to, lines: [...s.lines].sort((a, b) => lineOrder.indexOf(a) - lineOrder.indexOf(b)), pts: roundFlat(s.pts) };
    if (s.el?.some((v) => v !== 0)) seg.el = s.el;
    segments.push(seg);
  }
}
const stationDefs: StationDef[] = [...stations.values()]
  .filter((s) => s.lines.size)
  .map((s) => ({ id: s.id, name: s.name, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, lines: [...s.lines].sort((a, b) => lineOrder.indexOf(a) - lineOrder.indexOf(b)) }));

const transit: TransitData = {
  city: 'paris',
  built: new Date().toISOString().slice(0, 10),
  attribution: ['Timetables & realtime: Île-de-France Mobilités (PRIM)', 'Track levels © OpenStreetMap contributors'],
  systems,
  lines,
  stations: stationDefs,
  segments,
};
writeJson(join(ROOT, 'public/data/paris/transit.json'), transit);
writeJson(join(ROOT, 'server/data/paris/schedule.json'), schedule);
console.log(`stations ${stationDefs.length}, segments ${segments.length}, lines ${lines.length}`);
console.log(`pairs ${stats.pairs}, straight fallbacks ${stats.straight}, far ends ${stats.farEnds}, geometry variants ${stats.variants}`);
console.log(`schedule: ${schedule.trips.length / 6} trips, ${schedule.pats.length} patterns, ${schedule.tims.length} timings, ${schedule.services.length} services, ${Object.keys(schedule.stopMap).length} stop codes, dates ${schedule.range.join('–')}`);
