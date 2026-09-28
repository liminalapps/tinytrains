// Track geometry for the GTFS kit: slicing GTFS shapes between stops, OSM track levels, and shortest paths over OSM
// track where shapes are missing or don't fit (same slicing/level approach as scripts/build-paris.ts).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Flat } from '../../../shared/types.ts';
import { DEBUG, REFRESH, ROOT, UA } from './feed.ts';

export function simplify(pts: Flat, tol: number): Flat {
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

export function cumulative(pts: Flat): number[] {
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  return cum;
}

/**
 * Along-shape positions of each stop, monotonic, minimizing total offset (dynamic programming over the local minima
 * of the distance to the shape). Stops that don't fit come back null.
 */
export function locate(shape: Flat, cum: number[], stops: [number, number][]): ({ s: number; d: number } | null)[] {
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

export function slice(shape: Flat, cum: number[], s0: number, s1: number): Flat {
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

export function reverse(pts: Flat): Flat {
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

/** How far apart two lines between the same stations run: the larger one-sided deviation (overhanging ends ignored). */
export function separation(a: Flat, b: Flat): number {
  const d = Math.max(deviation(a, b), deviation(b, a));
  if (Number.isFinite(d)) return d;
  let worst = 0;
  for (const [x, y] of resample(a, 16)) worst = Math.max(worst, distToLine(x, y, b).d);
  for (const [x, y] of resample(b, 16)) worst = Math.max(worst, distToLine(x, y, a).d);
  return worst;
}

/** Same track: similar length and each line stays close to the other. */
export function similar(a: Flat, b: Flat, tol: number): boolean {
  const la = cumulative(a).at(-1)!, lb = cumulative(b).at(-1)!;
  if (Math.abs(la - lb) > Math.max(120, 0.3 * Math.max(la, lb))) return false;
  return deviation(a, b) < tol && deviation(b, a) < tol;
}

// ---------------------------------------------------------------------------
// OpenStreetMap track: levels and routing
// ---------------------------------------------------------------------------

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const CELL = 100;

interface OsmWay {
  kind: string;
  level: number;
  nodes: number[];
  pts: Flat;
}

export class OsmTrack {
  ways: OsmWay[] = [];
  private grid = new Map<string, [number, number][]>();
  private graphs = new Map<string, Graph>();

  static async load(city: string, bbox: [number, number, number, number], project: (lon: number, lat: number) => [number, number], custom?: string, name = 'osm-track'): Promise<OsmTrack> {
    const file = join(ROOT, '.cache', city, `${name}.json`);
    if (REFRESH || !existsSync(file)) {
      const [W, S, E, N] = bbox;
      const body = custom ?? `way["railway"~"^(subway|rail|light_rail|tram|monorail|funicular|narrow_gauge)$"]["service"!~"^(yard|siding|spur)$"](${S},${W},${N},${E});`;
      const q = `[out:json][timeout:600];${body}out body geom;`;
      let text = '';
      for (const url of [...OVERPASS, ...OVERPASS]) {
        if (text) break;
        console.log(`querying Overpass (${new URL(url).host}) for track`);
        try {
          const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA }, body: `data=${encodeURIComponent(q)}` });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = await res.text();
          // Overpass answers rate limits and timeouts with an XML/HTML page, sometimes with HTTP 200.
          if (!body.trimStart().startsWith('{')) throw new Error(`not JSON: ${body.slice(0, 120).replace(/\s+/g, ' ')}`);
          const parsed = JSON.parse(body) as { elements?: unknown[]; remark?: string };
          if (!Array.isArray(parsed.elements) || /error/i.test(parsed.remark ?? '')) throw new Error(`Overpass: ${parsed.remark ?? 'no elements'}`);
          text = body;
          break;
        } catch (err) {
          console.warn(`Overpass failed: ${err instanceof Error ? err.message : err}`);
          await new Promise((r) => setTimeout(r, 15_000));
        }
      }
      if (!text) throw new Error('Overpass unavailable; retry later or pass geometry: { levels: false }');
      writeFileSync(file, text);
    }
    const json = JSON.parse(readFileSync(file, 'utf8')) as { elements: { type: string; tags?: Record<string, string>; nodes?: number[]; geometry?: { lat: number; lon: number }[] }[] };
    const t = new OsmTrack();
    for (const e of json.elements) {
      const tags = e.tags ?? {};
      if (e.type !== 'way' || !e.geometry || tags.tunnel === 'building_passage') continue;
      const level = tags.tunnel && tags.tunnel !== 'no' ? -1 : tags.bridge && tags.bridge !== 'no' ? 1 : Number(tags.layer ?? 0) < 0 ? -1 : 0;
      t.ways.push({ kind: tags.railway, level, nodes: e.nodes ?? [], pts: e.geometry.flatMap((g) => project(g.lon, g.lat)) });
    }
    t.ways.forEach((w, wi) => {
      for (let i = 0; i + 3 < w.pts.length; i += 2) {
        const x0 = Math.floor(Math.min(w.pts[i], w.pts[i + 2]) / CELL), x1 = Math.floor(Math.max(w.pts[i], w.pts[i + 2]) / CELL);
        const y0 = Math.floor(Math.min(w.pts[i + 1], w.pts[i + 3]) / CELL), y1 = Math.floor(Math.max(w.pts[i + 1], w.pts[i + 3]) / CELL);
        for (let cx = x0; cx <= x1; cx++)
          for (let cy = y0; cy <= y1; cy++) {
            const k = `${cx},${cy}`;
            const list = t.grid.get(k) ?? [];
            t.grid.set(k, list);
            list.push([wi, i]);
          }
      }
    });
    console.log(`OSM track: ${t.ways.length} ways`);
    return t;
  }

  /** Nearest track segment of the given kinds within `max` m: way index, vertex index, point and distance. */
  nearest(x: number, y: number, kinds: Set<string>, max: number) {
    let best: { wi: number; i: number; t: number; x: number; y: number; d: number } | null = null;
    const r = Math.ceil(max / CELL);
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++)
        for (const [wi, i] of this.grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          const w = this.ways[wi];
          if (!kinds.has(w.kind)) continue;
          const ax = w.pts[i], ay = w.pts[i + 1], ex = w.pts[i + 2] - ax, ey = w.pts[i + 3] - ay, len2 = ex * ex + ey * ey;
          const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0;
          const px = ax + t * ex, py = ay + t * ey;
          const d = Math.hypot(x - px, y - py);
          if (d <= max && (!best || d < best.d)) best = { wi, i, t, x: px, y: py, d };
        }
    return best;
  }

  levelAt(x: number, y: number, kinds: Set<string>): number | null {
    const n = this.nearest(x, y, kinds, 25);
    return n ? this.ways[n.wi].level : null;
  }

  /** Densify, classify each point's level, drop blips under 40 m, then simplify each constant-level run separately. */
  withLevels(raw: Flat, kinds: Set<string>): { pts: Flat; el: number[] } {
    const dense: Flat = [raw[0], raw[1]];
    for (let i = 2; i < raw.length; i += 2) {
      const n = Math.ceil(Math.hypot(raw[i] - raw[i - 2], raw[i + 1] - raw[i - 1]) / 8);
      for (let k = 1; k <= n; k++) dense.push(raw[i - 2] + ((raw[i] - raw[i - 2]) * k) / n, raw[i - 1] + ((raw[i + 1] - raw[i - 1]) * k) / n);
    }
    const m = dense.length / 2;
    const lv: (number | null)[] = [];
    for (let i = 0; i < m; i++) lv.push(this.levelAt(dense[2 * i], dense[2 * i + 1], kinds));
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

  /** Shortest path along OSM track of the given kinds between two points (snapped within `snap` m), or null. */
  route(a: [number, number], b: [number, number], kinds: Set<string>, snap: number): Flat | null {
    const key = [...kinds].sort().join(',');
    let g = this.graphs.get(key);
    if (!g) this.graphs.set(key, (g = new Graph(this.ways.filter((w) => kinds.has(w.kind)))));
    const sa = this.nearest(a[0], a[1], kinds, snap), sb = this.nearest(b[0], b[1], kinds, snap);
    if (!sa || !sb) return null;
    const straight = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const path = g.path(this.ways[sa.wi], sa.i / 2, [sa.x, sa.y], this.ways[sb.wi], sb.i / 2, [sb.x, sb.y], straight * 3 + 2000);
    return path;
  }
}

/** Track graph over OSM nodes; ways connect where they share node ids. */
class Graph {
  private adj = new Map<number, { to: number; w: number }[]>();
  private xy = new Map<number, [number, number]>();

  constructor(ways: OsmWay[]) {
    for (const w of ways) {
      for (let i = 0; i < w.nodes.length; i++) {
        this.xy.set(w.nodes[i], [w.pts[2 * i], w.pts[2 * i + 1]]);
        if (i === 0) continue;
        const u = w.nodes[i - 1], v = w.nodes[i];
        const d = Math.hypot(w.pts[2 * i] - w.pts[2 * i - 2], w.pts[2 * i + 1] - w.pts[2 * i - 1]);
        (this.adj.get(u) ?? this.adj.set(u, []).get(u)!).push({ to: v, w: d });
        (this.adj.get(v) ?? this.adj.set(v, []).get(v)!).push({ to: u, w: d });
      }
    }
  }

  /** A* from a point on way A's segment ia to a point on way B's segment ib. */
  path(wa: OsmWay, ia: number, pa: [number, number], wb: OsmWay, ib: number, pb: [number, number], limit: number): Flat | null {
    if (wa === wb && ia === ib) return [...pa, ...pb];
    const START = -1, GOAL = -2;
    const start: { to: number; w: number }[] = [];
    for (const k of [ia, ia + 1]) {
      const n = wa.nodes[k];
      if (n == null) continue;
      start.push({ to: n, w: Math.hypot(wa.pts[2 * k] - pa[0], wa.pts[2 * k + 1] - pa[1]) });
    }
    const goalEdges = new Map<number, number>();
    for (const k of [ib, ib + 1]) {
      const n = wb.nodes[k];
      if (n != null) goalEdges.set(n, Math.hypot(wb.pts[2 * k] - pb[0], wb.pts[2 * k + 1] - pb[1]));
    }
    const h = (n: number) => {
      const p = this.xy.get(n)!;
      return Math.hypot(p[0] - pb[0], p[1] - pb[1]);
    };
    const dist = new Map<number, number>([[START, 0]]);
    const prev = new Map<number, number>();
    const open: [number, number][] = []; // binary heap of [f, node]
    const push = (f: number, n: number) => {
      open.push([f, n]);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p][0] <= open[i][0]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    const relax = (from: number, to: number, w: number) => {
      const nd = dist.get(from)! + w;
      if (nd > limit || nd >= (dist.get(to) ?? Infinity)) return;
      dist.set(to, nd);
      prev.set(to, from);
      push(nd + (to === GOAL ? 0 : h(to)), to);
    };
    for (const e of start) relax(START, e.to, e.w);
    while (open.length) {
      const [, n] = pop();
      if (n === GOAL) break;
      const g = goalEdges.get(n);
      if (g != null) relax(n, GOAL, g);
      for (const e of this.adj.get(n) ?? []) relax(n, e.to, e.w);
    }
    if (!prev.has(GOAL)) return null;
    const nodes: number[] = [];
    for (let n = prev.get(GOAL)!; n !== START; n = prev.get(n)!) nodes.push(n);
    nodes.reverse();
    const out: Flat = [...pa];
    for (const n of nodes) out.push(...this.xy.get(n)!);
    out.push(...pb);
    return out;
  }
}

export function debug(msg: string) {
  if (DEBUG) console.log(msg);
}
