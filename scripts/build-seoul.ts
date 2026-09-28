// Builds public/data/seoul/transit.json, server/data/seoul/network.json and server/data/seoul/timetable.json.
// Stations, stopping patterns and track geometry come from OpenStreetMap route relations; lines 1–9 run from Seoul
// Metro's official timetable (data.go.kr), the other lines from typical headways in server/adapters/seoul/service.ts.
// Usage: npx tsx scripts/build-seoul.ts   (downloads are cached under .cache/seoul/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CITIES } from '../shared/cities.ts';
import { flatLength, makeProjection, roundFlat } from '../shared/geo.ts';
import type { Flat, LineDef, SegmentDef, StationDef, TransitData } from '../shared/types.ts';
import { parse } from 'csv-parse/sync';
import { LINES, SHORT_TRAINS, SYSTEMS, TERMINAL_ALIAS, normName, runTime, type SeoulLine } from '../server/adapters/seoul/lines.ts';
import type { NetLine, NetPattern, NetworkData, NetVariant } from '../server/adapters/seoul/network.ts';
import { SERVICE, type PatternConf } from '../server/adapters/seoul/service.ts';
import type { TimetableData } from '../server/adapters/seoul/timetable.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache/seoul/osm');
const UA = 'TinyTrains/0.1 (transit diorama data build)';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

const proj = makeProjection('seoul');
const [W, S, E, N] = CITIES.seoul.bbox;
const inBox = (lon: number, lat: number) => lon >= W && lon <= E && lat >= S && lat <= N;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass<T>(name: string, query: string): Promise<T> {
  const file = join(CACHE, name);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  let lastErr = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
      });
      if (res.ok) {
        const text = await res.text();
        const data = JSON.parse(text) as T;
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        await sleep(1000);
        return data;
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

// ---------------------------------------------------------------------------
// Hangul romanization (Revised Romanization, without sound-change rules): a fallback for missing English names
// ---------------------------------------------------------------------------

const RR_I = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RR_V = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const RR_F = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'p', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
function romanize(ko: string): string {
  let out = '';
  for (const ch of ko) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) {
      out += ch;
      continue;
    }
    const i = Math.floor(c / 588), v = Math.floor((c % 588) / 28), f = c % 28;
    out += RR_I[i] + RR_V[v] + RR_F[f];
  }
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** English names that OSM spells oddly, keyed by normalized Korean name. */
const EN_OVERRIDE: Record<string, string> = {
  서울: 'Seoul Station',
  석남: 'Seoknam',
  매탄권선: 'Maetan-Gwonseon',
  평내호평: 'Pyeongnae-Hopyeong',
  별내별가람: 'Byeollae Byeolgaram',
  부천시청: 'Bucheon City Hall',
  태릉입구: 'Taereung',
  정부과천청사: 'Government Complex Gwacheon',
  을지로입구: 'Euljiro 1-ga',
  지평: 'Jipyeong',
  신창: 'Sinchang',
  연천: 'Yeoncheon',
  서울숲: 'Seoul Forest',
  압구정로데오: 'Apgujeong Rodeo',
  동대문역사문화공원: 'Dongdaemun History & Culture Park',
  서울대입구: "Seoul Nat'l Univ.",
  교대: "Seoul Nat'l Univ. of Education",
  이대: 'Ewha Womans Univ.',
  충정로: 'Chungjeongno',
  디지털미디어시티: 'Digital Media City',
  홍대입구: 'Hongik Univ.',
  건대입구: 'Konkuk Univ.',
  한양대: 'Hanyang Univ.',
  삼성: 'Samseong',
  잠실: 'Jamsil',
  강변: 'Gangbyeon',
  구의: 'Guui',
  대림: 'Daerim',
  왕십리: 'Wangsimni',
  청량리: 'Cheongnyangni',
  한성대입구: 'Hansung Univ.',
  총신대입구: 'Chongshin Univ.',
  이촌: 'Ichon',
  신촌: 'Sinchon',
  인천공항1터미널: 'Incheon Airport T1',
  인천공항2터미널: 'Incheon Airport T2',
  김포공항: 'Gimpo Airport',
  광운대: 'Kwangwoon Univ.',
  외대앞: 'Hankuk Univ. of Foreign Studies',
  서울대벤처타운: "Seoul Nat'l Univ. Venture Town",
  서울지방병무청: 'Seoul Military Manpower Office',
  중앙보훈병원: 'VHS Medical Center',
  응암: 'Eungam',
  고속터미널: 'Express Bus Terminal',
  종합운동장: 'Sports Complex',
  월드컵경기장: 'World Cup Stadium',
  국회의사당: 'National Assembly',
  가산디지털단지: 'Gasan Digital Complex',
  구로디지털단지: 'Guro Digital Complex',
  북한산우이: 'Bukhansan Ui',
  북한산보국문: 'Bukhansan Bogungmun',
  한국항공대: 'Korea Aerospace Univ.',
  서강대: 'Sogang Univ.',
  숙대입구: "Sookmyung Women's Univ.",
  성신여대입구: "Sungshin Women's Univ.",
  고려대: 'Korea Univ.',
  안암: 'Anam',
  상월곡: 'Sangwolgok',
  월곡: 'Wolgok',
  보라매병원: 'Boramae Medical Center',
  보라매공원: 'Boramae Park',
  남한산성입구: 'Namhansanseong',
  하남검단산: 'Hanam Geomdansan',
};

// ---------------------------------------------------------------------------
// OSM track graph (as in build-london.ts)
// ---------------------------------------------------------------------------

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
  if ((tags.tunnel && tags.tunnel !== 'no') || tags.location === 'underground' || Number(tags.layer) < 0) return -1;
  if (tags.embankment === 'yes' || Number(tags.layer) > 0) return 1;
  return 0;
}

interface Snap {
  edge: number;
  t: number;
  x: number;
  y: number;
  d: number;
}

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
  const limit = all.length ? Math.min(maxD, all[0].d + 120) : 0;
  for (const c of all) {
    if (c.d > limit || out.length >= 8) break;
    // Same track (same or touching edge) within 8 m: a duplicate. Parallel tracks stay separate candidates.
    const ce = g.edges[c.edge];
    const touching = (o: Snap) => {
      const oe = g.edges[o.edge];
      return o.edge === c.edge || oe.a === ce.a || oe.a === ce.b || oe.b === ce.a || oe.b === ce.b;
    };
    if (out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 8 && touching(o))) continue;
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

/** Shortest path between any start snap and any end snap; each snap costs twice its distance from the station. */
function shortestPath(g: Graph, As: Snap[], Bs: Snap[]): Path | null {
  const n = g.adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const via = new Int32Array(n).fill(-1);
  const src = new Int32Array(n).fill(-1);
  const heap = new Heap();
  let best = Infinity, bestNode = -1, bestA = -1, bestB = -1;
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
      if (d > maxD) (maxD = d), (idx = i);
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
    if (el[i] !== el[i - 1] && j < el.length && cum[j - 1] - cum[i - 1] < 40) for (let k = i; k < j; k++) el[k] = el[i - 1];
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
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, t2 = t * t, t3 = t2 * t;
    for (let k = 0; k < 2; k++) {
      out.push(0.5 * (2 * b[k] + (-p0[k] + c[k]) * t + (2 * p0[k] - 5 * b[k] + 4 * c[k] - p3[k]) * t2 + (-p0[k] + 3 * b[k] - 3 * c[k] + p3[k]) * t3));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Load OSM
// ---------------------------------------------------------------------------

console.log('OSM route relations...');
const relList = await overpass<OsmResponse>(
  'relations.json',
  `[out:json][timeout:180];relation["type"~"^(route|route_master)$"]["route"~"^(subway|light_rail|train|monorail)$"](${S},${W},${N},${E});out tags;`,
);
const lineOfRel = new Map<number, SeoulLine>();
for (const r of relList.elements) {
  const name = r.tags?.name ?? '';
  const line = r.tags?.type === 'route' ? LINES.find((l) => l.osm.test(name)) : undefined;
  if (line) lineOfRel.set(r.id, line);
}
const relIds = [...lineOfRel.keys()].sort((a, b) => a - b);
const routes = await overpass<OsmResponse>('routes.json', `[out:json][timeout:600];rel(id:${relIds.join(',')});out body;way(r);out geom;`);
const stopsRes = await overpass<OsmResponse>('stops.json', `[out:json][timeout:600];rel(id:${relIds.join(',')});node(r);out;`);
const stationsRes = await overpass<OsmResponse>(
  'stations-wide.json',
  '[out:json][timeout:300];node["railway"~"^(station|halt)$"](36.7,126.3,38.0,127.9);out;',
);

const tracksRes = await overpass<OsmResponse>(
  'tracks.json',
  `[out:json][timeout:600];way["railway"~"^(rail|subway|light_rail|narrow_gauge|monorail)$"](${S},${W},${N},${E});out geom;`,
);

const ways = new Map<number, OsmElement>();
const rels: OsmElement[] = [];
for (const el of routes.elements) {
  if (el.type === 'way' && el.geometry && el.nodes) ways.set(el.id, el);
  if (el.type === 'relation') rels.push(el);
}
const stopNodes = new Map(stopsRes.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
const stationNodes = stationsRes.elements.filter((e) => e.type === 'node' && e.tags?.name);
const xyOfNode = (n: OsmElement) => proj.project(n.lon!, n.lat!);

function nearestStationNode(x: number, y: number, maxD: number, name?: string): OsmElement | undefined {
  let best: OsmElement | undefined, bd = maxD;
  for (const s of stationNodes) {
    if (name && normName(s.tags!.name) !== name) continue;
    const [sx, sy] = xyOfNode(s);
    const d = Math.hypot(sx - x, sy - y);
    if (d < bd) (bd = d), (best = s);
  }
  return best;
}

// English/Korean display names by normalized Korean name (in and outside the bbox).
const names: Record<string, [string, string]> = {};
const enVotes = new Map<string, Map<string, number>>();
const voteEn = (ko: string, en: string | undefined, w = 1) => {
  if (!en) return;
  const k = normName(ko);
  if (!enVotes.has(k)) enVotes.set(k, new Map());
  const v = enVotes.get(k)!;
  const clean = en
    .replace(/\((il|i|sam|sa|o|yuk|chil|pal|gu)\)/g, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+Station$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  v.set(clean, (v.get(clean) ?? 0) + w);
};
for (const s of stationNodes) voteEn(s.tags!.name, s.tags!['name:en'], 2);
for (const s of stopNodes.values()) if (s.tags?.name) voteEn(s.tags.name, s.tags['name:en']);
const koDisplay = new Map<string, string>();
const nameFor = (key: string): [string, string] => {
  if (!names[key]) {
    const votes = [...(enVotes.get(key) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    names[key] = [EN_OVERRIDE[key] ?? votes[0]?.[0] ?? romanize(key), koDisplay.get(key) ?? key];
  }
  return names[key];
};

// ---------------------------------------------------------------------------
// Line stations and stop sequences
// ---------------------------------------------------------------------------

interface RawStop {
  name: string; // normalized Korean name
  x: number;
  y: number;
  inside: boolean;
}

interface RawVariant {
  line: string;
  rel: number;
  title: string;
  express: boolean;
  stops: RawStop[];
}

const lineConf = new Map(LINES.map((l) => [l.id, l]));
const rawVariants: RawVariant[] = [];
for (const r of rels) {
  const line = lineOfRel.get(r.id);
  if (!line) continue;
  const title = r.tags?.name ?? '';
  const stops: RawStop[] = [];
  for (const m of r.members ?? []) {
    if (m.type !== 'node' || !/^stop/.test(m.role)) continue;
    const n = stopNodes.get(m.ref);
    if (!n) continue;
    const [x, y] = xyOfNode(n);
    let raw = n.tags?.name;
    if (!raw) raw = nearestStationNode(x, y, 400)?.tags?.name;
    if (!raw) continue;
    const name = normName(raw);
    if (!koDisplay.has(name)) koDisplay.set(name, raw.replace(/\s*\(.*?\)\s*/g, '').trim());
    if (stops.length && stops[stops.length - 1].name === name) continue;
    stops.push({ name, x, y, inside: inBox(n.lon!, n.lat!) });
  }
  if (stops.length < 2) continue;
  rawVariants.push({ line: line.id, rel: r.id, title, express: /급행|특급|직통/.test(title), stops });
}

// One position per line and station: the mean of that line's stop positions.
const lineStationPts = new Map<string, number[][]>();
for (const v of rawVariants) {
  for (const s of v.stops) {
    if (!s.inside) continue;
    const k = `${v.line}|${s.name}`;
    if (!lineStationPts.has(k)) lineStationPts.set(k, []);
    lineStationPts.get(k)!.push([s.x, s.y]);
  }
}
interface LineStation {
  line: string;
  name: string;
  x: number;
  y: number;
  station?: string;
}
const lineStations = new Map<string, LineStation>();
for (const [k, pts] of lineStationPts) {
  const [line, name] = k.split('|');
  const x = pts.reduce((s, p) => s + p[0], 0) / pts.length, y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const spread = Math.max(...pts.map((p) => Math.hypot(p[0] - x, p[1] - y)));
  if (spread > 400) console.warn(`  ${line} ${name}: stop positions spread ${spread.toFixed(0)} m`);
  lineStations.set(k, { line, name, x, y });
}

// Merge line stations with the same name that are close together into one station.
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
interface StationInfo {
  id: string;
  key: string;
  x: number;
  y: number;
  lines: Set<string>;
  members: LineStation[];
}
const stations = new Map<string, StationInfo>();
const byName = new Map<string, LineStation[]>();
for (const ls of lineStations.values()) {
  if (!byName.has(ls.name)) byName.set(ls.name, []);
  byName.get(ls.name)!.push(ls);
}
const MERGE_DIST = 650;
const SPLIT_DIST = 160;
for (const [name, list] of byName) {
  const clusters: LineStation[][] = [];
  for (const ls of list) {
    const hit = clusters.find((c) => c.some((o) => Math.hypot(o.x - ls.x, o.y - ls.y) < MERGE_DIST));
    if (hit) hit.push(ls);
    else clusters.push([ls]);
  }
  // Platforms far from the rest (Seoul Station's Gyeongui platforms, AREX deep underground) become their own station.
  for (let ci = 0; ci < clusters.length; ci++) {
    for (;;) {
      const c = clusters[ci];
      if (c.length < 2) break;
      const x = c.reduce((s, p) => s + p.x, 0) / c.length, y = c.reduce((s, p) => s + p.y, 0) / c.length;
      const far = c.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) > Math.hypot(a.x - x, a.y - y) ? b : a));
      if (Math.hypot(far.x - x, far.y - y) <= SPLIT_DIST) break;
      c.splice(c.indexOf(far), 1);
      clusters.push([far]);
    }
  }
  clusters.sort((a, b) => b.length - a.length);
  clusters.forEach((c, ci) => {
    const [en] = nameFor(name);
    let id = slug(en);
    if (ci > 0 || stations.has(id)) id = `${id}-${slug(c[0].line)}`;
    const x = c.reduce((s, p) => s + p.x, 0) / c.length, y = c.reduce((s, p) => s + p.y, 0) / c.length;
    const st: StationInfo = { id, key: name, x, y, lines: new Set(c.map((m) => m.line)), members: c };
    for (const m of c) m.station = id;
    stations.set(id, st);
  });
}
const stationOf = (line: string, name: string) => lineStations.get(`${line}|${name}`)?.station;

// Variants as station-id sequences; stops outside the bbox stay as '~name'.
interface Variant {
  line: string;
  title: string;
  express: boolean;
  seq: string[];
  loop: boolean;
  ud?: 0 | 1;
}
const variants: Variant[] = [];
for (const v of rawVariants) {
  const seq = v.stops.map((s) => (s.inside ? stationOf(v.line, s.name)! : `~${s.name}`));
  const loop = seq.length > 3 && seq[0] === seq[seq.length - 1] && /순환/.test(v.title) && !/→/.test(v.title);
  // The feed's direction: inner/outer for loops, otherwise from the line's reference pairs.
  const names = v.stops.map((st) => st.name);
  let ud: 0 | 1 | undefined = /내선/.test(v.title) ? 0 : /외선/.test(v.title) ? 1 : undefined;
  for (const [a, b] of lineConf.get(v.line)!.up) {
    const i = names.indexOf(normName(a)), j = names.indexOf(normName(b));
    if (ud === undefined && i >= 0 && j >= 0 && Math.abs(i - j) <= 3) ud = i < j ? 0 : 1;
  }
  variants.push({ line: v.line, title: v.title, express: v.express, seq, loop, ud });
}

// Adjacent all-stop station pairs per line; repair variants that skip a station (incomplete relations).
const adj = new Map<string, Map<string, Set<string>>>();
const addAdj = (line: string, a: string, b: string) => {
  if (!adj.has(line)) adj.set(line, new Map());
  const m = adj.get(line)!;
  for (const [p, q] of [[a, b], [b, a]]) {
    if (!m.has(p)) m.set(p, new Set());
    m.get(p)!.add(q);
  }
};
const dist = (a: string, b: string) => {
  const A = stations.get(a)!, B = stations.get(b)!;
  return Math.hypot(A.x - B.x, A.y - B.y);
};
for (const v of variants) {
  if (v.express) continue;
  for (let i = 1; i < v.seq.length; i++) if (!v.seq[i - 1].startsWith('~') && !v.seq[i].startsWith('~')) addAdj(v.line, v.seq[i - 1], v.seq[i]);
}
for (const [line, m] of adj) {
  for (const [a, ns] of m) {
    for (const c of [...ns]) {
      for (const b of ns) {
        if (b === c || !m.get(b)?.has(c)) continue;
        if (dist(a, b) + dist(b, c) < 1.6 * dist(a, c) + 300) {
          ns.delete(c);
          m.get(c)!.delete(a);
          console.log(`  ${line}: ${a}–${c} skips ${b}`);
          break;
        }
      }
    }
  }
}
for (const v of variants) {
  if (v.express) continue;
  const m = adj.get(v.line)!;
  const out: string[] = [v.seq[0]];
  for (let i = 1; i < v.seq.length; i++) {
    const a = out[out.length - 1], c = v.seq[i];
    if (!a.startsWith('~') && !c.startsWith('~') && !m.get(a)?.has(c)) {
      const mid = [...(m.get(a) ?? [])].find((b) => m.get(b)?.has(c));
      if (mid) out.push(mid);
    }
    out.push(c);
  }
  v.seq = out;
}
// Drop duplicate variants.
{
  const seen = new Set<string>();
  for (let i = variants.length - 1; i >= 0; i--) {
    const k = `${variants[i].line}|${variants[i].express}|${variants[i].seq.join(',')}`;
    if (seen.has(k)) variants.splice(i, 1);
    else seen.add(k);
  }
}

// ---------------------------------------------------------------------------
// Service patterns (for the timetable simulation)
// ---------------------------------------------------------------------------

const keyOf = (s: string) => (s.startsWith('~') ? s.slice(1) : stations.get(s)!.key);

/** Shortest slice of a variant running from `from` to `to` (Korean names), through `via` if given. */
function findSlice(line: string, from: string, to: string, via?: string, loop?: boolean, ud?: 0 | 1): { v: Variant; seq: string[] } | null {
  let best: { v: Variant; seq: string[] } | null = null;
  const f = normName(from), t = normName(to), w = via && normName(via);
  for (const v of variants) {
    if (v.line !== line || v.express) continue;
    if (loop !== undefined && v.loop !== loop) continue;
    if (ud !== undefined && v.ud !== ud) continue;
    const keys = v.seq.map(keyOf);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== f) continue;
      for (let j = i + 1; j < keys.length; j++) {
        if (keys[j] !== t) continue;
        const seq = v.seq.slice(i, j + 1);
        if (w && !keys.slice(i, j + 1).includes(w)) continue;
        if (!best || seq.length < best.seq.length) best = { v, seq };
        break;
      }
    }
  }
  return best;
}

/** Longest run of stations inside the bbox. */
function clipInside(seq: string[]): { seq: string[]; start: number } {
  let best = { seq: [] as string[], start: 0 };
  let cur: string[] = [], start = 0;
  seq.forEach((s, i) => {
    if (s.startsWith('~')) {
      if (cur.length > best.seq.length) best = { seq: cur, start };
      cur = [];
    } else {
      if (!cur.length) start = i;
      cur.push(s);
    }
  });
  if (cur.length > best.seq.length) best = { seq: cur, start };
  return best;
}

const pairLen = new Map<string, number>(); // filled by the geometry step: 'line|a|b' -> meters
const pk = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface ResolvedPattern {
  conf: PatternConf;
  line: string;
  id: string;
  seq: string[]; // in-bbox stations, in travel order
  stop: boolean[];
  dest: string; // normalized Korean name of the real terminal
  loop: boolean;
  group: string;
}

const resolved: ResolvedPattern[] = [];
const expressPairs: { line: string; a: string; b: string }[] = [];
for (const [lineId, svc] of Object.entries(SERVICE)) {
  svc.patterns.forEach((p, pi) => {
    const dirs: [string, string][] = p.oneWay || p.loop ? [[p.from, p.to]] : [[p.from, p.to], [p.to, p.from]];
    dirs.forEach(([from, to], di) => {
      const hit = findSlice(lineId, from, to, p.via, p.loop ? true : undefined, p.ud);
      if (!hit) {
        console.warn(`  pattern ${lineId} ${from} → ${to}${p.via ? ` via ${p.via}` : ''}: no matching OSM variant`);
        return;
      }
      const { seq } = clipInside(hit.seq);
      if (seq.length < 2) return;
      const exp = p.express ? new Set(p.express.map(normName)) : null;
      const stop = seq.map((s, i) => !exp || i === 0 || i === seq.length - 1 || exp.has(stations.get(s)!.key));
      if (exp) {
        let last = seq[0];
        for (let i = 1; i < seq.length; i++) {
          if (!stop[i]) continue;
          if (!adj.get(lineId)?.get(last)?.has(seq[i])) expressPairs.push({ line: lineId, a: last, b: seq[i] });
          last = seq[i];
        }
      }
      const dest = p.loop ? (p.ud ? '외선순환' : '내선순환') : normName(to);
      resolved.push({ conf: p, line: lineId, id: `${pi}${di ? 'r' : ''}`, seq, stop, dest, loop: !!p.loop, group: `${p.group ?? 'main'}${di ? '<' : '>'}` });
    });
  });
}

// ---------------------------------------------------------------------------
// Official timetable: Seoul Metro's train timetable for lines 1–9, including the Korail sections
// (data.go.kr dataset 15098251, a keyless CSV download in EUC-KR)
// ---------------------------------------------------------------------------

const TIMETABLE_URL = 'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000007671122&fileDetailSn=1&insertDataPrcus=N';
const TIMETABLE_DAYS = ['DAY', 'SAT', 'END']; // weekday, Saturday, Sunday/holiday

interface TtTrip {
  line: string;
  day: number;
  ud: 0 | 1;
  express: boolean;
  code: string;
  dest: string; // normalized Korean terminal
  seq: string[]; // in-bbox station ids
  times: number[]; // [a0, d0, a1, d1, ...] seconds after the service day's midnight
}

const ttTrips: TtTrip[] = [];
const ttUnknown = new Map<string, number>();
{
  const file = join(ROOT, '.cache/seoul/timetable/seoul-metro-timetable.csv');
  if (!existsSync(file)) {
    console.log('Downloading the Seoul Metro timetable...');
    const res = await fetch(TIMETABLE_URL, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`timetable: HTTP ${res.status} (find the current file on data.go.kr, dataset 15098251)`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const bytes = readFileSync(file);
  const text = new TextDecoder(bytes[0] === 0xef && bytes[1] === 0xbb ? 'utf-8' : 'euc-kr').decode(bytes);
  const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true }) as Record<string, string>[];
  // Times after midnight belong to the previous service day; '00:00:00' marks a station an express passes.
  const secs = (t: string) => {
    if (!t || t === '00:00:00') return undefined;
    const [h, m, sec] = t.split(':').map(Number);
    return (h < 3 ? h + 24 : h) * 3600 + m * 60 + sec;
  };
  const byTrain = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const k = `${r['호선']}|${r['주중주말']}|${r['열차코드']}|${r['방향']}`;
    if (!byTrain.has(k)) byTrain.set(k, []);
    byTrain.get(k)!.push(r);
  }
  for (const [k, rs] of byTrain) {
    const [line, dayName, code, dir] = k.split('|');
    const day = TIMETABLE_DAYS.indexOf(dayName);
    if (!lineConf.has(line) || day < 0) continue;
    const stops = rs
      .filter((r) => r['열차도착시간'] !== '00:00:00')
      .map((r) => ({ name: normName(r['역사명']), a: secs(r['열차도착시간']), d: secs(r['열차출발시간']), dest: normName(r['도착역']) }))
      .filter((x) => x.a !== undefined || x.d !== undefined)
      .map((x) => ({ ...x, a: x.a ?? x.d!, d: x.d ?? x.a! }))
      .sort((p, q) => p.a - q.a);
    const base = { line, day, ud: (dir === 'DOWN' || dir === 'OUT' ? 1 : 0) as 0 | 1, express: rs[0]['급행여부'] === '1', code };
    // A train code can cover several trips (a gap of more than 30 min), and a trip can leave the map: one trip per
    // run of inside stations.
    let run: { id: string; a: number; d: number }[] = [];
    let dest = stops[0]?.dest ?? '';
    const flush = () => {
      if (run.length >= 2) ttTrips.push({ ...base, dest, seq: run.map((x) => x.id), times: run.flatMap((x) => [x.a, x.d]) });
      run = [];
    };
    stops.forEach((st, i) => {
      if (i > 0 && st.a - stops[i - 1].d > 1800) flush();
      dest = st.dest;
      const id = stationOf(line, st.name);
      if (!id) {
        ttUnknown.set(`${line} ${st.name}`, (ttUnknown.get(`${line} ${st.name}`) ?? 0) + 1);
        return flush();
      }
      if (run.length && run[run.length - 1].id === id) return;
      run.push({ id, a: st.a, d: st.d });
    });
    flush();
  }
  // The file's UP/DOWN/IN/OUT does not follow the realtime feed's convention on every line (line 9 runs the other
  // way round, line 2's IN is the feed's outer circle): take the direction from the oriented OSM sequences instead.
  for (const t of ttTrips) {
    const ud = orientation(t.line, t.seq);
    if (ud !== undefined) t.ud = ud;
  }
  console.log(`Timetable: ${rows.length} rows, ${ttTrips.length} trips inside the map`);
  console.log(`  stations outside the map (or unmatched): ${[...ttUnknown.keys()].join(', ')}`);
}

/** The feed direction (updnLine) of a train calling at these stations in this order, from the oriented OSM sequences. */
function orientation(line: string, seq: string[]): 0 | 1 | undefined {
  for (let k = 0; k + 1 < seq.length; k++) {
    for (const v of variants) {
      if (v.line !== line || v.express || v.ud === undefined) continue;
      const i = v.seq.indexOf(seq[k]);
      if (i < 0) continue;
      const j = v.seq.indexOf(seq[k + 1], i + 1);
      if (j > i && j - i <= 6) return v.ud;
    }
  }
  return undefined;
}

/** Stations strictly between two stations of a line, along the shortest OSM stopping sequence. */
function between(line: string, a: string, b: string): string[] {
  let best: string[] | null = null;
  for (const v of variants) {
    if (v.line !== line || v.express) continue;
    for (let i = 0; i < v.seq.length; i++) {
      if (v.seq[i] !== a) continue;
      for (let j = 0; j < v.seq.length; j++) {
        if (v.seq[j] !== b || i === j) continue;
        const mid = i < j ? v.seq.slice(i + 1, j) : v.seq.slice(j + 1, i).reverse();
        if (!best || mid.length < best.length) best = mid;
      }
    }
  }
  return best ?? [];
}

// Timetable hops that are not adjacent stations (expresses) need their own geometry; run times come from the timetable.
const ttRuns = new Map<string, number[]>();
for (const t of ttTrips) {
  for (let i = 1; i < t.seq.length; i++) {
    const a = t.seq[i - 1], b = t.seq[i];
    if (!adj.get(t.line)?.get(a)?.has(b)) expressPairs.push({ line: t.line, a, b });
    if (t.day !== 0) continue;
    const k = `${t.line}|${pk(a, b)}`;
    if (!ttRuns.has(k)) ttRuns.set(k, []);
    ttRuns.get(k)!.push(t.times[2 * i] - t.times[2 * i - 1]);
  }
}
const median = (v: number[]) => [...v].sort((x, y) => x - y)[v.length >> 1];

// Realtime express trains stop where the timetabled express trips (or express patterns) to the same terminal stop,
// and everywhere outside the stretches those cover. '*' is the union, for terminals without an express of their own.
// Connect those stops along every sequence too.
interface ExpressSet {
  stops: Set<string>;
  cover: Set<string>;
}
const expressOf = (line: string): Map<string, ExpressSet> => {
  const trips: { dest: string; seq: string[]; stops: string[] }[] = [
    ...ttTrips.filter((t) => t.line === line && t.express).map((t) => ({ dest: t.dest, seq: t.seq, stops: t.seq })),
    ...resolved.filter((r) => r.line === line && r.conf.express).map((r) => ({ dest: r.dest, seq: r.seq, stops: r.seq.filter((_, i) => r.stop[i]) })),
  ];
  const sets = new Map<string, ExpressSet>();
  for (const t of trips) {
    for (const key of [t.dest, '*']) {
      if (!sets.has(key)) sets.set(key, { stops: new Set(), cover: new Set() });
      const set = sets.get(key)!;
      for (const st of t.stops) set.stops.add(st);
      for (const st of t.seq) set.cover.add(st);
      for (let i = 1; i < t.seq.length; i++) for (const m of between(line, t.seq[i - 1], t.seq[i])) set.cover.add(m);
    }
  }
  return sets;
};
for (const line of LINES) {
  for (const { stops: ex, cover } of expressOf(line.id).values()) {
    for (const v of variants) {
      if (v.line !== line.id || v.express) continue;
      let last: string | null = null;
      v.seq.forEach((st, i) => {
        if (st.startsWith('~')) return void (last = null);
        const edge = last === null || i === v.seq.length - 1 || v.seq[i + 1].startsWith('~');
        if (!edge && !ex.has(st) && cover.has(st)) return;
        if (last && last !== st && !adj.get(line.id)?.get(last)?.has(st)) expressPairs.push({ line: line.id, a: last, b: st });
        last = st;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Track geometry
// ---------------------------------------------------------------------------

console.log('Track graphs...');
const TRACK = /^(rail|subway|light_rail|narrow_gauge|monorail|construction)$/;
const graphs = new Map<string, Graph>();
const all = new Graph();
const allSeen = new Set<number>();
for (const line of LINES) {
  const g = new Graph();
  const seen = new Set<number>();
  for (const r of rels) {
    if (lineOfRel.get(r.id)?.id !== line.id) continue;
    for (const m of r.members ?? []) {
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
  console.log(`  ${line.id}: ${seen.size} ways, ${g.edges.length} edges`);
}
// Relations sometimes miss a piece of track; the fallback graph also has every other track in the bbox.
for (const w of tracksRes.elements) {
  if (w.type !== 'way' || !w.geometry || !w.nodes || allSeen.has(w.id) || /^(abandoned|razed|proposed)$/.test(w.tags?.service ?? '')) continue;
  if (w.tags?.service && /^(yard|siding|spur)$/.test(w.tags.service)) continue;
  allSeen.add(w.id);
  all.addWay(w);
}
console.log(`  all tracks: ${all.edges.length} edges`);

// Pairs that need geometry: adjacent stations per line, plus express hops.
const pairs = new Map<string, { a: string; b: string; lines: Set<string> }>();
const addPair = (line: string, a: string, b: string) => {
  const k = pk(a, b);
  if (!pairs.has(k)) pairs.set(k, { a: a < b ? a : b, b: a < b ? b : a, lines: new Set() });
  pairs.get(k)!.lines.add(line);
};
for (const [line, m] of adj) for (const [a, ns] of m) for (const b of ns) if (a < b) addPair(line, a, b);
for (const e of expressPairs) addPair(e.line, e.a, e.b);

console.log(`Track geometry for ${pairs.size} station pairs...`);
const snapCache = new Map<string, Snap[]>();
const linePos = (line: string, sid: string): [number, number] => {
  const st = stations.get(sid)!;
  const m = st.members.find((x) => x.line === line) ?? st.members[0];
  return [m.x, m.y];
};
const snapOn = (gid: string, g: Graph, line: string, sid: string) => {
  const k = `${gid}|${line}|${sid}`;
  if (!snapCache.has(k)) {
    const [x, y] = linePos(line, sid);
    snapCache.set(k, snapCandidates(g, x, y, 350));
  }
  return snapCache.get(k)!;
};

const segments: SegmentDef[] = [];
const fallbackList: string[] = [];
for (const p of pairs.values()) {
  // One geometry per line group that runs over this pair on its own tracks (e.g. line 1 and GJ between the same stations).
  const byGeom: { pts: Flat; el: number[]; lines: string[] }[] = [];
  for (const line of p.lines) {
    const [ax, ay] = linePos(line, p.a);
    const [bx, by] = linePos(line, p.b);
    const straight = Math.hypot(bx - ax, by - ay);
    let path: Path | null = null;
    for (const [gid, g] of [[line, graphs.get(line)!], ['all', all]] as [string, Graph][]) {
      const As = snapOn(gid, g, line, p.a), Bs = snapOn(gid, g, line, p.b);
      if (!As.length || !Bs.length) continue;
      const found = shortestPath(g, As, Bs);
      if (found && found.len <= 2.2 * straight + 500) {
        path = found;
        break;
      }
    }
    let pts: Flat, el: number[];
    if (path) {
      ({ pts, el } = finishPath(path));
      const S0 = stations.get(p.a)!, S1 = stations.get(p.b)!;
      if (Math.hypot(pts[0] - S0.x, pts[1] - S0.y) > 150) {
        pts.unshift(Math.round(ax * 10) / 10, Math.round(ay * 10) / 10);
        el.unshift(el[0]);
      }
      if (Math.hypot(pts[pts.length - 2] - S1.x, pts[pts.length - 1] - S1.y) > 150) {
        pts.push(Math.round(bx * 10) / 10, Math.round(by * 10) / 10);
        el.push(el[el.length - 1]);
      }
    } else {
      fallbackList.push(`${line}: ${p.a} – ${p.b}`);
      pts = roundFlat(douglasPeucker(curve(null, [ax, ay], [bx, by], null), 2));
      el = new Array(pts.length / 2).fill(line === '1' || line === 'gyeongui-jungang' || line === 'gyeongchun' ? 0 : -1);
    }
    pairLen.set(`${line}|${pk(p.a, p.b)}`, flatLength(pts));
    const same = byGeom.find((g) => similar(g.pts, pts));
    if (same) same.lines.push(line);
    else byGeom.push({ pts, el, lines: [line] });
  }
  for (const g of byGeom) {
    const seg: SegmentDef = { from: p.a, to: p.b, lines: g.lines.sort(), pts: g.pts };
    if (g.el.some((v) => v !== 0)) seg.el = g.el;
    segments.push(seg);
  }
}
console.log(`  ${segments.length} segments, ${fallbackList.length} fallback curves`);
for (const f of fallbackList) console.log(`    fallback ${f}`);

function similar(a: Flat, b: Flat) {
  const at = (p: Flat, f: number) => {
    const c = [0];
    for (let i = 2; i < p.length; i += 2) c.push(c[c.length - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]));
    const target = f * c[c.length - 1];
    let j = 0;
    while (j < c.length - 2 && c[j + 1] < target) j++;
    const t = c[j + 1] > c[j] ? (target - c[j]) / (c[j + 1] - c[j]) : 0;
    return [p[2 * j] + t * (p[2 * j + 2] - p[2 * j]), p[2 * j + 1] + t * (p[2 * j + 3] - p[2 * j + 1])];
  };
  let sum = 0;
  for (let k = 0; k <= 10; k++) {
    const [ax, ay] = at(a, k / 10), [bx, by] = at(b, k / 10);
    sum += Math.hypot(ax - bx, ay - by);
  }
  return sum / 11 < 30;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const stationList = [...stations.values()].sort((a, b) => a.id.localeCompare(b.id));
const sidx = new Map(stationList.map((s, i) => [s.id, i]));
const enc = (s: string) => (s.startsWith('~') ? s : sidx.get(s)!);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const lineDefs: LineDef[] = LINES.map((l) => ({
  id: l.id,
  system: l.system,
  name: l.name,
  nameLocal: l.nameLocal,
  short: l.short,
  color: l.color,
  textColor: luminance(l.color) > 0.62 ? '#1A1A1A' : '#FFFFFF',
  kind: l.kind,
  bullet: l.bullet,
  stock: l.stock,
}));
const stationDefs: StationDef[] = stationList.map((st) => ({
  id: st.id,
  name: nameFor(st.key)[0],
  nameLocal: nameFor(st.key)[1],
  x: Math.round(st.x * 10) / 10,
  y: Math.round(st.y * 10) / 10,
  lines: [...st.lines].sort((a, b) => LINES.findIndex((l) => l.id === a) - LINES.findIndex((l) => l.id === b)),
}));
const transit: TransitData = {
  city: 'seoul',
  built: new Date().toISOString().slice(0, 10),
  attribution: ['© OpenStreetMap contributors', 'Timetables: Seoul Metro (data.go.kr)', 'Realtime: Seoul Open Data Plaza (서울 열린데이터 광장)'],
  // Realtime only when the build runs with the key the deployment uses (SEOUL_API_KEY); otherwise timetables.
  systems: SYSTEMS.map((sys) => ({ ...sys, live: process.env.SEOUL_API_KEY ? ('realtime' as const) : ('scheduled' as const) })),
  lines: lineDefs,
  stations: stationDefs,
  segments,
};

const runSec = (line: SeoulLine, a: string, b: string) => {
  const tt = ttRuns.get(`${line.id}|${pk(a, b)}`);
  if (tt && tt.length >= 3) return median(tt);
  const len = pairLen.get(`${line.id}|${pk(a, b)}`) ?? dist(a, b) * 1.15;
  return runTime(len, line);
};

const netLines: Record<string, NetLine> = {};
for (const line of LINES) {
  const index: Record<string, number> = {};
  for (const ls of lineStations.values()) if (ls.line === line.id && ls.station) index[ls.name] = sidx.get(ls.station)!;
  const vs: NetVariant[] = variants
    .filter((v) => v.line === line.id && !v.express && v.seq.some((s) => !s.startsWith('~')))
    .map((v) => ({ seq: v.seq.map(enc), ...(v.loop ? { loop: true } : {}), ...(v.ud !== undefined ? { ud: v.ud } : {}) }));
  const run: Record<string, number> = {};
  for (const [a, ns] of adj.get(line.id) ?? []) for (const b of ns) if (a < b) run[`${sidx.get(a)}>${sidx.get(b)}`] = runSec(line, a, b);
  for (const e of expressPairs) if (e.line === line.id) run[`${sidx.get(e.a < e.b ? e.a : e.b)}>${sidx.get(e.a < e.b ? e.b : e.a)}`] = runSec(line, e.a, e.b);
  const svc = SERVICE[line.id];
  const patterns: NetPattern[] = resolved
    .filter((r) => r.line === line.id)
    .map((r) => {
      // Offsets [a0, d0, a1, d1, ...] from the start; pass stations get a = d.
      const t: number[] = [0, 0];
      let last = 0;
      for (let i = 1; i < r.seq.length; i++) {
        if (!r.stop[i]) continue;
        const prev = r.seq[last];
        const hop = runSec(line, prev, r.seq[i]);
        const a = t[2 * last + 1] + hop;
        for (let k = last + 1; k < i; k++) {
          const f = (k - last) / (i - last);
          t.push(Math.round(t[2 * last + 1] + f * hop), Math.round(t[2 * last + 1] + f * hop));
        }
        const dwell = i === r.seq.length - 1 || r.conf.nonstop ? 0 : line.dwell + (stations.get(r.seq[i])!.lines.size > 2 ? 10 : 0);
        t.push(a, a + dwell);
        last = i;
      }
      return {
        id: r.id,
        st: r.seq.map((s) => sidx.get(s)!),
        ...(r.stop.every(Boolean) ? {} : { stop: r.stop.map((x) => (x ? 1 : 0)) }),
        t,
        dest: r.dest,
        share: r.conf.share,
        group: r.group,
        ...(r.conf.express ? { express: true } : {}),
        ...(r.loop ? { loop: true } : {}),
      };
    });
  // Stations that only short trains serve tell the simulation and the tracker how long a train is.
  const shortCars: Record<string, number> = {};
  for (const [name, cars] of Object.entries(SHORT_TRAINS[line.id] ?? {})) {
    const st = stationOf(line.id, normName(name));
    if (st) shortCars[sidx.get(st)!] = cars;
  }
  const ex = expressOf(line.id);
  const idxs = (set: Set<string>) => [...set].map((st) => sidx.get(st)!).sort((a, b) => a - b);
  netLines[line.id] = {
    index,
    variants: vs,
    run,
    ...(ex.size ? { express: Object.fromEntries([...ex].map(([k, v]) => [k, { stops: idxs(v.stops), cover: idxs(v.cover) }])) } : {}),
    ...(resolved.some((r) => r.line === line.id && r.conf.nonstop) ? { nonstop: true } : {}),
    ...(Object.keys(shortCars).length ? { shortCars } : {}),
    service: svc ? { wd: svc.wd, we: svc.we } : { wd: { first: 0, last: 0, hw: [] }, we: { first: 0, last: 0, hw: [] } },
    ...(svc?.groups ? { groupService: svc.groups } : {}),
    patterns,
  };
}
// Terminal names used anywhere, for destination display.
names['내선순환'] = ['Inner Circle', '내선순환'];
names['외선순환'] = ['Outer Circle', '외선순환'];
for (const v of variants) for (const s of v.seq) nameFor(keyOf(s));
for (const r of resolved) nameFor(r.dest);
for (const t of ttTrips) nameFor(t.dest);
for (const k of Object.keys(TERMINAL_ALIAS)) nameFor(k);

const network: NetworkData = {
  built: transit.built,
  stations: stationList.map((s) => s.id),
  names,
  lines: netLines,
};

// Timetable trips: [day, ud, express, code, dest, stations, delta-encoded times], sorted by start.
const timetable: TimetableData = { built: transit.built, lines: {} };
for (const t of [...ttTrips].sort((a, b) => a.times[0] - b.times[0])) {
  (timetable.lines[t.line] ??= []).push([
    t.day,
    t.ud,
    t.express ? 1 : 0,
    t.code,
    t.dest,
    t.seq.map((st) => sidx.get(st)!),
    t.times.map((v, i) => (i ? v - t.times[i - 1] : v)),
  ]);
}
const ttJson = JSON.stringify(timetable);
writeFileSync(join(ROOT, 'server/data/seoul/timetable.json'), ttJson);

const out = join(ROOT, 'public/data/seoul/transit.json');
mkdirSync(dirname(out), { recursive: true });
const transitJson = JSON.stringify(transit);
writeFileSync(out, transitJson);
const netOut = join(ROOT, 'server/data/seoul/network.json');
mkdirSync(dirname(netOut), { recursive: true });
const netJson = JSON.stringify(network);
writeFileSync(netOut, netJson);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

let maxEnd = 0, maxEndAt = '';
for (const seg of segments) {
  const n = seg.pts.length;
  for (const [sid, x, y] of [[seg.from, seg.pts[0], seg.pts[1]], [seg.to, seg.pts[n - 2], seg.pts[n - 1]]] as const) {
    const st = stations.get(sid)!;
    const d = Math.hypot(st.x - x, st.y - y);
    if (d > maxEnd) (maxEnd = d), (maxEndAt = `${seg.lines.join('/')} ${seg.from}–${seg.to}`);
  }
}
let maxMember = 0, maxMemberAt = '';
const farMembers: string[] = [];
for (const st of stations.values()) for (const m of st.members) {
  const d = Math.hypot(m.x - st.x, m.y - st.y);
  if (d > 130) farMembers.push(`${st.id}/${m.line} ${d.toFixed(0)} m`);
  if (d > maxMember) (maxMember = d), (maxMemberAt = `${st.id} (${m.line})`);
}
if (farMembers.length) console.log(`platforms > 130 m from their station: ${farMembers.join(', ')}`);
const km = segments.reduce((s, sg) => s + flatLength(sg.pts), 0) / 1000;
console.log(`stations ${stationDefs.length}, segments ${segments.length} (${km.toFixed(0)} km), variants ${variants.length}, patterns ${resolved.length}`);
console.log(`max segment end-to-station ${maxEnd.toFixed(0)} m (${maxEndAt}); max line platform to station ${maxMember.toFixed(0)} m (${maxMemberAt})`);
console.log(`transit.json ${(transitJson.length / 1e6).toFixed(2)} MB, network.json ${(netJson.length / 1e6).toFixed(2)} MB, timetable.json ${(ttJson.length / 1e6).toFixed(2)} MB`);
for (const line of LINES) {
  const pats = resolved.filter((r) => r.line === line.id);
  const n = [...lineStations.values()].filter((ls) => ls.line === line.id).length;
  const loopMin = pats.map((r) => {
    const t = netLines[line.id].patterns.find((p) => p.id === r.id)!.t;
    return `${stations.get(r.seq[0])!.key}→${stations.get(r.seq[r.seq.length - 1])!.key} ${r.seq.length}st ${(t[t.length - 1] / 60).toFixed(0)}min`;
  });
  console.log(`  ${line.id.padEnd(16)} ${String(n).padStart(3)} stations · ${loopMin.join(' · ')}`);
}
