// Builds public/data/hongkong/transit.json and server/data/hongkong/network.json.
// Stations and line sequences come from MTR open data, coordinates and track geometry from OpenStreetMap route relations.
// Usage: npx tsx scripts/build-hongkong.ts   (downloads are cached under .cache/hongkong/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { CITIES } from '../shared/cities.ts';
import { flatLength, makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, TransitData } from '../shared/types.ts';
import { EXTRA_STATIONS, LINES, SYSTEMS } from '../server/adapters/hongkong/lines.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/hongkong');
const UA = 'TinyTrains/0.1 (transit diorama data build)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const STATIONS_CSV = 'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv';

const proj = makeProjection('hongkong');
const [W, S, E, N] = CITIES.hongkong.bbox;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cached(name: string, urls: string[], body?: string): Promise<string> {
  const file = join(CACHE, name);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  let lastErr = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = urls[attempt % urls.length];
    try {
      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        body,
        headers: { 'user-agent': UA, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      });
      const text = await res.text();
      // Overpass reports "server too busy" as an HTML page with status 200.
      if (res.ok && (!body || text.trimStart().startsWith('{'))) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        await sleep(400);
        return text;
      }
      lastErr = `${res.status} ${url}`;
    } catch (err) {
      lastErr = `${err} ${url}`;
    }
    console.warn(`  retry ${name}: ${lastErr}`);
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`fetch failed: ${lastErr}`);
}

const overpass = async (name: string, query: string) =>
  JSON.parse(await cached(name, OVERPASS, `data=${encodeURIComponent(query)}`)) as OsmResponse;

// ---------------------------------------------------------------------------
// MTR stations and stopping patterns
// ---------------------------------------------------------------------------

interface Pattern {
  dir: 'UP' | 'DOWN';
  /** Set on East Rail patterns that call at Racecourse (API field `route: "RAC"`). */
  via?: string;
  stops: string[];
}

const names = new Map<string, [string, string]>(Object.entries(EXTRA_STATIONS));
const patterns = new Map<string, Pattern[]>();

async function loadMtr() {
  const text = (await cached('mtr_lines_and_stations.csv', [STATIONS_CSV])).replace(/^﻿/, '');
  const rows = parse(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const seqs = new Map<string, Map<string, [number, string][]>>();
  for (const r of rows) {
    const line = r['Line Code'], dir = r['Direction'], code = r['Station Code'];
    if (!line || !code) continue;
    names.set(code, [r['English Name'].trim(), r['Chinese Name'].trim()]);
    const byDir = seqs.get(line) ?? new Map<string, [number, string][]>();
    seqs.set(line, byDir);
    byDir.set(dir, [...(byDir.get(dir) ?? []), [Number(r['Sequence']), code]]);
  }
  for (const l of LINES) {
    const byDir = seqs.get(l.id);
    if (!byDir) throw new Error(`no MTR sequence for ${l.id}`);
    const list: Pattern[] = [];
    const ordered = (d: string) => byDir.get(d)!.sort((a, b) => a[0] - b[0]).map(([, c]) => c);
    const up = ordered('UT'), down = ordered('DT');
    list.push({ dir: 'UP', stops: up }, { dir: 'DOWN', stops: down });
    for (const d of byDir.keys()) {
      if (d === 'UT' || d === 'DT') continue;
      const stops = ordered(d);
      // Branch lists can start or end mid-line (TKL "TKS-UT" is TIK-TKO-LHP): extend them along the main line.
      if (d.endsWith('UT')) {
        const i = up.indexOf(stops[0]);
        list.push({ dir: 'UP', stops: i > 0 ? [...up.slice(0, i), ...stops] : stops });
      } else {
        const i = down.indexOf(stops[stops.length - 1]);
        list.push({ dir: 'DOWN', stops: i >= 0 ? [...stops, ...down.slice(i + 1)] : stops });
      }
    }
    if (l.id === 'EAL') {
      for (const p of [...list]) {
        const i = p.stops.indexOf(p.dir === 'UP' ? 'FOT' : 'UNI');
        if (i >= 0) list.push({ dir: p.dir, via: 'RAC', stops: [...p.stops.slice(0, i + 1), 'RAC', ...p.stops.slice(i + 1)] });
      }
    }
    patterns.set(l.id, list);
  }
}

// ---------------------------------------------------------------------------
// OSM track graph (same approach as scripts/build-london.ts)
// ---------------------------------------------------------------------------

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
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
    const el = levelOf(w.tags ?? {});
    for (let i = 1; i < w.nodes!.length; i++) {
      const [x0, y0] = proj.project(w.geometry![i - 1].lon, w.geometry![i - 1].lat);
      const [x1, y1] = proj.project(w.geometry![i].lon, w.geometry![i].lat);
      const a = this.node(w.nodes![i - 1], x0, y0);
      const b = this.node(w.nodes![i], x1, y1);
      if (a === b) continue;
      const e = this.edges.length;
      this.edges.push({ a, b, len: Math.hypot(x1 - x0, y1 - y0), el });
      this.adj[a].push(e);
      this.adj[b].push(e);
    }
  }
}

function levelOf(tags: Record<string, string>): number {
  if (tags.bridge && tags.bridge !== 'no') return 1;
  // "building_passage" and "covered" are at-grade tracks under podiums and station roofs.
  const tunnel = tags.tunnel && !/^(no|building_passage|covered)$/.test(tags.tunnel);
  if (tunnel || tags.location === 'underground' || Number(tags.layer) < 0) return -1;
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

/** Shortest path between any start snap and any end snap; each snap adds twice its distance as a penalty. */
function shortestPath(g: Graph, As: Snap[], Bs: Snap[]): Path | null {
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
    seed(e.a, 2 * A.d + A.t * e.len, ai);
    seed(e.b, 2 * A.d + (1 - A.t) * e.len, ai);
    Bs.forEach((B, bi) => {
      if (B.edge !== A.edge) return;
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
      const total = u === e.a ? d + B.t * e.len : d + (1 - B.t) * e.len;
      if (total + 2 * B.d < best) [best, bestNode, bestA, bestB] = [total + 2 * B.d, u, src[u], bi];
    }
    for (const ei of g.adj[u]) {
      const e = g.edges[ei];
      const v = e.a === u ? e.b : e.a;
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

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  console.log('MTR lines and stations...');
  await loadMtr();
  const pairs = new Map<string, { from: string; to: string; lines: Set<string> }>();
  const stationLines = new Map<string, Set<string>>();
  for (const [line, list] of patterns) {
    for (const p of list) {
      p.stops.forEach((s, i) => {
        stationLines.set(s, (stationLines.get(s) ?? new Set()).add(line));
        if (i === 0) return;
        const k = pairKey(p.stops[i - 1], s);
        if (!pairs.has(k)) pairs.set(k, { from: p.stops[i - 1], to: s, lines: new Set() });
        pairs.get(k)!.lines.add(line);
      });
    }
  }
  console.log(`  ${stationLines.size} stations, ${pairs.size} station pairs`);

  console.log('OSM route relations...');
  const relList = await overpass(
    'osm/relations.json',
    `[out:json][timeout:180];relation["type"="route"]["route"~"^(subway|light_rail|train|monorail)$"](${S},${W},${N},${E});out tags;`,
  );
  const lineIds = new Set(LINES.map((l) => l.id));
  const relIds = relList.elements
    .filter((r) => lineIds.has(r.tags?.ref ?? '') && /MTR/.test(r.tags?.operator ?? ''))
    .map((r) => r.id)
    .sort((a, b) => a - b);
  const osm = await overpass('osm/routes.json', `[out:json][timeout:600];rel(id:${relIds.join(',')})->.r;.r out body;way(r.r);out geom;node(r.r);out;`);
  const ways = new Map<number, OsmElement>();
  const nodes = new Map<number, OsmElement>();
  const rels: OsmElement[] = [];
  for (const el of osm.elements) {
    if (el.type === 'way' && el.geometry && el.nodes) ways.set(el.id, el);
    if (el.type === 'node') nodes.set(el.id, el);
    if (el.type === 'relation') rels.push(el);
  }

  // Stop positions per line and station. A few OSM stops lack the MTR code (or carry an old one): match those by name.
  const byName = new Map([...names].map(([code, [en]]) => [normName(en), code]));
  const stops = new Map<string, Map<string, [number, number][]>>();
  const TRACK = /^(rail|subway|light_rail|narrow_gauge)$/;
  const graphs = new Map<string, Graph>();
  const all = new Graph();
  const allSeen = new Set<number>();
  for (const l of LINES) {
    const g = new Graph();
    const seen = new Set<number>();
    const lineStops = new Map<string, [number, number][]>();
    const valid = stationLines;
    for (const r of rels.filter((r) => r.tags?.ref === l.id)) {
      for (const m of r.members ?? []) {
        if (m.type === 'node' && m.role.startsWith('stop')) {
          const n = nodes.get(m.ref);
          if (!n?.lon || !n.lat) continue;
          const en = n.tags?.['name:en'] ?? n.tags?.name?.replace(/^[^A-Za-z]*/, '') ?? '';
          let code = n.tags?.ref && valid.get(n.tags.ref)?.has(l.id) ? n.tags.ref : byName.get(normName(en));
          if (!code || !valid.get(code)?.has(l.id)) continue;
          const xy = proj.project(n.lon, n.lat);
          const list = lineStops.get(code) ?? [];
          if (!list.some((p) => Math.hypot(p[0] - xy[0], p[1] - xy[1]) < 1)) list.push(xy);
          lineStops.set(code, list);
        }
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
    graphs.set(l.id, g);
    stops.set(l.id, lineStops);
    const missing = [...stationLines].filter(([s, ls]) => ls.has(l.id) && !lineStops.has(s)).map(([s]) => s);
    console.log(`  ${l.id}: ${seen.size} ways, ${g.edges.length} edges, stops for ${lineStops.size} stations${missing.length ? `, MISSING ${missing.join(' ')}` : ''}`);
  }

  // Station point: mean of each line's mean stop position, so interchanges sit between their platforms.
  const stationXY = new Map<string, [number, number]>();
  for (const code of stationLines.keys()) {
    const means: [number, number][] = [];
    for (const ls of stops.values()) {
      const list = ls.get(code);
      if (list?.length) means.push([list.reduce((a, p) => a + p[0], 0) / list.length, list.reduce((a, p) => a + p[1], 0) / list.length]);
    }
    if (!means.length) throw new Error(`no coordinates for station ${code}`);
    stationXY.set(code, [means.reduce((a, p) => a + p[0], 0) / means.length, means.reduce((a, p) => a + p[1], 0) / means.length]);
  }

  console.log('Track geometry per station pair...');
  /**
   * Track points at a station for one line, around the middle of that line's platforms. OSM stop positions mark
   * where the train front halts, at opposite platform ends for the two directions, so their mean is the platform center.
   */
  const snapAt = (line: string, g: Graph, code: string): Snap[] => {
    const own = stops.get(line)?.get(code);
    const [x, y] = own?.length
      ? [own.reduce((a, p) => a + p[0], 0) / own.length, own.reduce((a, p) => a + p[1], 0) / own.length]
      : stationXY.get(code)!;
    const near = snapCandidates(g, x, y, 150);
    return near.length ? near : snapCandidates(g, x, y, 450);
  };
  const segments: SegmentDef[] = [];
  const fallbacks: string[] = [];
  for (const p of pairs.values()) {
    const [ax, ay] = stationXY.get(p.from)!;
    const [bx, by] = stationXY.get(p.to)!;
    const straight = Math.hypot(bx - ax, by - ay);
    let path: Path | null = null;
    for (const line of p.lines) {
      for (const g of [graphs.get(line)!, all]) {
        const As = snapAt(line, g, p.from), Bs = snapAt(line, g, p.to);
        if (!As.length || !Bs.length) continue;
        const found = shortestPath(g, As, Bs);
        if (found && found.len <= 2.5 * straight + 600) {
          path = found;
          break;
        }
      }
      if (path) break;
    }
    let pts: Flat;
    let el: number[];
    if (path) {
      ({ pts, el } = finishPath(path));
    } else {
      const line = [...p.lines][0];
      fallbacks.push(`${line}: ${p.from} - ${p.to}`);
      let before: number[] | null = null;
      let after: number[] | null = null;
      for (const pat of patterns.get(line)!) {
        const r = pat.stops;
        for (let i = 0; i + 1 < r.length; i++) {
          if (r[i] === p.from && r[i + 1] === p.to) {
            if (i > 0) before = stationXY.get(r[i - 1])!;
            if (i + 2 < r.length) after = stationXY.get(r[i + 2])!;
          }
        }
      }
      pts = roundFlat(douglasPeucker(curve(before, [ax, ay], [bx, by], after), 2));
      el = new Array(pts.length / 2).fill(0);
    }
    const seg: SegmentDef = { from: p.from, to: p.to, lines: [...p.lines].sort(), pts };
    if (el.some((v) => v !== 0)) seg.el = el;
    segments.push(seg);
  }
  console.log(`  ${segments.length} segments, ${fallbacks.length} fallback curves`);
  for (const f of fallbacks) console.log(`    fallback ${f}`);

  const lineDefs: LineDef[] = LINES.map((l) => ({
    id: l.id,
    system: 'mtr',
    name: l.name,
    nameLocal: l.nameLocal,
    short: l.id,
    color: l.color,
    textColor: l.textColor,
    kind: l.kind,
    bullet: l.bullet,
    stock: l.stock,
  }));
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const stationDefs: StationDef[] = [...stationLines].map(([code, ls]) => {
    const [x, y] = stationXY.get(code)!;
    const [en, zh] = names.get(code)!;
    return { id: code, name: en, nameLocal: zh, x: r1(x), y: r1(y), lines: LINES.map((l) => l.id).filter((id) => ls.has(id)) };
  });
  const data: TransitData = {
    city: 'hongkong',
    built: new Date().toISOString().slice(0, 10),
    attribution: ['MTR Corporation (DATA.GOV.HK)', '© OpenStreetMap contributors'],
    systems: SYSTEMS,
    lines: lineDefs,
    stations: stationDefs,
    segments,
  };
  const out = join(ROOT, 'public/data/hongkong/transit.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(data));

  // What the live adapter needs: station names, stopping patterns and track lengths between stops.
  const network = {
    names: Object.fromEntries([...stationLines.keys()].map((c) => [c, names.get(c)!])),
    patterns: Object.fromEntries(patterns),
    len: Object.fromEntries(segments.map((sg) => [pairKey(sg.from, sg.to), Math.round(flatLength(sg.pts))])),
  };
  const netOut = join(ROOT, 'server/data/hongkong/network.json');
  mkdirSync(dirname(netOut), { recursive: true });
  writeFileSync(netOut, JSON.stringify(network));
  const km = segments.reduce((sum, sg) => sum + flatLength(sg.pts), 0) / 1000;
  console.log(`Wrote ${out} (${(JSON.stringify(data).length / 1e6).toFixed(2)} MB, ${km.toFixed(0)} km of track)`);
  console.log(`Wrote ${netOut} (${(JSON.stringify(network).length / 1e3).toFixed(1)} kB)`);
}

await main();
