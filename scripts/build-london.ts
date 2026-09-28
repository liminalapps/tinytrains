// Builds public/data/london/transit.json and server/data/london/routes.json.
// Stations and stopping patterns come from the TfL Unified API, track geometry from OpenStreetMap route relations.
// Usage: npx tsx scripts/build-london.ts   (downloads are cached under .cache/london/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CITIES } from '../shared/cities.ts';
import { flatLength, makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, TransitData } from '../shared/types.ts';
import { cleanName, LINES, SYSTEMS, type LondonLine } from '../server/adapters/london/lines.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/london');
const UA = 'TinyTrains/0.1 (transit diorama data build)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const APP_KEY = process.env.TFL_APP_KEY;

const proj = makeProjection('london');
const [W, S, E, N] = CITIES.london.bbox;
const inBox = (lon: number, lat: number) => lon >= W && lon <= E && lat >= S && lat <= N;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cachedJson<T>(name: string, urls: string[], body?: string): Promise<T> {
  const file = join(CACHE, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = urls[attempt % urls.length];
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        body,
        headers: { 'user-agent': UA, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text) as T;
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        await sleep(400);
        return data;
      }
      lastErr = `${res.status} ${url}`;
    } catch (err) {
      lastErr = `${err} ${url}`;
    }
    console.warn(`  retry ${name}: ${lastErr}`);
    await sleep(4000 * (attempt + 1));
  }
  throw new Error(`fetch failed: ${lastErr}`);
}

const tfl = (path: string) => [`https://api.tfl.gov.uk${path}${APP_KEY ? `${path.includes('?') ? '&' : '?'}app_key=${APP_KEY}` : ''}`];
const overpass = (name: string, query: string) => cachedJson<OsmResponse>(name, OVERPASS, `data=${encodeURIComponent(query)}`);

// ---------------------------------------------------------------------------
// TfL stations and stopping patterns
// ---------------------------------------------------------------------------

interface TflStopPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
}
interface TflSequence {
  stopPointSequences: { branchId: number; stopPoint: TflStopPoint[] }[];
  orderedLineRoutes: { name: string; naptanIds: string[] }[];
}

interface StationInfo {
  id: string;
  name: string;
  lon: number;
  lat: number;
  lines: Set<string>;
}

const stations = new Map<string, StationInfo>();
/** Ordered stop lists per line: TfL route variants and sequence branches, clipped to the bbox. */
const routes = new Map<string, string[][]>();
/** Stations at the end of a route clipped by the bbox: trains there enter or leave the map. */
const edges = new Set<string>();
/** Unordered station pairs that need geometry. */
const pairs = new Map<string, { from: string; to: string; lines: Set<string> }>();

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function addPair(line: string, a: string, b: string) {
  if (a === b) return;
  const k = pairKey(a, b);
  let p = pairs.get(k);
  if (!p) pairs.set(k, (p = { from: a, to: b, lines: new Set() }));
  p.lines.add(line);
}

/** Split an ordered stop list into runs of in-bbox stations. */
function clipRuns(ids: string[]): string[][] {
  const runs: string[][] = [];
  let cur: string[] = [];
  ids.forEach((id, i) => {
    if (stations.has(id)) {
      if (i > 0 && !cur.length) edges.add(id);
      cur.push(id);
    } else {
      if (cur.length) edges.add(cur[cur.length - 1]);
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  });
  if (cur.length > 1) runs.push(cur);
  return runs;
}

async function loadTfl() {
  for (const line of LINES) {
    const seqs: TflSequence[] = [];
    for (const dir of ['outbound', 'inbound']) {
      seqs.push(await cachedJson<TflSequence>(`tfl/seq-${line.id}-${dir}.json`, tfl(`/Line/${line.id}/Route/Sequence/${dir}`)));
    }
    for (const seq of seqs) {
      for (const br of seq.stopPointSequences) {
        for (const sp of br.stopPoint) {
          if (!inBox(sp.lon, sp.lat)) continue;
          let st = stations.get(sp.id);
          if (!st) stations.set(sp.id, (st = { id: sp.id, name: cleanName(sp.name), lon: sp.lon, lat: sp.lat, lines: new Set() }));
          st.lines.add(line.id);
        }
      }
    }
    const lists: string[][] = [];
    const seen = new Set<string>();
    for (const seq of seqs) {
      const raw = [...seq.orderedLineRoutes.map((r) => r.naptanIds), ...seq.stopPointSequences.map((b) => b.stopPoint.map((s) => s.id))];
      for (const ids of raw) {
        for (const run of clipRuns(ids)) {
          const k = run.join(',');
          if (seen.has(k)) continue;
          seen.add(k);
          lists.push(run);
          for (let i = 1; i < run.length; i++) addPair(line.id, run[i - 1], run[i]);
        }
      }
    }
    routes.set(line.id, lists);
  }
}

// ---------------------------------------------------------------------------
// OSM track graph
// ---------------------------------------------------------------------------

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string }[];
}
interface OsmResponse {
  elements: OsmElement[];
}

interface Edge {
  a: number;
  b: number;
  len: number;
  el: number;
  oneway: number; // 1: a->b only, -1: b->a only, 0: both
}

class Graph {
  xy: number[] = [];
  edges: Edge[] = [];
  adj: number[][] = [];
  private index = new Map<number, number>();

  node(osmId: number, x: number, y: number): number {
    let i = this.index.get(osmId);
    if (i === undefined) {
      i = this.adj.length;
      this.index.set(osmId, i);
      this.xy.push(x, y);
      this.adj.push([]);
    }
    return i;
  }

  addWay(w: OsmElement) {
    const tags = w.tags ?? {};
    const el = levelOf(tags);
    const oneway = tags.oneway === 'yes' || tags.oneway === '1' ? 1 : tags.oneway === '-1' ? -1 : 0;
    for (let i = 1; i < w.nodes!.length; i++) {
      const [x0, y0] = proj.project(w.geometry![i - 1].lon, w.geometry![i - 1].lat);
      const [x1, y1] = proj.project(w.geometry![i].lon, w.geometry![i].lat);
      const a = this.node(w.nodes![i - 1], x0, y0);
      const b = this.node(w.nodes![i], x1, y1);
      if (a === b) continue;
      const e = this.edges.length;
      this.edges.push({ a, b, len: Math.hypot(x1 - x0, y1 - y0), el, oneway });
      this.adj[a].push(e);
      this.adj[b].push(e);
    }
  }
}

function levelOf(tags: Record<string, string>): number {
  if (tags.bridge && tags.bridge !== 'no') return 1;
  if ((tags.tunnel && tags.tunnel !== 'no') || tags.location === 'underground' || Number(tags.layer) < 0) return -1;
  return 0;
}

interface Snap {
  edge: number;
  t: number; // 0 at edge.a, 1 at edge.b
  x: number;
  y: number;
  d: number;
}

/** Candidate track points near (x, y): the nearest point of every nearby track, one per ~8 m cluster. */
function snapCandidates(g: Graph, x: number, y: number, maxD: number): Snap[] {
  const all: Snap[] = [];
  for (let i = 0; i < g.edges.length; i++) {
    const e = g.edges[i];
    const ax = g.xy[2 * e.a], ay = g.xy[2 * e.a + 1];
    const dx = g.xy[2 * e.b] - ax, dy = g.xy[2 * e.b + 1] - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const px = ax + t * dx, py = ay + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d <= maxD) all.push({ edge: i, t, x: px, y: py, d });
  }
  all.sort((a, b) => a.d - b.d);
  const out: Snap[] = [];
  const limit = all.length ? Math.min(maxD, all[0].d + 150) : 0;
  for (const c of all) {
    if (c.d > limit || out.length >= 8) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 8)) continue;
    out.push(c);
  }
  return out;
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const k = this.k, v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

interface Path {
  pts: Flat;
  el: number[];
  len: number;
}

/**
 * Shortest path between any start snap and any end snap. Each snap adds a penalty of twice its
 * distance from the station, so parallel tracks close to both stations win.
 */
function shortestPath(g: Graph, As: Snap[], Bs: Snap[], oneway: boolean): Path | null {
  const canAB = (e: Edge) => !oneway || e.oneway !== -1;
  const canBA = (e: Edge) => !oneway || e.oneway !== 1;
  const n = g.adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const via = new Int32Array(n).fill(-1);
  const src = new Int32Array(n).fill(-1);
  const heap = new Heap();
  let best = Infinity;
  let bestNode = -1;
  let bestA = -1;
  let bestB = -1;
  const seed = (u: number, d: number, ai: number) => {
    if (d < dist[u]) {
      dist[u] = d;
      src[u] = ai;
      via[u] = -1;
      heap.push(d, u);
    }
  };
  As.forEach((A, ai) => {
    const e = g.edges[A.edge];
    if (canBA(e)) seed(e.a, 2 * A.d + A.t * e.len, ai);
    if (canAB(e)) seed(e.b, 2 * A.d + (1 - A.t) * e.len, ai);
    Bs.forEach((B, bi) => {
      if (B.edge !== A.edge || !(B.t >= A.t ? canAB(e) : canBA(e))) return;
      const d = 2 * (A.d + B.d) + Math.abs(B.t - A.t) * e.len;
      if (d < best) [best, bestNode, bestA, bestB] = [d, -1, ai, bi];
    });
  });
  const targets = new Map<number, number[]>();
  Bs.forEach((B, bi) => {
    const e = g.edges[B.edge];
    for (const u of [e.a, e.b]) targets.set(u, [...(targets.get(u) ?? []), bi]);
  });
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u] || d >= best) continue;
    for (const bi of targets.get(u) ?? []) {
      const B = Bs[bi];
      const e = g.edges[B.edge];
      const total = u === e.a ? (canAB(e) ? d + B.t * e.len : Infinity) : canBA(e) ? d + (1 - B.t) * e.len : Infinity;
      if (total + 2 * B.d < best) [best, bestNode, bestA, bestB] = [total + 2 * B.d, u, src[u], bi];
    }
    for (const ei of g.adj[u]) {
      const e = g.edges[ei];
      const forward = e.a === u;
      if (forward ? !canAB(e) : !canBA(e)) continue;
      const v = forward ? e.b : e.a;
      const nd = d + e.len;
      if (nd < dist[v]) {
        dist[v] = nd;
        via[v] = ei;
        src[v] = src[u];
        heap.push(nd, v);
      }
    }
  }
  if (bestA < 0) return null;
  const A = As[bestA], B = Bs[bestB];
  const ea = g.edges[A.edge], eb = g.edges[B.edge];
  const pts: Flat = [A.x, A.y];
  const el: number[] = [ea.el];
  if (bestNode >= 0) {
    const nodes: number[] = [];
    const els: number[] = [];
    for (let u = bestNode; ; ) {
      nodes.push(u);
      const ei = via[u];
      if (ei < 0) break;
      const e = g.edges[ei];
      els.push(e.el);
      u = e.a === u ? e.b : e.a;
    }
    nodes.reverse();
    els.reverse();
    nodes.forEach((u, i) => {
      pts.push(g.xy[2 * u], g.xy[2 * u + 1]);
      el.push(i === 0 ? ea.el : els[i - 1]);
    });
  }
  pts.push(B.x, B.y);
  el.push(eb.el);
  return { pts, el, len: flatLength(pts) };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function douglasPeucker(pts: Flat, tol: number): Flat {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const ax = pts[2 * i0], ay = pts[2 * i0 + 1];
    const dx = pts[2 * i1] - ax, dy = pts[2 * i1 + 1] - ay;
    const l = Math.hypot(dx, dy);
    let maxD = -1, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[2 * i] - ax, py = pts[2 * i + 1] - ay;
      const d = l > 0 ? Math.abs(px * dy - py * dx) / l : Math.hypot(px, py);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  const out: Flat = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
  return out;
}

/** Drop duplicate points, absorb very short level runs, then simplify each level run separately. */
function finishPath(path: Path): { pts: Flat; el: number[] } {
  const pts: Flat = [];
  const el: number[] = [];
  for (let i = 0; i < path.pts.length / 2; i++) {
    const x = path.pts[2 * i], y = path.pts[2 * i + 1];
    if (pts.length && Math.hypot(x - pts[pts.length - 2], y - pts[pts.length - 1]) < 0.3) continue;
    pts.push(x, y);
    el.push(path.el[i]);
  }
  // Absorb level runs shorter than 30 m into the preceding level (short bridges over lanes, gaps in tagging).
  const cum = [0];
  for (let i = 1; i < el.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]));
  for (let i = 1; i < el.length; ) {
    let j = i;
    while (j < el.length && el[j] === el[i]) j++;
    if (el[i] !== el[i - 1] && j < el.length && cum[j - 1] - cum[i - 1] < 30) for (let k = i; k < j; k++) el[k] = el[i - 1];
    i = j;
  }
  const n = el.length;
  const outPts: Flat = [];
  const outEl: number[] = [];
  for (let s = 0; s < n; ) {
    let t = s + 1;
    while (t < n && el[t] === el[s]) t++;
    // Simplify through the first point of the next run so runs join, but leave that point to the next run.
    const run = douglasPeucker(pts.slice(2 * s, 2 * Math.min(t, n - 1) + 2), 2);
    const count = t < n ? run.length / 2 - 1 : run.length / 2;
    for (let k = 0; k < count; k++) {
      outPts.push(run[2 * k], run[2 * k + 1]);
      outEl.push(el[s]);
    }
    s = t;
  }
  return { pts: roundFlat(outPts), el: outEl };
}

/** Smooth Catmull-Rom curve from b to c, shaped by neighbors a and d. */
function curve(a: number[] | null, b: number[], c: number[], d: number[] | null): Flat {
  const p0 = a ?? [2 * b[0] - c[0], 2 * b[1] - c[1]];
  const p3 = d ?? [2 * c[0] - b[0], 2 * c[1] - b[1]];
  const out: Flat = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, t2 = t * t, t3 = t2 * t;
    for (let k = 0; k < 2; k++) {
      out.push(
        0.5 *
          (2 * b[k] + (-p0[k] + c[k]) * t + (2 * p0[k] - 5 * b[k] + 4 * c[k] - p3[k]) * t2 + (-p0[k] + 3 * b[k] - 3 * c[k] + p3[k]) * t3),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('TfL route sequences...');
  await loadTfl();
  console.log(`  ${stations.size} stations, ${pairs.size} station pairs`);

  console.log('OSM route relations...');
  const [w, s, e, n] = CITIES.london.bbox;
  const relList = await overpass(
    'osm/relations.json',
    `[out:json][timeout:180];relation["type"="route"]["route"~"^(subway|light_rail|train|tram)$"](${s},${w},${n},${e});out tags;`,
  );
  const relIds = new Map<string, number[]>();
  for (const line of LINES) {
    relIds.set(
      line.id,
      relList.elements.filter((r) => (r.tags?.name ?? '').startsWith(line.osm)).map((r) => r.id),
    );
  }
  const allIds = [...new Set([...relIds.values()].flat())].sort((a, b) => a - b);
  const osm = await overpass('osm/routes.json', `[out:json][timeout:600];rel(id:${allIds.join(',')});out body;way(r);out geom;`);
  const ways = new Map<number, OsmElement>();
  const rels = new Map<number, OsmElement>();
  for (const el of osm.elements) {
    if (el.type === 'way' && el.geometry && el.nodes) ways.set(el.id, el);
    if (el.type === 'relation') rels.set(el.id, el);
  }
  const TRACK = /^(rail|subway|light_rail|tram|narrow_gauge|construction|disused)$/;
  const graphs = new Map<string, Graph>();
  const all = new Graph();
  const allSeen = new Set<number>();
  for (const line of LINES) {
    const g = new Graph();
    const seen = new Set<number>();
    for (const rid of relIds.get(line.id)!) {
      for (const m of rels.get(rid)?.members ?? []) {
        if (m.type !== 'way' || seen.has(m.ref)) continue;
        const way = ways.get(m.ref);
        if (!way || !TRACK.test(way.tags?.railway ?? '')) continue;
        seen.add(m.ref);
        g.addWay(way);
        if (!allSeen.has(m.ref)) {
          allSeen.add(m.ref);
          all.addWay(way);
        }
      }
    }
    graphs.set(line.id, g);
    console.log(`  ${line.id}: ${relIds.get(line.id)!.length} relations, ${seen.size} ways, ${g.edges.length} edges`);
  }

  console.log('Track geometry per station pair...');
  const snaps = new Map<string, Snap[]>();
  const snapOn = (gid: string, g: Graph, sid: string) => {
    const k = `${gid}|${sid}`;
    if (!snaps.has(k)) {
      const [x, y] = xyOf(sid);
      snaps.set(k, snapCandidates(g, x, y, 450));
    }
    return snaps.get(k)!;
  };
  const xyOf = (sid: string) => proj.project(stations.get(sid)!.lon, stations.get(sid)!.lat);

  const segments: SegmentDef[] = [];
  let fallbacks = 0;
  const fallbackList: string[] = [];
  for (const p of pairs.values()) {
    const [ax, ay] = xyOf(p.from);
    const [bx, by] = xyOf(p.to);
    const straight = Math.hypot(bx - ax, by - ay);
    const maxLen = 3 * straight + 600;
    let path: Path | null = null;
    const candidates: [string, Graph][] = [...[...p.lines].map((l) => [l, graphs.get(l)!] as [string, Graph]), ['all', all]];
    for (const [gid, g] of candidates) {
      const As = snapOn(gid, g, p.from);
      const Bs = snapOn(gid, g, p.to);
      if (!As.length || !Bs.length) continue;
      // Respect oneway tags (tram loops) unless that forces a long detour.
      const free = shortestPath(g, As, Bs, false);
      const directed = free && shortestPath(g, As, Bs, true);
      const found = directed && directed.len <= free!.len * 1.25 + 50 ? directed : free;
      if (found && found.len <= maxLen) {
        path = found;
        break;
      }
    }
    let pts: Flat;
    let el: number[];
    if (path) {
      ({ pts, el } = finishPath(path));
      // A few mapped tracks stop short of the station point (Heathrow T5): run the last bit straight in.
      if (Math.hypot(pts[0] - ax, pts[1] - ay) > 150) {
        pts.unshift(Math.round(ax * 10) / 10, Math.round(ay * 10) / 10);
        el.unshift(el[0]);
      }
      if (Math.hypot(pts[pts.length - 2] - bx, pts[pts.length - 1] - by) > 150) {
        pts.push(Math.round(bx * 10) / 10, Math.round(by * 10) / 10);
        el.push(el[el.length - 1]);
      }
    } else {
      fallbacks++;
      fallbackList.push(`${[...p.lines].join('/')}: ${stations.get(p.from)!.name} - ${stations.get(p.to)!.name}`);
      const line = [...p.lines][0];
      let before: number[] | null = null;
      let after: number[] | null = null;
      for (const r of routes.get(line)!) {
        for (let i = 0; i + 1 < r.length; i++) {
          if (r[i] === p.from && r[i + 1] === p.to) {
            if (i > 0) before = xyOf(r[i - 1]);
            if (i + 2 < r.length) after = xyOf(r[i + 2]);
          } else if (r[i] === p.to && r[i + 1] === p.from) {
            if (i > 0) after = xyOf(r[i - 1]);
            if (i + 2 < r.length) before = xyOf(r[i + 2]);
          }
        }
      }
      pts = roundFlat(douglasPeucker(curve(before, [ax, ay], [bx, by], after), 2));
      const g = graphs.get(line)!;
      const la = snapOn(line, g, p.from)[0], lb = snapOn(line, g, p.to)[0];
      const lvl = la && lb && g.edges[la.edge].el === g.edges[lb.edge].el ? g.edges[la.edge].el : 0;
      el = new Array(pts.length / 2).fill(lvl);
    }
    const seg: SegmentDef = { from: p.from, to: p.to, lines: [...p.lines].sort(), pts };
    if (el.some((v) => v !== 0)) seg.el = el;
    segments.push(seg);
  }
  console.log(`  ${segments.length} segments, ${fallbacks} fallback curves`);
  for (const f of fallbackList) console.log(`    fallback ${f}`);

  const lineDefs: LineDef[] = LINES.map((l: LondonLine) => ({
    id: l.id,
    system: l.system,
    name: l.name,
    short: l.short,
    color: l.color,
    textColor: l.textColor,
    kind: l.kind,
    bullet: l.bullet,
    stock: l.stock,
  }));
  const stationDefs: StationDef[] = [...stations.values()].map((st) => {
    const [x, y] = proj.project(st.lon, st.lat);
    return { id: st.id, name: st.name, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, lines: [...st.lines].sort() };
  });
  const data: TransitData = {
    city: 'london',
    built: new Date().toISOString().slice(0, 10),
    attribution: ['Powered by TfL Open Data', 'Contains OS data © Crown copyright and database rights', '© OpenStreetMap contributors'],
    systems: SYSTEMS,
    lines: lineDefs,
    stations: stationDefs,
    segments,
  };
  const out = join(ROOT, 'public/data/london/transit.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data));
  const routesOut = join(ROOT, 'server/data/london/routes.json');
  mkdirSync(dirname(routesOut), { recursive: true });
  writeFileSync(routesOut, JSON.stringify({ routes: Object.fromEntries(routes), edges: [...edges].sort() }));
  const km = segments.reduce((sum, sg) => sum + flatLength(sg.pts), 0) / 1000;
  console.log(`Wrote ${out} (${(JSON.stringify(data).length / 1e6).toFixed(2)} MB, ${km.toFixed(0)} km of track)`);
}

await main();
