// Wiener Linien realtime monitor (keyless OGD API): predicted departures per U-Bahn platform. The API has no trip ids,
// so departures are grouped into the timetable trips they belong to (same line, station and planned time) and handed
// to the GTFS kit as realtime trips with timetabled and predicted times.
import { readJson } from '../../data.ts';
import { politeFetch, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import type { GtfsSchedule } from '../gtfs/index.ts';

const URL_MONITOR = 'https://www.wienerlinien.at/ogd_realtime/monitor';
const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';
const PER_REQUEST = 45;
const EVERY_MS = 60_000;
const STALE_MS = 4 * 60_000;

interface Departure {
  line: string;
  station: number;
  planned: number;
  real: number;
}

type Json = Record<string, unknown>;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
/** '2026-09-26T03:50:00.000+0200' -> epoch seconds. */
const time = (v: unknown) => {
  if (typeof v !== 'string') return NaN;
  return Date.parse(v.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')) / 1000;
};

export function wlMonitor(): RealtimeSource {
  let rbl: { rbl: number[]; st: string[] } | undefined;
  let trips: RtTrip[] = [];
  let at = 0;
  let last = 0;
  let inflight: Promise<void> | undefined;

  async function fetchAll(nowMs: number, sched: GtfsSchedule) {
    rbl ??= readJson<{ rbl: number[]; st: string[] }>('server/data/vienna/rbl.json');
    const stationOf = new Map(rbl.rbl.map((n, i) => [n, sched.stationIndex(rbl!.st[i])]));
    const deps: Departure[] = [];
    let failed = 0;
    const chunks: number[][] = [];
    for (let i = 0; i < rbl.rbl.length; i += PER_REQUEST) chunks.push(rbl.rbl.slice(i, i + PER_REQUEST));
    const load = async (chunk: number[]) => {
      try {
        const res = await politeFetch(`${URL_MONITOR}?${chunk.map((n) => `stopId=${n}`).join('&')}`, { headers: { 'user-agent': UA, accept: 'application/json' } }, { perMinute: 20 });
        const json = (await res.json()) as Json;
        for (const m of list((json.data as Json | undefined)?.monitors)) {
          const props = ((m as Json).locationStop as Json | undefined)?.properties as Json | undefined;
          const station = stationOf.get(Number((props?.attributes as Json | undefined)?.rbl));
          if (station == null) continue;
          for (const l of list((m as Json).lines)) {
            const name = String((l as Json).name ?? '');
            if (!/^U\d$/.test(name)) continue;
            for (const d of list(((l as Json).departures as Json | undefined)?.departure)) {
              const t = (d as Json).departureTime as Json | undefined;
              const planned = time(t?.timePlanned), real = time(t?.timeReal);
              if (Number.isFinite(planned) && Number.isFinite(real)) deps.push({ line: name.toLowerCase(), station, planned, real });
            }
          }
        }
      } catch (err) {
        failed++;
        console.warn(`[wl-monitor] ${err instanceof Error ? err.message : err}`);
      }
    };
    for (let i = 0; i < chunks.length; i += 3) await Promise.all(chunks.slice(i, i + 3).map(load));
    if (failed && !deps.length) return;
    trips = group(sched, deps, nowMs / 1000);
    at = nowMs;
  }

  return {
    name: 'Wiener Linien realtime',
    async refresh(nowMs, sched) {
      if (inflight) return inflight;
      if (nowMs - last < EVERY_MS && nowMs >= last) return;
      last = nowMs;
      inflight = fetchAll(nowMs, sched).finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      return at && Math.abs(nowMs - at) < STALE_MS && trips.length ? trips : undefined;
    },
  };
}

/** Attach each departure to the timetable trip that leaves that station at the planned time, one realtime trip each. */
function group(sched: GtfsSchedule, deps: Departure[], now: number): RtTrip[] {
  const lines = new Set(deps.map((d) => sched.lineIndex.get(d.line)).filter((i): i is number => i != null));
  const active = sched.active(now, lines, 600, 7200);
  const names = sched.data.stations;
  const byTrip = new Map<string, { line: string; stops: Map<number, NonNullable<RtTrip['stops']>[number]> }>();
  for (const d of deps) {
    const id = names[d.station];
    let best: { trip: (typeof active)[number]; i: number; diff: number } | null = null;
    for (const t of active) {
      if (t.line !== d.line) continue;
      const i = t.st.indexOf(id);
      if (i < 0) continue;
      const diff = Math.abs(t.times[2 * i + 1] - d.planned);
      if (diff <= 90 && (!best || diff < best.diff)) best = { trip: t, i, diff };
    }
    if (!best) continue;
    const g = byTrip.get(best.trip.id) ?? { line: d.line, stops: new Map() };
    byTrip.set(best.trip.id, g);
    // The monitor only gives departures; arrive a timetabled dwell earlier.
    const dwell = best.trip.times[2 * best.i + 1] - best.trip.times[2 * best.i];
    g.stops.set(d.station, { station: d.station, a: d.real - dwell, d: d.real, aimedA: d.planned - dwell, aimedD: d.planned });
  }
  const out: RtTrip[] = [];
  for (const [id, g] of byTrip) {
    const t = active.find((a) => a.id === id)!;
    const stops = [...g.stops.values()].sort((a, b) => t.st.indexOf(names[a.station]) - t.st.indexOf(names[b.station]));
    out.push({ line: g.line, stops });
  }
  return out;
}
