import { readJson } from '../../data.ts';
import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import { pickCalendar, serviceDay } from './calendar.ts';

/** Leg of a trip: [first stop index, railway, train number, train type, rail direction, destination station, train name]. */
export type ScheduleLeg = [number, string, string, string, string, string, string];

export interface ScheduleTrip {
  id: string;
  line: string;
  cal: string;
  stock: string;
  cars: number;
  s: number[]; // station indices
  t: number[]; // delta-encoded [a0, d0, a1, d1, ...], seconds after the service day's midnight (JST)
  legs: ScheduleLeg[];
}

export interface ScheduleLine {
  path: number[]; // station indices in railway order (inside the bbox)
  cum: number[]; // track distance along the path, meters
  asc: string; // rail direction id for travel in path order
  desc: string;
  services: boolean; // more than one service type runs on the line
  run: Record<string, number>; // typical run time between adjacent stations 'A>B', seconds
}

export interface ScheduleData {
  built: string;
  stations: string[];
  names: Record<string, [string, string]>;
  types: Record<string, [string, string]>;
  dirs: Record<string, [string, string]>;
  lines: Record<string, ScheduleLine>;
  trips: ScheduleTrip[];
}

export interface Trip {
  id: string;
  line: string;
  cal: string;
  stock: string;
  cars: number;
  st: string[];
  times: number[]; // [a0, d0, ...] seconds after service-day midnight
  legs: ScheduleLeg[];
}

export const MAX_STOPS = 16;

export class Schedule {
  readonly data: ScheduleData;
  readonly byCal = new Map<string, Trip[]>();
  readonly byNumber = new Map<string, Trip>(); // `${cal}|${railway}.${number}`
  readonly lineCals = new Map<string, Set<string>>();
  readonly stationSet: Set<string>;
  private pathPos = new Map<string, Map<string, number[]>>();

  constructor(data: ScheduleData) {
    this.data = data;
    this.stationSet = new Set(data.stations);
    for (const raw of data.trips) {
      const times: number[] = [];
      raw.t.forEach((v, i) => times.push(i ? times[i - 1] + v : v));
      const trip: Trip = { id: raw.id, line: raw.line, cal: raw.cal, stock: raw.stock, cars: raw.cars, st: raw.s.map((i) => data.stations[i]), times, legs: raw.legs };
      const key = `${raw.line}|${raw.cal}`;
      if (!this.byCal.has(key)) this.byCal.set(key, []);
      this.byCal.get(key)!.push(trip);
      for (const leg of raw.legs) this.byNumber.set(`${raw.cal}|${leg[1]}.${normalizeNumber(leg[2])}`, trip);
      if (!this.lineCals.has(raw.line)) this.lineCals.set(raw.line, new Set());
      this.lineCals.get(raw.line)!.add(raw.cal);
    }
    for (const [id, line] of Object.entries(data.lines)) {
      const m = new Map<string, number[]>();
      line.path.forEach((si, i) => {
        const s = data.stations[si];
        if (!m.has(s)) m.set(s, []);
        m.get(s)!.push(i);
      });
      this.pathPos.set(id, m);
    }
  }

  static load(): Schedule {
    return new Schedule(readJson<ScheduleData>('server/data/tokyo/schedule.json'));
  }

  /** Service days that can have trains running at `nowSec`: today and yesterday (after-midnight trips). */
  days(nowSec: number) {
    return [serviceDay(nowSec, 0), serviceDay(nowSec, 1)];
  }

  calendar(line: string, type: Parameters<typeof pickCalendar>[0]) {
    return pickCalendar(type, this.lineCals.get(line) ?? new Set());
  }

  /** Trip by railway + train number for the service day running at `nowSec`. */
  findTrip(railway: string, number: string, line: string, nowSec: number): { trip: Trip; base: number } | undefined {
    for (const day of this.days(nowSec)) {
      const cal = this.calendar(line, day.type);
      const trip = cal && this.byNumber.get(`${cal}|${railway}.${normalizeNumber(number)}`);
      if (trip && nowSec >= day.base + trip.times[0] - 1800 && nowSec <= day.base + trip.times[trip.times.length - 1] + 1800) return { trip, base: day.base };
    }
    return undefined;
  }

  /** Timetable-simulated trains of the given lines at `nowSec`. */
  simulate(lines: Iterable<string>, nowSec: number): TrainState[] {
    const out: TrainState[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      for (const day of this.days(nowSec)) {
        const cal = this.calendar(line, day.type);
        if (!cal) continue;
        const t = nowSec - day.base;
        for (const trip of this.byCal.get(`${line}|${cal}`) ?? []) {
          if (t < trip.times[0] || t > trip.times[trip.times.length - 1] || seen.has(trip.id)) continue;
          seen.add(trip.id);
          out.push(this.tripState(trip, day.base, nowSec));
        }
      }
    }
    return out;
  }

  tripState(trip: Trip, base: number, nowSec: number): TrainState {
    const t = nowSec - base;
    const n = trip.st.length;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (trip.times[2 * mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    const stops: TimelineStop[] = [];
    for (let i = lo; i < Math.min(n, lo + MAX_STOPS); i++) stops.push({ s: trip.st[i], a: base + trip.times[2 * i], d: base + trip.times[2 * i + 1] });
    return { ...this.describe(trip, lo), stops, live: false };
  }

  /** Static train info at stop index k (the leg there decides destination and service). */
  describe(trip: Trip, k: number): Omit<TrainState, 'stops' | 'live'> {
    let leg = trip.legs[0];
    for (const l of trip.legs) if (l[0] <= k) leg = l;
    const [, , number, type, dir, dest, name] = leg;
    const d = this.data;
    const loop = !dest && (dir === 'OuterLoop' || dir === 'InnerLoop');
    const destName = dest ? d.names[dest] : d.dirs[dir];
    return {
      id: trip.id,
      line: trip.line,
      dest: destName?.[0] ?? '',
      destLocal: destName?.[1] || undefined,
      service: d.lines[trip.line]?.services ? d.types[type]?.[0] : undefined,
      serviceLocal: d.lines[trip.line]?.services ? d.types[type]?.[1] || undefined : undefined,
      dir: loop ? (dir === 'OuterLoop' ? 'Clockwise' : 'Counterclockwise') : d.dirs[dir]?.[0],
      stock: trip.stock,
      cars: trip.cars,
      label: name ? `${name} (${number})` : /^ODPT/.test(number) ? undefined : number,
    };
  }

  /** Positions of a station on a line's path (a loop can list a station twice). */
  positions(line: string, station: string): number[] {
    return this.pathPos.get(line)?.get(station) ?? [];
  }

  /**
   * Stations strictly between a and b along a line (for express trains), with their fraction of the track distance.
   * Tries `hint` first, then every other line containing both stations.
   */
  between(hint: string, a: string, b: string): { s: string; f: number }[] | null {
    const order = [hint, ...Object.keys(this.data.lines).filter((l) => l !== hint)];
    for (const line of order) {
      const pa = this.positions(line, a), pb = this.positions(line, b);
      let best: [number, number] | null = null;
      for (const i of pa) for (const j of pb) if (i !== j && (!best || Math.abs(i - j) < Math.abs(best[0] - best[1]))) best = [i, j];
      if (!best) continue;
      const L = this.data.lines[line];
      const [i, j] = best;
      const step = j > i ? 1 : -1;
      const total = Math.abs(L.cum[j] - L.cum[i]) || 1;
      const out: { s: string; f: number }[] = [];
      for (let k = i + step; k !== j; k += step) out.push({ s: this.data.stations[L.path[k]], f: Math.abs(L.cum[k] - L.cum[i]) / total });
      return out;
    }
    return null;
  }
}

/** 'A0917S' and 'A917S' are the same train. */
export const normalizeNumber = (n: string) => n.replace(/^([A-Z]?)0+(?=\d)/, '$1');
