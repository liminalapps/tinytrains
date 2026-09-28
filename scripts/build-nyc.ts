// Builds the NYC network: public/data/nyc/transit.json (client) and server/data/nyc/schedule.json
// (adapter index: static trips, stopping patterns, run times, direction labels).
// Sources: MTA subway GTFS (includes SIR), MTA Subway Stations (data.ny.gov), OSM for tunnel/viaduct levels.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { parse } from 'csv-parse/sync';
import { flatLength, makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, SystemDef, TransitData } from '../shared/types.ts';
import { FLEET } from '../server/adapters/nyc/fleet.ts';
import { routeLine } from '../server/adapters/nyc/network.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/nyc');
const OUT_PUBLIC = join(ROOT, 'public/data/nyc/transit.json');
const OUT_SERVER = join(ROOT, 'server/data/nyc/schedule.json');

const GTFS_URL = 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip';
const STATIONS_URL = 'https://data.ny.gov/api/views/39hk-dx4f/rows.csv?accessType=DOWNLOAD';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OSM_QUERY = '[out:json][timeout:200];way["railway"="subway"](40.49,-74.26,40.92,-73.70);out tags geom;';
const MAX_AGE_DAYS = 7;

const { project } = makeProjection('nyc');

async function cached(name: string, url: string, init?: RequestInit, maxAgeDays = MAX_AGE_DAYS): Promise<Buffer> {
  const file = join(CACHE, name);
  if (existsSync(file) && (Date.now() - statSync(file).mtimeMs) / 86400e3 < maxAgeDays) return readFileSync(file);
  console.log(`fetching ${url}`);
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, buf);
    return buf;
  } catch (err) {
    if (existsSync(file)) {
      console.warn(`  ${err}; using stale cache`);
      return readFileSync(file);
    }
    throw err;
  }
}

type Row = Record<string, string>;
const csv = (text: string): Row[] => parse(text, { columns: true, skip_empty_lines: true, bom: true });
const secs = (t: string) => {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

const SYSTEMS: SystemDef[] = [
  { id: 'nyc-subway', name: 'NYC Subway', live: 'realtime' },
  { id: 'nyc-sir', name: 'Staten Island Railway', live: 'realtime' },
];

// Official MTA line colors (graphic standards); the N/Q/R/W bullet uses black text.
const COLORS: Record<string, [string, string]> = {
  '1': ['#EE352E', '#FFFFFF'], '2': ['#EE352E', '#FFFFFF'], '3': ['#EE352E', '#FFFFFF'],
  '4': ['#00933C', '#FFFFFF'], '5': ['#00933C', '#FFFFFF'], '6': ['#00933C', '#FFFFFF'],
  '7': ['#B933AD', '#FFFFFF'],
  A: ['#0039A6', '#FFFFFF'], C: ['#0039A6', '#FFFFFF'], E: ['#0039A6', '#FFFFFF'],
  B: ['#FF6319', '#FFFFFF'], D: ['#FF6319', '#FFFFFF'], F: ['#FF6319', '#FFFFFF'], M: ['#FF6319', '#FFFFFF'],
  G: ['#6CBE45', '#FFFFFF'],
  J: ['#996633', '#FFFFFF'], Z: ['#996633', '#FFFFFF'],
  L: ['#A7A9AC', '#FFFFFF'],
  N: ['#FCCC0A', '#000000'], Q: ['#FCCC0A', '#000000'], R: ['#FCCC0A', '#000000'], W: ['#FCCC0A', '#000000'],
  GS: ['#808183', '#FFFFFF'], FS: ['#808183', '#FFFFFF'], H: ['#808183', '#FFFFFF'],
  SI: ['#08179C', '#FFFFFF'],
};
const LINE_ORDER = Object.keys(COLORS);

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface Poly {
  pts: Flat;
  cum: number[];
}

function makePoly(pts: Flat): Poly {
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  return { pts, cum };
}

function closestOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { t, d: Math.hypot(px - x, py - y) };
}

/**
 * Measure along `poly` of the point nearest (x, y), searching forward from `fromM`. Takes the first
 * stretch that comes within `near` meters, so a shape that passes a station twice resolves in order.
 */
function locate(poly: Poly, x: number, y: number, fromM: number, near = 150) {
  const { pts, cum } = poly;
  let best = { m: fromM, d: Infinity };
  let region: { m: number; d: number } | null = null;
  for (let i = 0; i < cum.length - 1; i++) {
    if (cum[i + 1] < fromM) continue;
    const c = closestOnSeg(x, y, pts[2 * i], pts[2 * i + 1], pts[2 * i + 2], pts[2 * i + 3]);
    let m = cum[i] + c.t * (cum[i + 1] - cum[i]);
    let d = c.d;
    if (m < fromM) {
      m = fromM;
      const p = pointAt(poly, m);
      d = Math.hypot(p[0] - x, p[1] - y);
    }
    if (d < best.d) best = { m, d };
    if (d < near) {
      if (!region || d < region.d) region = { m, d };
    } else if (region && d > near * 2) break;
  }
  return region ?? best;
}

function pointAt(poly: Poly, m: number): [number, number] {
  const { pts, cum } = poly;
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < m) i++;
  const len = cum[i + 1] - cum[i];
  const t = len > 0 ? Math.max(0, Math.min(1, (m - cum[i]) / len)) : 0;
  return [pts[2 * i] + t * (pts[2 * i + 2] - pts[2 * i]), pts[2 * i + 1] + t * (pts[2 * i + 3] - pts[2 * i + 1])];
}

function slice(poly: Poly, m0: number, m1: number): Flat {
  const out: Flat = [...pointAt(poly, m0)];
  for (let i = 0; i < poly.cum.length; i++) {
    if (poly.cum[i] > m0 + 0.5 && poly.cum[i] < m1 - 0.5) out.push(poly.pts[2 * i], poly.pts[2 * i + 1]);
  }
  out.push(...pointAt(poly, m1));
  return out;
}

function reverse(pts: Flat): Flat {
  const out: Flat = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
  return out;
}

function distToPoly(x: number, y: number, pts: Flat): number {
  let d = Infinity;
  for (let i = 0; i + 3 < pts.length; i += 2) d = Math.min(d, closestOnSeg(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]).d);
  return d;
}

/** Max distance from points sampled along `a` to polyline `b`. */
function maxDeviation(a: Flat, b: Flat, step = 20): number {
  const poly = makePoly(a);
  const len = poly.cum[poly.cum.length - 1];
  let max = 0;
  for (let m = 0; m <= len; m += step) {
    const [x, y] = pointAt(poly, m);
    max = Math.max(max, distToPoly(x, y, b));
  }
  return max;
}

function simplify(pts: Flat, tol: number): Flat {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = closestOnSeg(pts[2 * i], pts[2 * i + 1], pts[2 * a], pts[2 * a + 1], pts[2 * b], pts[2 * b + 1]).d;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: Flat = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Track levels from OSM (tunnel -1, grade 0, viaduct/bridge 1)
// ---------------------------------------------------------------------------

interface OsmSeg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  lvl: number;
}

function osmLevel(t: Record<string, string>): number {
  if (t.tunnel && t.tunnel !== 'no') return -1;
  if (t.bridge && t.bridge !== 'no') return 1;
  if (t.cutting === 'yes' || t.embankment === 'yes') return 0;
  const layer = Number(t.layer ?? 0) || 0;
  if (layer < 0) return -1;
  if (layer > 0 && t.embankment !== 'yes') return 1;
  return 0;
}

class LevelIndex {
  private cells = new Map<string, OsmSeg[]>();
  private static CELL = 100;

  constructor(osm: { elements: { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] }) {
    for (const el of osm.elements) {
      const t = el.tags ?? {};
      if (t.railway !== 'subway' || !el.geometry || ['yard', 'siding'].includes(t.service)) continue;
      const lvl = osmLevel(t);
      const g = el.geometry.map((p) => project(p.lon, p.lat));
      for (let i = 0; i < g.length - 1; i++) {
        const seg = { ax: g[i][0], ay: g[i][1], bx: g[i + 1][0], by: g[i + 1][1], lvl };
        const len = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
        const steps = Math.max(1, Math.ceil(len / (LevelIndex.CELL / 2)));
        const keys = new Set<string>();
        for (let s = 0; s <= steps; s++) {
          const x = seg.ax + ((seg.bx - seg.ax) * s) / steps;
          const y = seg.ay + ((seg.by - seg.ay) * s) / steps;
          keys.add(this.key(x, y));
        }
        for (const k of keys) {
          const list = this.cells.get(k) ?? [];
          list.push(seg);
          this.cells.set(k, list);
        }
      }
    }
  }

  private key(x: number, y: number) {
    return `${Math.floor(x / LevelIndex.CELL)},${Math.floor(y / LevelIndex.CELL)}`;
  }

  /** Levels of the roughly parallel OSM tracks within 35 m, with the distance to the nearest of each. */
  candidates(x: number, y: number, dx: number, dy: number): Map<number, number> {
    const cx = Math.floor(x / LevelIndex.CELL);
    const cy = Math.floor(y / LevelIndex.CELL);
    const dl = Math.hypot(dx, dy) || 1;
    const out = new Map<number, number>();
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const s of this.cells.get(`${cx + i},${cy + j}`) ?? []) {
          const sl = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
          const cos = Math.abs((dx * (s.bx - s.ax) + dy * (s.by - s.ay)) / (dl * sl));
          if (cos < 0.8) continue;
          const d = closestOnSeg(x, y, s.ax, s.ay, s.bx, s.by).d;
          if (d < 35 && d < (out.get(s.lvl) ?? Infinity)) out.set(s.lvl, d);
        }
      }
    }
    return out;
  }
}

function densify(pts: Flat, step: number): Flat {
  const out: Flat = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const n = Math.ceil(Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]) / step);
    for (let k = 1; k <= n; k++) out.push(pts[i - 2] + ((pts[i] - pts[i - 2]) * k) / n, pts[i - 1] + ((pts[i + 1] - pts[i - 1]) * k) / n);
  }
  return out;
}

/** Per-point levels for a dense polyline; short blips are smoothed away. */
/**
 * Per-point levels for a dense polyline. Where tracks are stacked (a subway under an el), stay on the
 * level we're already on, starting from the station's own structure; short blips are smoothed away.
 */
function levelsFor(pts: Flat, idx: LevelIndex, ends: [number, number]): number[] {
  const n = pts.length / 2;
  const poly = makePoly(pts);
  const len = poly.cum[n - 1];
  const raw: (number | undefined)[] = [];
  let cur: number | undefined = ends[0];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const c = idx.candidates(pts[2 * i], pts[2 * i + 1], pts[2 * b] - pts[2 * a], pts[2 * b + 1] - pts[2 * a + 1]);
    let pick: number | undefined;
    if (len - poly.cum[i] < 150 && c.has(ends[1])) pick = ends[1];
    else if (cur !== undefined && c.has(cur)) pick = cur;
    else pick = [...c.entries()].sort((p, q) => p[1] - q[1])[0]?.[0];
    raw.push(pick);
    if (pick !== undefined) cur = pick;
  }
  const fallback = ends;
  let lv = raw.map((v, i) => v ?? (poly.cum[i] < len / 2 ? fallback[0] : fallback[1]));
  if (raw.some((v) => v !== undefined)) {
    // Fill gaps from the nearest matched point.
    lv = raw.map((v, i) => {
      if (v !== undefined) return v;
      for (let k = 1; k < n; k++) {
        if (raw[i - k] !== undefined) return raw[i - k]!;
        if (raw[i + k] !== undefined) return raw[i + k]!;
      }
      return 0;
    });
  }
  // Merge runs shorter than 60 m into the preceding run.
  for (let pass = 0; pass < 2; pass++) {
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i < n && lv[i] === lv[start]) continue;
      const runLen = poly.cum[i - 1] - poly.cum[start];
      if (runLen < 60 && (start > 0 || i < n)) {
        const fill = start > 0 ? lv[start - 1] : lv[i];
        for (let k = start; k < i; k++) lv[k] = fill;
      }
      start = i;
    }
  }
  return lv;
}

/** Simplify each constant-level run separately so level changes stay sharp. */
function simplifyWithLevels(pts: Flat, lv: number[], tol: number): { pts: Flat; el: number[] } {
  const outPts: Flat = [];
  const outEl: number[] = [];
  let start = 0;
  for (let i = 1; i <= lv.length; i++) {
    if (i < lv.length && lv[i] === lv[start]) continue;
    const part = simplify(pts.slice(2 * start, 2 * i), tol);
    for (let k = 0; k < part.length; k += 2) {
      outPts.push(part[k], part[k + 1]);
      outEl.push(lv[start]);
    }
    start = i;
  }
  return { pts: outPts, el: outEl };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function main() {
  const zip = unzipSync(new Uint8Array(await cached('gtfs_subway.zip', GTFS_URL, undefined, 3)));
  const file = (name: string) => csv(strFromU8(zip[name]));
  const routes = file('routes.txt');
  const stops = file('stops.txt');
  const trips = file('trips.txt');
  const stopTimes = file('stop_times.txt');
  const shapesRows = file('shapes.txt');
  const calendar = file('calendar.txt');
  const calendarDates = file('calendar_dates.txt');
  console.log(`gtfs: ${routes.length} routes, ${stops.length} stops, ${trips.length} trips, ${stopTimes.length} stop times`);

  let mta: Row[] = [];
  try {
    mta = csv((await cached('mta_stations.csv', STATIONS_URL, undefined, 30)).toString('utf8'));
  } catch (err) {
    console.warn(`MTA stations dataset unavailable (${err}); no direction labels or structure fallback`);
  }
  const mtaById = new Map(mta.map((r) => [r['GTFS Stop ID'], r]));

  let levels: LevelIndex | undefined;
  try {
    const buf = await cached('osm_subway.json', OVERPASS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'tiny-trains-build/0.1' },
      body: new URLSearchParams({ data: OSM_QUERY }),
    }, 60);
    const osm = JSON.parse(buf.toString('utf8'));
    if (!(osm.elements?.length > 1000)) {
      rmSync(join(CACHE, 'osm_subway.json'));
      throw new Error(`only ${osm.elements?.length ?? 0} ways (${osm.remark ?? 'no remark'})`);
    }
    levels = new LevelIndex(osm);
  } catch (err) {
    console.warn(`OSM unavailable (${err}); levels from station structure only`);
  }

  // Stations (parent stops)
  const parentOf = new Map<string, string>();
  const stopRow = new Map<string, Row>();
  for (const s of stops) {
    stopRow.set(s.stop_id, s);
    parentOf.set(s.stop_id, s.parent_station || s.stop_id);
  }

  // Trips -> ordered stop lists
  const tripRow = new Map(trips.map((t) => [t.trip_id, t]));
  const tripStops = new Map<string, { s: string; a: number; d: number; q: number }[]>();
  for (const st of stopTimes) {
    let list = tripStops.get(st.trip_id);
    if (!list) tripStops.set(st.trip_id, (list = []));
    list.push({ s: parentOf.get(st.stop_id) ?? st.stop_id, a: secs(st.arrival_time), d: secs(st.departure_time), q: Number(st.stop_sequence) });
  }

  // Shapes
  const shapePts = new Map<string, { q: number; x: number; y: number }[]>();
  for (const r of shapesRows) {
    let list = shapePts.get(r.shape_id);
    if (!list) shapePts.set(r.shape_id, (list = []));
    const [x, y] = project(Number(r.shape_pt_lon), Number(r.shape_pt_lat));
    list.push({ q: Number(r.shape_pt_sequence), x, y });
  }
  const shapes = new Map<string, Poly>();
  for (const [id, list] of shapePts) {
    list.sort((a, b) => a.q - b.q);
    shapes.set(id, makePoly(list.flatMap((p) => [p.x, p.y])));
  }

  // Patterns, schedule index, run times
  const geomPatterns = new Map<string, { shape: string; stops: string[]; lines: Set<string>; trips: number }>();
  const seqIdx = new Map<string, number>();
  const seqs: string[][] = [];
  const timingIdx = new Map<string, number>();
  const timings: [number, number[], number[] | null][] = [];
  const tripIndex: Record<string, [number, number, string, string][]> = {};
  const runs = new Map<string, number[]>();
  const stationLines = new Map<string, Set<string>>();
  const usedLines = new Set<string>();

  for (const [tripId, list] of tripStops) {
    const t = tripRow.get(tripId);
    if (!t) continue;
    list.sort((a, b) => a.q - b.q);
    const line = routeLine(t.route_id);
    if (!COLORS[line]) continue;
    usedLines.add(line);
    const seq = list.map((x) => x.s);
    for (const s of seq) {
      const set = stationLines.get(s) ?? new Set();
      set.add(line);
      stationLines.set(s, set);
    }

    const gk = `${t.shape_id}|${seq.join(',')}`;
    const gp = geomPatterns.get(gk) ?? { shape: t.shape_id, stops: seq, lines: new Set(), trips: 0 };
    gp.lines.add(line);
    gp.trips++;
    geomPatterns.set(gk, gp);

    const t0 = list[0].a;
    const arr = list.map((x) => x.a - t0);
    const dep = list.map((x) => x.d - t0);
    const depSame = dep.every((v, i) => v === arr[i]);
    const sk = seq.join(',');
    let si = seqIdx.get(sk);
    if (si === undefined) {
      seqIdx.set(sk, (si = seqs.length));
      seqs.push(seq);
    }
    const tk = `${si}|${arr.join(',')}|${depSame ? '' : dep.join(',')}`;
    let pi = timingIdx.get(tk);
    if (pi === undefined) {
      timingIdx.set(tk, (pi = timings.length));
      timings.push([si, arr, depSame ? null : dep]);
    }
    const m = tripId.match(/_(\d{6})_([A-Z0-9]+)\.+([NS])(\w*)$/);
    if (m) {
      const key = `${t.service_id}|${m[1]}_${routeLine(m[2])}.${m[3]}`;
      (tripIndex[key] ??= []).push([pi, t0, m[4], t.route_id]);
    }

    for (let i = 0; i + 1 < list.length; i++) {
      const k = `${list[i].s}|${list[i + 1].s}`;
      const r = runs.get(k) ?? [];
      r.push(list[i + 1].a - list[i].d);
      runs.set(k, r);
    }
  }

  const median = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // Lines
  const routeById = new Map(routes.map((r) => [r.route_id, r]));
  const lines: LineDef[] = LINE_ORDER.filter((id) => usedLines.has(id)).map((id) => {
    const r = routeById.get(id)!;
    const shuttle = ['GS', 'FS', 'H'].includes(id);
    const sir = id === 'SI';
    return {
      id,
      system: sir ? 'nyc-sir' : 'nyc-subway',
      name: shuttle || sir ? r.route_long_name : `${r.route_short_name} ${r.route_long_name}`,
      short: shuttle ? 'S' : sir ? 'SIR' : r.route_short_name,
      color: COLORS[id][0],
      textColor: COLORS[id][1],
      kind: sir ? 'metro' : 'subway',
      bullet: 'circle',
      stock: FLEET[id]?.[0]?.stock ?? 'nyc-r160',
    };
  });

  // Stations
  const stations: StationDef[] = [];
  const stationXY = new Map<string, [number, number]>();
  for (const [id, set] of stationLines) {
    const r = stopRow.get(id);
    if (!r) throw new Error(`unknown station ${id}`);
    const [x, y] = project(Number(r.stop_lon), Number(r.stop_lat));
    stationXY.set(id, [x, y]);
    stations.push({
      id,
      name: r.stop_name,
      ...roundXY(x, y),
      lines: LINE_ORDER.filter((l) => set.has(l)),
    });
  }
  stations.sort((a, b) => a.id.localeCompare(b.id));

  // Segments: slice each pattern's shape between consecutive stops; merge matching geometry per pair.
  interface Variant {
    a: string;
    b: string;
    pts: Flat;
    lines: Set<string>;
  }
  const variants = new Map<string, Variant[]>();
  let far = 0;
  const patternList = [...geomPatterns.values()].sort((p, q) => q.trips - p.trips);
  for (const p of patternList) {
    const poly = shapes.get(p.shape);
    if (!poly) throw new Error(`missing shape ${p.shape}`);
    const ms: number[] = [];
    let m = 0;
    for (const s of p.stops) {
      const [x, y] = stationXY.get(s)!;
      const loc = locate(poly, x, y, m);
      if (loc.d > 200) far++;
      ms.push((m = loc.m));
    }
    for (let i = 0; i + 1 < p.stops.length; i++) {
      let a = p.stops[i];
      let b = p.stops[i + 1];
      let pts = slice(poly, ms[i], ms[i + 1]);
      if (a > b) {
        [a, b] = [b, a];
        pts = reverse(pts);
      }
      const key = `${a}|${b}`;
      const list = variants.get(key) ?? [];
      variants.set(key, list);
      const same = list.find((v) => maxDeviation(pts, v.pts) < 30 && maxDeviation(v.pts, pts) < 30);
      if (same) for (const l of p.lines) same.lines.add(l);
      else list.push({ a, b, pts, lines: new Set(p.lines) });
    }
  }
  if (far) console.warn(`${far} pattern stops more than 200 m from their shape`);

  const structureLevel = (id: string) => {
    const s = mtaById.get(id)?.Structure ?? 'Subway';
    return s === 'Subway' ? -1 : s === 'Elevated' || s === 'Viaduct' ? 1 : 0;
  };

  const segments: SegmentDef[] = [];
  let endMax = 0;
  for (const list of variants.values()) {
    for (const v of list) {
      const dense = densify(v.pts, 15);
      const lv = levels ? levelsFor(dense, levels, [structureLevel(v.a), structureLevel(v.b)]) : null;
      const { pts, el } = lv
        ? simplifyWithLevels(dense, lv, 1.5)
        : { pts: simplify(v.pts, 1.5), el: undefined };
      const [ax, ay] = stationXY.get(v.a)!;
      const [bx, by] = stationXY.get(v.b)!;
      endMax = Math.max(endMax, Math.hypot(pts[0] - ax, pts[1] - ay), Math.hypot(pts[pts.length - 2] - bx, pts[pts.length - 1] - by));
      const seg: SegmentDef = { from: v.a, to: v.b, lines: LINE_ORDER.filter((l) => v.lines.has(l)), pts: roundFlat(pts) };
      if (el) seg.el = el;
      segments.push(seg);
    }
  }
  segments.sort((p, q) => p.from.localeCompare(q.from) || p.to.localeCompare(q.to));

  const transit: TransitData = {
    city: 'nyc',
    built: new Date().toISOString().slice(0, 10),
    attribution: ['MTA New York City Transit', '© OpenStreetMap contributors (track levels)'],
    systems: SYSTEMS,
    lines,
    stations,
    segments,
  };

  // Server index
  const runsOut: Record<string, number> = {};
  for (const [k, v] of runs) runsOut[k] = median(v);
  const labels: Record<string, [string, string]> = {};
  for (const s of stations) {
    const r = mtaById.get(s.id);
    if (r) labels[s.id] = [r['North Direction Label'] ?? '', r['South Direction Label'] ?? ''];
  }
  const services: Record<string, { days: string; start: string; end: string; add: string[]; remove: string[] }> = {};
  for (const c of calendar) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => c[d]).join('');
    services[c.service_id] = { days, start: c.start_date, end: c.end_date, add: [], remove: [] };
  }
  for (const c of calendarDates) {
    const s = services[c.service_id];
    if (s) (c.exception_type === '1' ? s.add : s.remove).push(c.date);
  }
  const schedule = { built: transit.built, services, seqs, patterns: timings, trips: tripIndex, runs: runsOut, labels };

  mkdirSync(dirname(OUT_PUBLIC), { recursive: true });
  mkdirSync(dirname(OUT_SERVER), { recursive: true });
  const tj = JSON.stringify(transit);
  const sj = JSON.stringify(schedule);
  writeFileSync(OUT_PUBLIC, tj);
  writeFileSync(OUT_SERVER, sj);

  const totalLen = segments.reduce((s, g) => s + flatLength(g.pts), 0);
  console.log(`lines ${lines.length}, stations ${stations.length}, segments ${segments.length} (${(totalLen / 1000).toFixed(0)} km), pairs ${variants.size}`);
  console.log(`patterns: ${geomPatterns.size} geometry, ${timings.length} timing; max endpoint offset ${endMax.toFixed(0)} m`);
  console.log(`transit.json ${(tj.length / 1e6).toFixed(2)} MB, schedule.json ${(sj.length / 1e6).toFixed(2)} MB`);
}

function roundXY(x: number, y: number) {
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

await main();
