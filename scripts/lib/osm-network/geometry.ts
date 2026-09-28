// Track graph from OSM ways: snapping stations onto tracks, shortest paths, simplification (as in build-seoul.ts).
import { flatLength, roundFlat } from '../../../shared/geo.ts';
import type { Flat } from '../../../shared/types.ts';
import type { OsmElement } from './overpass.ts';

export interface Edge {
  a: number;
  b: number;
  len: number;
  el: number;
}

export class Graph {
  xy: number[] = [];
  edges: Edge[] = [];
  adj: number[][] = [];
  private index = new Map<number, number>();

  constructor(private project: (lon: number, lat: number) => [number, number]) {}

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
      const [x0, y0] = this.project(w.geometry![i - 1].lon, w.geometry![i - 1].lat);
      const [x1, y1] = this.project(w.geometry![i].lon, w.geometry![i].lat);
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

export function levelOf(tags: Record<string, string>): number {
  if (tags.bridge && tags.bridge !== 'no') return 1;
  if ((tags.tunnel && tags.tunnel !== 'no') || tags.location === 'underground' || Number(tags.layer) < 0) return -1;
  if (tags.embankment === 'yes' || Number(tags.layer) > 0) return 1;
  return 0;
}

export interface Snap {
  edge: number;
  t: number;
  x: number;
  y: number;
  d: number;
}

export function snapCandidates(g: Graph, x: number, y: number, maxD: number): Snap[] {
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

export interface Path {
  pts: Flat;
  el: number[];
  len: number;
}

/** Shortest path between any start snap and any end snap; each snap costs twice its distance from the station. */
export function shortestPath(g: Graph, As: Snap[], Bs: Snap[]): Path | null {
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

export function douglasPeucker(pts: Flat, tol: number): Flat {
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
export function finishPath(path: Path): { pts: Flat; el: number[] } {
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
export function curve(a: number[] | null, b: number[], c: number[], d: number[] | null): Flat {
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


/** Two polylines that run within ~30 m of each other all along. */
export function similar(a: Flat, b: Flat) {
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
