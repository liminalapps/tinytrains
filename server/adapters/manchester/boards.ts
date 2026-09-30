// Metrolink departure boards: TfGM's Metrolinks API (api.tfgm.com, free key) lists the next trams on every platform
// display with destination, minutes to wait, status and Single / Double. The boards carry no tram or trip ids, so on each
// platform the trams heading to one destination are paired, in order, with the timetable trips due there (trams don't
// overtake), and each pairing becomes a predicted time for that trip at that stop.
import { readJson } from '../../data.ts';
import { politeFetch, type GtfsSchedule, type RealtimeSource, type RtStopTime, type RtTrip } from '../gtfs/index.ts';
import type { TransitData } from '../../../shared/types.ts';

const API = 'https://api.tfgm.com/odata/Metrolinks';
const EVERY_MS = 30_000;
const STALE_MS = 3 * 60_000;
/** Largest gap between a board time and a timetable time that can still be the same tram, seconds. */
const MAX_DIFF = 20 * 60;
/** Cost of leaving a board entry unpaired (e.g. an extra tram the timetable lacks), seconds. */
const SKIP = 8 * 60;

export interface BoardTram {
  /** Station index of the platform. */
  station: number;
  /** Station id of the destination. */
  dest: string;
  /** Predicted arrival, epoch seconds. */
  t: number;
  status: 'due' | 'arrived' | 'departing';
  cars?: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\bvia\b.*$/, '')
    .replace(/[^a-z]/g, '');
/** Board spellings that differ from the stop names. */
const ALIASES: Record<string, string> = { airport: 'man:AIR', traffordcentre: 'man:TRC', rochdale: 'man:RIN', mediacity: 'man:MCU', deansgate: 'man:GMX' };

let names: Map<string, string> | undefined;
/** Station id of a board destination name ('Deansgate Castlefield', 'Rochdale Town Centre', 'MediaCityUK'...). */
export function destStation(name: string): string | undefined {
  if (!names) {
    const transit = readJson<TransitData>('public/data/manchester/transit.json');
    names = new Map(transit.stations.map((s) => [norm(s.name), s.id]));
  }
  const n = norm(name);
  return names.get(n) ?? ALIASES[n];
}

/** Station id of a platform ATCO code: 9400ZZMAVIC1 -> man:VIC. */
export function atcoStation(atco: string): string | undefined {
  const m = /^9400ZZMA([A-Z]+)\d*$/.exec(atco);
  return m ? `man:${m[1]}` : undefined;
}

/** Pair the trams on each platform's boards with timetable trips and turn them into realtime trips. */
export function matchBoards(sched: GtfsSchedule, trams: BoardTram[], now: number): RtTrip[] {
  const lines = new Set(sched.lineIndex.values());
  const active = sched.active(now, lines, 1800, 5400);
  const groups = new Map<string, BoardTram[]>();
  for (const b of trams) {
    const k = `${b.station}|${b.dest}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(b);
  }
  type Group = { trip: (typeof active)[number]; stops: Map<number, RtStopTime & { k: number }>; cars?: number; at?: number };
  const byTrip = new Map<string, Group>();
  for (const list of groups.values()) {
    const { station, dest } = list[0];
    const id = sched.data.stations[station];
    const cands: { trip: (typeof active)[number]; k: number; t: number }[] = [];
    for (const trip of active) {
      if (trip.st[trip.st.length - 1] !== dest) continue;
      const k = trip.st.indexOf(id);
      if (k < 0 || k === trip.st.length - 1) continue;
      cands.push({ trip, k, t: trip.times[2 * k] });
    }
    cands.sort((a, b) => a.t - b.t);
    list.sort((a, b) => a.t - b.t);
    for (const [i, j] of pair(list.map((b) => b.t), cands.map((c) => c.t))) {
      const b = list[i], c = cands[j];
      const g: Group = byTrip.get(c.trip.id) ?? { trip: c.trip, stops: new Map() };
      byTrip.set(c.trip.id, g);
      const dwell = Math.max(20, c.trip.times[2 * c.k + 1] - c.trip.times[2 * c.k]);
      const a = b.status === 'departing' ? Math.min(b.t, now) - dwell : b.t;
      g.stops.set(station, { station, a, d: Math.max(a + dwell, b.status === 'arrived' ? now + 10 : a), k: c.k });
      if (b.cars) g.cars = b.cars;
      if (b.status !== 'due' && (g.at == null || c.k < g.at)) g.at = c.k;
    }
  }
  const out: RtTrip[] = [];
  for (const g of byTrip.values()) {
    const stops = [...g.stops.values()].sort((a, b) => a.k - b.k);
    // Keep predictions in running order: a stop may not come before the previous one.
    for (let i = 1; i < stops.length; i++) {
      stops[i].a = Math.max(stops[i].a!, stops[i - 1].d!);
      stops[i].d = Math.max(stops[i].d!, stops[i].a!);
    }
    out.push({
      key: sched.key(g.trip.row),
      date: g.trip.date,
      line: g.trip.line,
      stops: stops.map(({ k: _k, ...s }) => s),
      ...(g.at != null ? { at: { station: sched.stationIndex(g.trip.st[g.at])!, status: 'at' as const } } : {}),
      ...(g.cars ? { stock: 'manchester-m5000', cars: g.cars } : {}),
    });
  }
  return out;
}

/** Order-preserving pairing of two sorted time lists that minimizes the time differences (unpaired entries cost SKIP). */
export function pair(board: number[], sched: number[]): [number, number][] {
  const n = board.length, m = sched.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 skip board, 2 skip timetable, 3 pair
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      if (!i && !j) continue;
      let best = Infinity, mv = 0;
      if (i && cost[i - 1][j] + SKIP < best) (best = cost[i - 1][j] + SKIP), (mv = 1);
      if (j && cost[i][j - 1] < best) (best = cost[i][j - 1]), (mv = 2);
      if (i && j) {
        const diff = Math.abs(board[i - 1] - sched[j - 1]);
        if (diff <= MAX_DIFF && cost[i - 1][j - 1] + diff < best) (best = cost[i - 1][j - 1] + diff), (mv = 3);
      }
      cost[i][j] = best;
      move[i][j] = mv;
    }
  const out: [number, number][] = [];
  for (let i = n, j = m; i || j; ) {
    const mv = move[i][j];
    if (mv === 3) out.push([--i, --j]);
    else if (mv === 1) i--;
    else j--;
  }
  return out.reverse();
}

type Json = Record<string, unknown>;

/** TfGM's Metrolinks API (needs TFGM_KEY): every platform display on the network in one request. */
export function tfgmMetrolinks(key: string): RealtimeSource {
  let trips: RtTrip[] = [];
  let at = 0;
  let last = 0;
  let inflight: Promise<void> | undefined;

  async function load(nowMs: number, sched: GtfsSchedule) {
    try {
      const res = await politeFetch(API, { headers: { 'Ocp-Apim-Subscription-Key': key, accept: 'application/json' } }, { perMinute: 6 });
      const rows = ((await res.json()) as { value?: Json[] }).value ?? [];
      const now = nowMs / 1000;
      const seen = new Set<string>();
      const trams: BoardTram[] = [];
      for (const r of rows) {
        const atco = String(r.AtcoCode ?? '');
        // Several displays show the same platform.
        if (seen.has(atco)) continue;
        seen.add(atco);
        const sid = atcoStation(atco);
        const station = sid ? sched.stationIndex(sid) : undefined;
        if (station == null) continue;
        const updated = Date.parse(String(r.LastUpdated ?? ''));
        const base = Number.isFinite(updated) && Math.abs(updated / 1000 - now) < 600 ? updated / 1000 : now;
        for (let i = 0; i < 4; i++) {
          const dest = destStation(String(r[`Dest${i}`] ?? ''));
          const wait = Number(r[`Wait${i}`]);
          if (!dest || !Number.isFinite(wait) || r[`Wait${i}`] === '') continue;
          const status = String(r[`Status${i}`] ?? '').toLowerCase();
          const cars = r[`Carriages${i}`] === 'Double' ? 2 : r[`Carriages${i}`] === 'Single' ? 1 : undefined;
          trams.push({ station, dest, t: Math.round(base + wait * 60), status: status === 'arrived' ? 'arrived' : status === 'departing' ? 'departing' : 'due', cars });
        }
      }
      if (!trams.length) return;
      trips = matchBoards(sched, trams, now);
      at = nowMs;
    } catch (err) {
      console.warn(`[tfgm-metrolinks] ${err instanceof Error ? err.message : err}`);
    }
  }

  return {
    name: 'TfGM live departures',
    async refresh(nowMs, sched) {
      if (inflight) return inflight;
      if (nowMs - last < EVERY_MS && nowMs >= last) return;
      last = nowMs;
      inflight = load(nowMs, sched).finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      return at && Math.abs(nowMs - at) < STALE_MS && trips.length ? trips : undefined;
    },
  };
}
