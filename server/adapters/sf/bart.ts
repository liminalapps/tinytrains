// BART: GTFS-realtime trip updates for positions, the legacy ETD API for train lengths, and a timetable
// simulation for the (non-realtime) Oakland Airport connector.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type { TrainState } from '../../../shared/types.ts';
import type { Adapter } from '../types.ts';
import { activeTrips, dayBase, loadSchedule, localYmd, memoFor, mergeRealtime, stabilize, windowTimeline, ymdAdd, type RtStop, type TrainMemo } from './schedule.ts';

const RT_URL = 'https://api.bart.gov/gtfsrt/tripupdate.aspx';
// BART's published public key for the legacy API.
const ETD_URL = 'https://api.bart.gov/api/etd.aspx?cmd=etd&orig=ALL&key=MW9S-E7SL-26DU-VV8V&json=y';

const COLORS: Record<string, string> = { 'bart-yellow': 'YELLOW', 'bart-orange': 'ORANGE', 'bart-green': 'GREEN', 'bart-red': 'RED', 'bart-blue': 'BLUE' };
const TYPICAL_CARS: Record<string, number> = { YELLOW: 9, ORANGE: 6, GREEN: 6, RED: 8, BLUE: 6 };

// eBART (Antioch <-> Pittsburg/Bay Point) runs as separate realtime trips that are not in the static feed.
// Run times from BART's timetable; the feed omits the Pittsburg/Bay Point transfer platform.
const EBART_RUN = { ANTC_PCTR: 420, PCTR_PITT: 330 };

interface Estimate {
  station: string; // 'bart:EMBR'
  color: string;
  dir: string; // 'North' | 'South'
  eta: number; // epoch seconds
  cars: number;
}

interface Memo extends TrainMemo {
  cars?: number;
  last?: { train: TrainState; st: string[]; times: number[]; from: number };
}

async function fetchBuffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.split('?')[0]}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchEtd(): Promise<Estimate[]> {
  const res = await fetch(ETD_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`ETD HTTP ${res.status}`);
  const json = (await res.json()) as { root?: { station?: { abbr: string; etd?: { estimate: Record<string, string>[] }[] }[] } };
  const now = Date.now() / 1000;
  const out: Estimate[] = [];
  for (const st of json.root?.station ?? []) {
    for (const e of st.etd ?? []) {
      for (const x of e.estimate ?? []) {
        const min = x.minutes === 'Leaving' ? 0 : Number(x.minutes);
        const cars = Number(x.length);
        if (!Number.isFinite(min) || !(cars > 0) || x.cancelflag === '1') continue;
        out.push({ station: `bart:${st.abbr}`, color: x.color, dir: x.direction, eta: now + min * 60, cars });
      }
    }
  }
  return out;
}

export function bartAdapter(): Adapter {
  const sched = loadSchedule('bart');
  const byTrip = new Map(sched.trips.map((r) => [r[0], r]));
  const memo = new Map<string, Memo>();
  let etd: Estimate[] = [];
  let etdAt = 0;

  /** Consist length from the ETD estimate at one of the next few stations that matches line, direction and time. */
  function carsFor(color: string, dir: string, stops: { s: string; a: number }[], ebart: boolean): number | undefined {
    for (const st of stops.slice(1, 4)) {
      let best: Estimate | undefined;
      for (const e of etd) {
        if (e.station !== st.s || e.color !== color || e.dir !== dir || ebart !== e.cars <= 3) continue;
        const err = Math.abs(e.eta - st.a);
        if (err <= 100 && (!best || err < Math.abs(best.eta - st.a))) best = e;
      }
      if (best) return best.cars;
    }
    return undefined;
  }

  function typicalCars(color: string): number {
    const lens = etd.filter((e) => e.color === color && e.cars > 3).map((e) => e.cars).sort((a, b) => a - b);
    return lens.length ? lens[lens.length >> 1] : TYPICAL_CARS[color] ?? 8;
  }

  async function poll(nowMs: number): Promise<TrainState[]> {
    const now = nowMs / 1000;
    const [buf] = await Promise.all([
      fetchBuffer(RT_URL),
      now - etdAt > 45
        ? fetchEtd().then(
            (list) => ((etd = list), (etdAt = now)),
            (err) => console.warn(`[sf-bart] ETD: ${err instanceof Error ? err.message : err}`),
          )
        : null,
    ]);
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
    const trains: TrainState[] = [];
    const inFeed = new Set<string>();
    const updates = new Map<string, GtfsRealtimeBindings.transit_realtime.ITripUpdate>();
    for (const ent of feed.entity) {
      const id = ent.tripUpdate?.trip?.tripId;
      if (!id) continue;
      const had = updates.get(id);
      if (!had || (ent.tripUpdate!.stopTimeUpdate?.length ?? 0) > (had.stopTimeUpdate?.length ?? 0)) updates.set(id, ent.tripUpdate!);
    }

    for (const tu of updates.values()) {
      const tripId = tu.trip.tripId!;
      if (tu.trip.scheduleRelationship === 3 /* CANCELED */) continue;
      const rt: RtStop[] = [];
      for (const u of tu.stopTimeUpdate ?? []) {
        const station = sched.stopMap[u.stopId ?? ''];
        if (!station || u.scheduleRelationship === 1 /* SKIPPED */) continue;
        const a = Number(u.arrival?.time ?? 0) || undefined;
        const d = Number(u.departure?.time ?? 0) || undefined;
        if (a || d) rt.push({ station, a, d });
      }
      if (!rt.length) continue;
      const row = byTrip.get(tripId);
      const id = `bart:${tripId}`;

      let st: string[], schedAbs: number[], line: string, dir: number, dest: string, ebart = false;
      if (row) {
        const pat = sched.pats[row[2]];
        const tim = sched.tims[row[3]];
        const first = rt.find((u) => pat.st.includes(u.station));
        if (!first) continue;
        const idx = pat.st.indexOf(first.station);
        // Service day of the trip (yesterday's run past midnight): the base that best fits the predictions.
        const implied = (first.a ?? first.d!) - tim[2 * idx] - row[4];
        const today = localYmd(now);
        const base = [-1, 0, 1].map((k) => dayBase(ymdAdd(today, k))).reduce((b, c) => (Math.abs(c - implied) < Math.abs(b - implied) ? c : b));
        st = pat.st;
        schedAbs = tim.map((x) => base + row[4] + x);
        line = pat.line;
        dir = pat.dir;
        dest = sched.heads[row[5]];
      } else if (rt.every((u) => u.station === 'bart:ANTC' || u.station === 'bart:PCTR')) {
        const west = rt[0].station === 'bart:ANTC' || (tu.stopTimeUpdate ?? []).some((u) => u.stopId === 'E20-2');
        st = west ? ['bart:ANTC', 'bart:PCTR', 'bart:PITT'] : ['bart:PITT', 'bart:PCTR', 'bart:ANTC'];
        const runs = west ? [EBART_RUN.ANTC_PCTR, EBART_RUN.PCTR_PITT] : [EBART_RUN.PCTR_PITT, EBART_RUN.ANTC_PCTR];
        schedAbs = [0, 0, runs[0], runs[0] + 30, runs[0] + 30 + runs[1], runs[0] + 90 + runs[1]];
        line = 'bart-yellow';
        dir = west ? 1 : 0;
        dest = west ? 'Pittsburg/Bay Point' : 'Antioch';
        ebart = true;
      } else continue;

      inFeed.add(id);
      const m = memoFor(memo, id, now, st);
      const merged = mergeRealtime(st, schedAbs, rt, m.dep, m.prev?.k);
      if (!merged) continue;
      const stops = stabilize(m, st, merged.times, merged.from, now);
      if (!stops) continue;

      const color = COLORS[line];
      const dirName = dir === 0 ? 'North' : 'South';
      m.cars = carsFor(color, dirName, stops, ebart) ?? m.cars;
      const next = tu.stopTimeUpdate?.find((u) => sched.stopMap[u.stopId ?? ''] === stops[1]?.s);
      const delay = next?.arrival?.delay ?? next?.departure?.delay;
      const train: TrainState = {
        id,
        line,
        dest,
        dir: `${dirName}bound`,
        service: ebart ? 'eBART' : undefined,
        stock: ebart ? 'sf-bart-gtw' : 'sf-bart-fotf',
        cars: m.cars ?? (ebart ? 1 : typicalCars(color)),
        live: true,
        delay: delay == null ? undefined : Number(delay),
        stops,
      };
      m.last = { train, st, times: merged.times, from: m.prev!.k };
      trains.push(train);
    }

    // The feed drops a trip before its final arrival (always for the terminal, and eBART after Pittsburg Center):
    // let such trains coast on their last prediction until they arrive.
    for (const [id, m] of memo) {
      if (inFeed.has(id) || !m.last || now - m.seen > 900) continue;
      const stops = windowTimeline(m.last.st, m.last.times, now, m.last.from);
      if (stops) trains.push({ ...m.last.train, stops });
    }

    // Oakland Airport connector: not in the realtime feed, so it runs on the timetable.
    for (const t of activeTrips(sched, now, 60, 60, (r) => sched.pats[r[2]].line === 'bart-oak')) {
      const stops = windowTimeline(t.pat.st, t.times, now);
      if (!stops) continue;
      trains.push({
        id: `bart:${t.row[0]}`,
        line: 'bart-oak',
        dest: sched.heads[t.row[5]],
        dir: t.pat.dir === 0 ? 'To Coliseum' : 'To Airport',
        stock: 'sf-bart-cable-liner',
        cars: 3,
        live: false,
        stops,
      });
    }

    for (const [id, m] of memo) if (now - m.seen > 900) memo.delete(id);
    return trains;
  }

  return { id: 'sf-bart', city: 'sf', name: 'BART · GTFS-realtime + ETD', live: true, intervalMs: 20_000, poll };
}
