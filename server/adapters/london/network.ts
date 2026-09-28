import { readJson } from '../../data.ts';
import { flatLength } from '../../../shared/geo.ts';
import type { StationDef, TransitData } from '../../../shared/types.ts';


interface LineNet {
  stations: Set<string>;
  routes: string[][];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Static London network: stations, segment lengths and the ordered stopping patterns of every line. */
export class Network {
  stations = new Map<string, StationDef>();
  lines = new Map<string, LineNet>();
  /** Stations where a route is clipped by the map edge. */
  edges: Set<string>;
  private segLen = new Map<string, number>();
  /** "line|a>b" for stations consecutive, in that order, on one of the line's routes. */
  private steps = new Set<string>();
  private cache = new Map<string, unknown>();

  constructor() {
    const transit = readJson<TransitData>('public/data/london/transit.json');
    const data = readJson<{
      routes: Record<string, string[][]>;
      edges: string[];
    }>('server/data/london/routes.json');
    for (const st of transit.stations) this.stations.set(st.id, st);
    for (const sg of transit.segments) this.segLen.set(pairKey(sg.from, sg.to), flatLength(sg.pts));
    for (const [id, routes] of Object.entries(data.routes)) {
      this.lines.set(id, { stations: new Set(routes.flat()), routes });
      for (const r of routes) for (let i = 1; i < r.length; i++) this.steps.add(`${id}|${r[i - 1]}>${r[i]}`);
    }
    this.edges = new Set(data.edges);
  }

  hasSeg(a: string, b: string): boolean {
    return this.segLen.has(pairKey(a, b));
  }

  /** Track length between two consecutive stops, or the straight distance if there is no segment. */
  len(a: string, b: string): number {
    const l = this.segLen.get(pairKey(a, b));
    if (l !== undefined) return l;
    const sa = this.stations.get(a), sb = this.stations.get(b);
    return sa && sb ? Math.hypot(sa.x - sb.x, sa.y - sb.y) * 1.2 : 1000;
  }

  private memo<T>(key: string, fn: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, fn());
    return this.cache.get(key) as T;
  }

  /**
   * Stations directly before `s1` on the line's routes, most common first. With `s2`, only routes
   * that continue from `s1` to `s2`; an empty result then means `s1` is where the trip starts.
   */
  predecessors(line: string, s1: string, s2?: string): string[] {
    return this.memo(`p|${line}|${s1}|${s2}`, () => {
      const c = new Map<string, number>();
      for (const r of this.lines.get(line)?.routes ?? []) {
        for (let i = 1; i < r.length; i++) {
          if (r[i] !== s1) continue;
          if (s2 && !r.slice(i + 1, i + 11).includes(s2)) continue;
          c.set(r[i - 1], (c.get(r[i - 1]) ?? 0) + (s2 && r[i + 1] === s2 ? 2 : 1));
        }
      }
      return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    });
  }

  /** True if no route of the line reaches `s` from an earlier station and then continues to `next`. */
  isOrigin(line: string, s: string, next: string): boolean {
    return !(this.lines.get(line)?.routes ?? []).some((r) => {
      const i = r.indexOf(s);
      return i > 0 && r.indexOf(next, i + 1) > i;
    });
  }

  /** Stations passed between a and b (a before b on some route, no stop in between), or null. [] = direct. */
  bridge(line: string, a: string, b: string): string[] | null {
    if (this.steps.has(`${line}|${a}>${b}`)) return [];
    return this.memo(`b|${line}|${a}|${b}`, () => {
      let best: string[] | null = null;
      for (const r of this.lines.get(line)?.routes ?? []) {
        const i = r.indexOf(a);
        if (i < 0) continue;
        const j = r.indexOf(b, i + 1);
        if (j < 0 || j - i > 10) continue;
        const via = r.slice(i + 1, j);
        if (!best || via.length < best.length) best = via;
      }
      return best;
    });
  }

  /** The next station after `s` on a route of `line` that later reaches `dest`. */
  nextToward(line: string, s: string, dest: string): string | undefined {
    return this.memo(`n|${line}|${s}|${dest}`, () => {
      let best: string | undefined;
      let bestDist = Infinity;
      for (const r of this.lines.get(line)?.routes ?? []) {
        const i = r.indexOf(s);
        if (i < 0 || i + 1 >= r.length) continue;
        const j = r.indexOf(dest, i + 1);
        if (j < 0 || j - i >= bestDist) continue;
        best = r[i + 1];
        bestDist = j - i;
      }
      return best;
    });
  }
}
