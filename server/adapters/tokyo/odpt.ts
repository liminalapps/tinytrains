import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import { LINE_BY_RAILWAY, canonStation, chooseStock, ownerFromNumber, ownerFromOdpt } from './lines.ts';
import { MAX_STOPS, normalizeNumber, type Schedule, type Trip } from './schedule.ts';

/** odpt:Train (ODPT API v4). Only the fields we use; everything is optional because feeds vary. */
export interface OdptTrain {
  'dc:date'?: string;
  'dct:valid'?: string;
  'owl:sameAs'?: string;
  'odpt:railway'?: string;
  'odpt:trainNumber'?: string;
  'odpt:trainType'?: string;
  'odpt:fromStation'?: string | null;
  'odpt:toStation'?: string | null;
  'odpt:railDirection'?: string;
  'odpt:originStation'?: string[] | null;
  'odpt:destinationStation'?: string[] | null;
  'odpt:delay'?: number;
  'odpt:trainOwner'?: string;
  'odpt:carComposition'?: number;
}

interface PlanStop {
  s: string;
  a: number; // scheduled (or synthesized) epoch seconds, before the delay shift
  d: number;
  stop: boolean; // false for stations an express passes
  ti: number; // index in the trip, -1 if none
}

interface Plan {
  key: string;
  stops: PlanStop[];
  trip?: Trip;
}

interface Track {
  plan: Plan;
  delta: number; // seconds the train runs behind the plan
  state: string;
  idx: number; // plan index of the station the train is at or last passed
  obs: number;
  seen: number;
}

const strip = (v: unknown, prefix: string) => (typeof v === 'string' && v.startsWith(prefix) ? v.slice(prefix.length) : undefined);
const DWELL = 25;

export class OdptTracker {
  private tracks = new Map<string, Track>();

  constructor(private schedule: Schedule) {}

  /** Turn one odpt:Train snapshot into timelines. Returns the lines that had any train in the feed. */
  update(raw: OdptTrain[], nowSec: number, lines: Set<string>): { trains: TrainState[]; liveLines: Set<string> } {
    const trains: TrainState[] = [];
    const liveLines = new Set<string>();
    for (const t of raw) {
      const railway = strip(t['odpt:railway'], 'odpt.Railway:');
      const conf = railway ? LINE_BY_RAILWAY.get(railway) : undefined;
      if (!railway || !conf || !lines.has(conf.id)) continue;
      liveLines.add(conf.id);
      try {
        const state = this.one(t, railway, conf.id, nowSec);
        if (state) trains.push(state);
      } catch (err) {
        console.warn(`[tokyo] skipped ${t['odpt:trainNumber']}: ${err instanceof Error ? err.message : err}`);
      }
    }
    for (const [id, tr] of this.tracks) if (nowSec - tr.seen > 600) this.tracks.delete(id);
    return { trains, liveLines };
  }

  private one(t: OdptTrain, railway: string, line: string, nowSec: number): TrainState | undefined {
    const number = t['odpt:trainNumber'];
    const fromRaw = strip(t['odpt:fromStation'], 'odpt.Station:');
    if (!number || !fromRaw) return undefined;
    const from = canonStation(fromRaw);
    const toRaw = strip(t['odpt:toStation'], 'odpt.Station:');
    const to = toRaw ? canonStation(toRaw) : null;
    const sched = this.schedule;
    if (!sched.stationSet.has(from) || (to && !sched.stationSet.has(to))) return undefined;

    const id = `${railway}.${normalizeNumber(number)}`;
    const date = Date.parse(t['dc:date'] ?? '') / 1000;
    const obs = Number.isFinite(date) && date <= nowSec + 5 && date > nowSec - 300 ? Math.min(date, nowSec) : nowSec;
    const stateKey = `${from}>${to ?? ''}`;
    const feedDelay = typeof t['odpt:delay'] === 'number' && Number.isFinite(t['odpt:delay']) ? t['odpt:delay'] : undefined;

    const match = sched.findTrip(railway, number, line, obs);
    const planKey = match ? `${match.trip.id}@${match.base}` : 'fallback';
    let tr = this.tracks.get(id);
    let idx = tr && tr.plan.key === planKey ? locate(tr.plan, from, to, tr.idx) : -1;
    if (!tr || idx < 0) {
      let plan: Plan | undefined = match ? this.planFromTrip(match.trip, match.base) : undefined;
      idx = plan ? locate(plan, from, to, -1, obs - (feedDelay ?? 0)) : -1;
      if (idx < 0) {
        const dest = strip(t['odpt:destinationStation']?.[0], 'odpt.Station:');
        plan = this.fallbackPlan(line, from, to, strip(t['odpt:railDirection'], 'odpt.RailDirection:'), dest && canonStation(dest), obs);
        idx = plan ? locate(plan, from, to, -1) : -1;
      }
      if (!plan || idx < 0) return undefined;
      tr = { plan, delta: plan.key === 'fallback' ? 0 : (feedDelay ?? 0), state: '', idx, obs, seen: nowSec };
      this.tracks.set(id, tr);
    }

    // Keep the previous delay unless the observed state rules it out; then move it as little as possible.
    const P = tr.plan.stops;
    let lo: number, hi: number;
    if (to === null) {
      lo = obs - P[idx].d + 15;
      hi = Math.max(lo, obs - P[idx].a);
    } else {
      // Departed `from`; may already be standing at `to` (the feed lags arrivals), but not beyond it.
      const m = Math.min(10, 0.2 * (P[idx + 1].a - P[idx].d));
      lo = obs - P[idx + 1].d + 5;
      hi = Math.max(lo, obs - P[idx].d - m);
    }
    if (tr.state && tr.state !== stateKey && obs > tr.obs) {
      // The train reached `from` (arrived or passed) since the last observation.
      const tlo = tr.obs - P[idx].d;
      const thi = obs - P[idx].a;
      const nlo = Math.max(lo, tlo), nhi = Math.min(hi, thi);
      if (nlo <= nhi) (lo = nlo), (hi = nhi);
    }
    tr.delta = Math.min(hi, Math.max(lo, tr.delta));
    tr.state = stateKey;
    tr.idx = idx;
    tr.obs = obs;
    tr.seen = nowSec;

    let k = idx;
    while (k > 0 && !P[k].stop) k--;
    const stops: TimelineStop[] = [];
    for (let j = k; j < P.length && stops.length < MAX_STOPS; j++) {
      if (j !== k && !P[j].stop) continue;
      const prev = stops[stops.length - 1];
      const a = Math.max(Math.round(P[j].a + tr.delta), prev ? prev.d : -Infinity);
      stops.push({ s: P[j].s, a, d: Math.max(a, Math.round(P[j].d + tr.delta)) });
    }
    if (k === idx && to === null) stops[0].d = Math.max(stops[0].d, Math.ceil(nowSec) + (stops.length === 1 ? 15 : 1));
    for (let j = 1; j < stops.length; j++) {
      stops[j].a = Math.max(stops[j].a, stops[j - 1].d);
      stops[j].d = Math.max(stops[j].d, stops[j].a);
    }

    return this.describe(t, line, id, number, tr.plan, k, stops, feedDelay);
  }

  private describe(t: OdptTrain, line: string, id: string, number: string, plan: Plan, k: number, stops: TimelineStop[], delay?: number): TrainState {
    const d = this.schedule.data;
    const base = plan.trip ? this.schedule.describe(plan.trip, Math.max(0, plan.stops[k].ti)) : undefined;
    const destId = strip(t['odpt:destinationStation']?.[0], 'odpt.Station:');
    const destName = destId ? (d.names[destId] ?? d.names[canonStation(destId)] ?? [prettyId(destId), '']) : undefined;
    const type = strip(t['odpt:trainType'], 'odpt.TrainType:');
    const dir = strip(t['odpt:railDirection'], 'odpt.RailDirection:');
    const cars = typeof t['odpt:carComposition'] === 'number' ? t['odpt:carComposition'] : undefined;
    const owner = ownerFromOdpt(t['odpt:trainOwner']) ?? ownerFromNumber(line, number);
    const stock =
      owner || !plan.trip
        ? chooseStock({ line, key: id, owner, type, n: number, cars })
        : { stock: plan.trip.stock, cars: cars ?? plan.trip.cars };
    const services = d.lines[line]?.services;
    return {
      id,
      line: plan.trip?.line ?? line,
      dest: destName?.[0] ?? base?.dest ?? '',
      destLocal: destName?.[1] || base?.destLocal,
      service: services ? (type && d.types[type]?.[0]) || base?.service : undefined,
      serviceLocal: services ? (type && d.types[type]?.[1]) || base?.serviceLocal : undefined,
      dir: (dir && d.dirs[dir]?.[0]) || base?.dir,
      stock: stock.stock,
      cars: stock.cars,
      live: true,
      delay,
      label: /^ODPT/.test(number) ? undefined : number,
      stops,
    };
  }

  private planFromTrip(trip: Trip, base: number): Plan {
    const stops: PlanStop[] = [];
    for (let i = 0; i < trip.st.length; i++) {
      if (i > 0) {
        const d0 = base + trip.times[2 * i - 1], a1 = base + trip.times[2 * i];
        for (const m of this.schedule.between(trip.line, trip.st[i - 1], trip.st[i]) ?? []) {
          const at = d0 + (a1 - d0) * m.f;
          stops.push({ s: m.s, a: at, d: at, stop: false, ti: -1 });
        }
      }
      stops.push({ s: trip.st[i], a: base + trip.times[2 * i], d: base + trip.times[2 * i + 1], stop: true, ti: i });
    }
    return { key: `${trip.id}@${base}`, stops, trip };
  }

  /** No timetable match: walk the line from the current station toward the destination with typical run times. */
  private fallbackPlan(line: string, from: string, to: string | null, dir: string | undefined, dest: string | undefined, obs: number): Plan | undefined {
    const sched = this.schedule;
    const L = sched.data.lines[line];
    if (!L) return undefined;
    const path = L.path.map((i) => sched.data.stations[i]);
    const loop = path[0] === path[path.length - 1];
    const fromPos = sched.positions(line, from);
    if (!fromPos.length) return undefined;
    let p0 = fromPos[0];
    let step = 0;
    if (to) {
      for (const p of fromPos) {
        for (const q of sched.positions(line, to)) if (Math.abs(q - p) === 1) (p0 = p), (step = q - p);
      }
      if (!step) return undefined;
    } else if (dir && dir === L.asc) step = 1;
    else if (dir && dir === L.desc) step = -1;
    else {
      const dp = dest ? sched.positions(line, dest)[0] : undefined;
      step = dp !== undefined && dp < p0 ? -1 : 1;
    }
    const idx = [p0];
    for (let cur = p0; idx.length < MAX_STOPS + 2; ) {
      let next = cur + step;
      if (loop && next >= path.length) next = 1;
      if (loop && next < 0) next = path.length - 2;
      if (next < 0 || next >= path.length) break;
      idx.push(next);
      if (path[next] === dest) break;
      cur = next;
    }
    const runTime = (i: number, j: number) =>
      L.run[`${path[i]}>${path[j]}`] ?? L.run[`${path[j]}>${path[i]}`] ?? Math.max(45, Math.abs(L.cum[j] - L.cum[i]) / 9);
    const stops: PlanStop[] = [];
    idx.forEach((pi, n) => {
      if (n === 0) {
        const d = to ? obs - runTime(idx[0], idx[1] ?? idx[0]) / 2 : obs + 20;
        stops.push({ s: path[pi], a: d - DWELL, d, stop: true, ti: -1 });
      } else {
        const a = stops[n - 1].d + runTime(idx[n - 1], pi);
        stops.push({ s: path[pi], a, d: a + (n === idx.length - 1 ? 30 : DWELL), stop: true, ti: -1 });
      }
    });
    return { key: 'fallback', stops };
  }
}

/** Plan index of the reported position, preferring the one nearest the previous index (or scheduled time). */
function locate(plan: Plan, from: string, to: string | null, prevIdx: number, schedTime?: number): number {
  let best = -1, bestScore = Infinity;
  const P = plan.stops;
  for (let i = 0; i < P.length; i++) {
    if (P[i].s !== from || (to !== null && P[i + 1]?.s !== to)) continue;
    let score = 0;
    if (prevIdx >= 0) score = i >= prevIdx ? i - prevIdx : (prevIdx - i) * 10;
    else if (schedTime !== undefined) score = Math.abs(P[i].d - schedTime);
    if (score < bestScore) (best = i), (bestScore = score);
  }
  return best;
}

const prettyId = (id: string) =>
  id
    .split('.')
    .pop()!
    .replace(/([a-z])([A-Z])/g, '$1 $2');
