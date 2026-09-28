import { readJson } from '../../data.ts';
import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import { serviceDay } from './calendar.ts';
import { chooseStock } from './lines.ts';
import { network, shortCars } from './network.ts';
import { MAX_STOPS } from './sim.ts';

/** [day (0 weekday, 1 Saturday, 2 Sunday/holiday), ud, express, train code, terminal, stations, delta-encoded [a0, d0, ...]]. */
export type TimetableTrip = [number, 0 | 1, 0 | 1, string, string, number[], number[]];

export interface TimetableData {
  built: string;
  lines: Record<string, TimetableTrip[]>;
}

interface Trip {
  line: string;
  ud: 0 | 1;
  express: boolean;
  code: string;
  dest: string;
  st: number[];
  times: number[]; // [a0, d0, ...] seconds after the service day's midnight
}

const TERMINAL_DWELL = 40;

/** Seoul Metro's official timetable for lines 1–9 (inside the map), as simulated trains. */
export class Timetable {
  private byLineDay = new Map<string, Trip[]>();

  constructor(data: TimetableData) {
    for (const [line, trips] of Object.entries(data.lines)) {
      for (const [day, ud, express, code, dest, st, t] of trips) {
        const times: number[] = [];
        t.forEach((v, i) => times.push(i ? times[i - 1] + v : v));
        const k = `${line}|${day}`;
        if (!this.byLineDay.has(k)) this.byLineDay.set(k, []);
        this.byLineDay.get(k)!.push({ line, ud, express: !!express, code, dest, st, times });
      }
    }
  }

  static load(): Timetable {
    return new Timetable(readJson<TimetableData>('server/data/seoul/timetable.json'));
  }

  has(line: string) {
    return this.byLineDay.has(`${line}|0`);
  }

  simulate(lines: Iterable<string>, nowSec: number): TrainState[] {
    const out: TrainState[] = [];
    for (const line of lines) {
      for (const back of [0, 1]) {
        const day = serviceDay(nowSec, back);
        const t = nowSec - day.base;
        for (const trip of this.byLineDay.get(`${line}|${day.timetable}`) ?? []) {
          if (trip.times[0] > t) break; // sorted by start
          if (trip.times[trip.times.length - 1] + TERMINAL_DWELL < t) continue;
          out.push(this.state(trip, day.base, day.date, nowSec));
        }
      }
    }
    return out;
  }

  private state(trip: Trip, base: number, date: string, nowSec: number): TrainState {
    const net = network();
    const n = trip.st.length;
    let i = 0;
    while (i + 1 < n && base + trip.times[2 * (i + 1)] <= nowSec) i++;
    const stops: TimelineStop[] = [];
    for (let j = i; j < n && stops.length < MAX_STOPS; j++) {
      stops.push({ s: net.stations[trip.st[j]], a: base + trip.times[2 * j], d: base + trip.times[2 * j + 1] + (j === n - 1 ? TERMINAL_DWELL : 0) });
    }
    const id = `${trip.line}.${trip.code}.${date.slice(5)}.${Math.round(trip.times[0] / 60)}`;
    const [dest, destLocal] = net.names[trip.dest] ?? [trip.dest, trip.dest];
    const { stock, cars } = chooseStock(trip.line, id, { express: trip.express, code: trip.code });
    const loop = trip.line === '2' && !shortCars(net.lines['2'], trip.st);
    return {
      id,
      line: trip.line,
      dest,
      destLocal,
      service: trip.express ? 'Express' : undefined,
      serviceLocal: trip.express ? '급행' : undefined,
      dir: loop ? (trip.ud ? 'Outer Circle' : 'Inner Circle') : trip.ud ? 'Down line' : 'Up line',
      stock,
      cars: shortCars(net.lines[trip.line], trip.st) ?? cars,
      live: false,
      label: trip.code,
      stops,
    };
  }
}

let shared: Timetable | undefined;
export const timetable = () => (shared ??= Timetable.load());
