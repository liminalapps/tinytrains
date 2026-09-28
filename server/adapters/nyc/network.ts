import { readJson } from '../../data.ts';
import { flatLength } from '../../../shared/geo.ts';
import type { TransitData } from '../../../shared/types.ts';

// Static NYC data for the adapter: stations, the segment graph (from transit.json) and the
// schedule index written by scripts/build-nyc.ts.

interface Schedule {
  services: Record<string, { days: string; start: string; end: string; add: string[]; remove: string[] }>;
  seqs: string[][];
  patterns: [number, number[], number[] | null][];
  trips: Record<string, [number, number, string, string][]>;
  runs: Record<string, number>;
  labels: Record<string, [string, string]>;
}

export interface StaticTrip {
  stops: string[];
  arr: number[]; // epoch seconds
  dep: number[];
  exact: boolean;
}

interface Edge {
  to: string;
  len: number;
  lines: string[];
}

/** GTFS route_id -> line id (express variants fold into the base line). */
export const routeLine = (routeId: string) => ({ '6X': '6', '7X': '7', FX: 'F', SS: 'SI' })[routeId] ?? routeId;
export const TRIP_RE = /^(\d{6})_([A-Z0-9]+)\.+([NS])(\w*)$/;


export class Network {
  readonly stations = new Map<string, { name: string; x: number; y: number }>();
  readonly lines = new Set<string>();
  private adj = new Map<string, Edge[]>();
  private sched: Schedule;
  private preds = new Map<string, string>();
  private dayStart = new Map<string, number>();

  constructor() {
    const transit = readJson<TransitData>('public/data/nyc/transit.json');
    this.sched = readJson<Schedule>('server/data/nyc/schedule.json');
    for (const s of transit.stations) this.stations.set(s.id, { name: s.name, x: s.x, y: s.y });
    for (const l of transit.lines) this.lines.add(l.id);
    for (const seg of transit.segments) {
      const len = flatLength(seg.pts);
      this.edge(seg.from, { to: seg.to, len, lines: seg.lines });
      this.edge(seg.to, { to: seg.from, len, lines: seg.lines });
    }
    this.buildPreds();
  }

  private edge(from: string, e: Edge) {
    const list = this.adj.get(from) ?? [];
    list.push(e);
    this.adj.set(from, list);
  }

  /** Most common predecessor of a stop, keyed by line + next stop, any line + next stop, and direction. */
  private buildPreds() {
    const counts = new Map<string, Map<string, number>>();
    const add = (key: string, pred: string) => {
      const m = counts.get(key) ?? new Map<string, number>();
      m.set(pred, (m.get(pred) ?? 0) + 1);
      counts.set(key, m);
    };
    for (const [key, list] of Object.entries(this.sched.trips)) {
      const dir = key.slice(-1);
      for (const [pi, , , route] of list) {
        const seq = this.sched.seqs[this.sched.patterns[pi][0]];
        const line = routeLine(route);
        for (let i = 1; i < seq.length; i++) {
          const next = seq[i + 1] ?? '$';
          add(`L|${line}|${seq[i]}|${next}`, seq[i - 1]);
          add(`A|${seq[i]}|${next}`, seq[i - 1]);
          add(`D|${dir}|${seq[i]}`, seq[i - 1]);
        }
      }
    }
    for (const [key, m] of counts) this.preds.set(key, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }

  /** Station the train most likely came from before `stop`, given the stop after it. */
  predecessor(line: string, dir: string, stop: string, next: string | undefined): string | undefined {
    const n = next ?? '$';
    return this.preds.get(`L|${line}|${stop}|${n}`) ?? this.preds.get(`A|${stop}|${n}`) ?? this.preds.get(`D|${dir}|${stop}`);
  }

  label(station: string, dir: string): string | undefined {
    const l = this.sched.labels[station];
    return l ? l[dir === 'N' ? 0 : 1] : undefined;
  }

  /** Typical scheduled running time between two consecutive stops, in seconds. */
  runTime(a: string, b: string): number {
    const r = this.sched.runs[`${a}|${b}`] ?? this.sched.runs[`${b}|${a}`];
    if (r) return r;
    const e = this.adj.get(a)?.find((x) => x.to === b);
    return e ? e.len / 12 + 20 : 90;
  }

  connected(a: string, b: string): boolean {
    return !!this.adj.get(a)?.some((e) => e.to === b);
  }

  /** Shortest station path a..b over the segment graph (both ends included), preferring the train's line. */
  path(a: string, b: string, line: string, maxHops = 8): string[] | null {
    const sa = this.stations.get(a);
    const sb = this.stations.get(b);
    if (!sa || !sb) return null;
    const limit = Math.hypot(sa.x - sb.x, sa.y - sb.y) * 2.5 + 2000;
    const dist = new Map<string, number>([[a, 0]]);
    const prev = new Map<string, string>();
    const hops = new Map<string, number>([[a, 0]]);
    const open = new Set([a]);
    while (open.size) {
      let cur = '';
      let best = Infinity;
      for (const s of open) {
        const d = dist.get(s)!;
        if (d < best) {
          best = d;
          cur = s;
        }
      }
      open.delete(cur);
      if (cur === b) break;
      if (hops.get(cur)! >= maxHops) continue;
      for (const e of this.adj.get(cur) ?? []) {
        const d = best + e.len * (e.lines.includes(line) ? 1 : 1.3);
        if (d > limit || d >= (dist.get(e.to) ?? Infinity)) continue;
        dist.set(e.to, d);
        prev.set(e.to, cur);
        hops.set(e.to, hops.get(cur)! + 1);
        open.add(e.to);
      }
    }
    if (!prev.has(b)) return null;
    const out = [b];
    while (out[0] !== a) out.unshift(prev.get(out[0])!);
    return out;
  }

  segLength(a: string, b: string): number {
    return this.adj.get(a)?.find((x) => x.to === b)?.len ?? 0;
  }

  /** Track length between two stops, or 1.2x the straight line when they aren't adjacent. */
  distance(a: string, b: string): number {
    const len = this.segLength(a, b);
    if (len) return len;
    const sa = this.stations.get(a);
    const sb = this.stations.get(b);
    return sa && sb ? Math.hypot(sa.x - sb.x, sa.y - sb.y) * 1.2 : 0;
  }

  private activeServices(date: string): string[] {
    const y = Number(date.slice(0, 4));
    const m = Number(date.slice(4, 6));
    const d = Number(date.slice(6, 8));
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    return Object.entries(this.sched.services)
      .filter(([, s]) => s.add.includes(date) || (s.days[dow] === '1' && date >= s.start && date <= s.end && !s.remove.includes(date)))
      .map(([id]) => id);
  }

  /** Epoch seconds of GTFS time 0 ("noon minus 12h") on a service date in New York. */
  serviceDayStart(date: string): number {
    let t = this.dayStart.get(date);
    if (t === undefined) {
      const noon = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)), 12);
      const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
        .formatToParts(new Date(noon))
        .find((p) => p.type === 'timeZoneName')!.value;
      const m = tz.match(/GMT([+-])(\d{2}):(\d{2})/);
      const off = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
      t = noon / 1000 - off * 60 - 12 * 3600;
      this.dayStart.set(date, t);
    }
    return t;
  }

  /**
   * The static trip behind a realtime trip id, if the schedule has it. `exact` means the route, the
   * stopping pattern and the remaining stops all agree, so its times can be compared with the feed's.
   */
  matchTrip(tripId: string, date: string, routeId: string, stops: string[]): StaticTrip | undefined {
    const m = tripId.match(TRIP_RE);
    if (!m) return undefined;
    const base = this.serviceDayStart(date);
    let best: (StaticTrip & { score: number }) | undefined;
    for (const svc of this.activeServices(date)) {
      for (const [pi, t0, suffix, route] of this.sched.trips[`${svc}|${m[1]}_${routeLine(m[2])}.${m[3]}`] ?? []) {
        const [si, arr, dep] = this.sched.patterns[pi];
        const seq = this.sched.seqs[si];
        if (stops.length && !seq.includes(stops[0])) continue;
        let k = 0;
        for (const s of seq) if (s === stops[k]) k++;
        const exact = route === routeId && (!m[4] || suffix === m[4]) && k === stops.length;
        const score = (exact ? 4 : 0) + (route === routeId ? 2 : 0) + (m[4] && suffix === m[4] ? 1 : 0);
        if (best && score <= best.score) continue;
        best = { stops: seq, arr: arr.map((v) => base + t0 + v), dep: (dep ?? arr).map((v) => base + t0 + v), exact, score };
      }
    }
    return best;
  }
}
