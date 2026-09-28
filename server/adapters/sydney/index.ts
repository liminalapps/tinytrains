// Sydney: Sydney Trains, intercity trains, Sydney Metro and light rail from TfNSW's timetable (GTFS kit, built by
// scripts/build-sydney.ts), with TfNSW GTFS-realtime on top when TFNSW_KEY is set.
import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts';
import type { RealtimeSource } from '../gtfs/realtime.ts';
import type { AdapterFactory } from '../types.ts';

const API = 'https://api.transport.nsw.gov.au';
const NAME = 'TfNSW GTFS-realtime';

/** Several feeds read as one source (TfNSW splits light rail by line). */
function merged(sources: RealtimeSource[]): RealtimeSource {
  return {
    name: NAME,
    async refresh(nowMs, sched) {
      await Promise.allSettled(sources.map((s) => s.refresh(nowMs, sched)));
    },
    trips(nowMs) {
      const all = sources.flatMap((s) => s.trips(nowMs) ?? []);
      return all.length ? all : undefined;
    },
  };
}

export const createAdapters: AdapterFactory = (env) => {
  const key = env.TFNSW_KEY;
  // Six feeds every 30 s: 12 requests a minute to one host (the budget is per host; TfNSW allows 5 a second).
  const feed = (path: string): RealtimeSource | undefined =>
    key ? gtfsRealtime({ name: NAME, tripUpdates: `${API}/${path}`, headers: { authorization: `apikey ${key}` }, everyMs: 30_000, perMinute: 24 }) : undefined;
  const lightRail = key ? merged(['innerwest', 'cbdandsoutheast', 'parramatta'].map((l) => feed(`v1/gtfs/realtime/lightrail/${l}`)!)) : undefined;
  return gtfsAdapters({
    city: 'sydney',
    schedule: 'server/data/sydney/schedule.json',
    adapters: [
      { id: 'sydney-trains', name: 'Sydney Trains', systems: ['trains'], realtime: feed('v2/gtfs/realtime/sydneytrains') },
      { id: 'sydney-intercity', name: 'Intercity trains', systems: ['intercity'], realtime: feed('v1/gtfs/realtime/nswtrains') },
      { id: 'sydney-metro', name: 'Sydney Metro', systems: ['metro'], realtime: feed('v2/gtfs/realtime/metro') },
      { id: 'sydney-lightrail', name: 'Light Rail', systems: ['lightrail'], realtime: lightRail },
    ],
  });
};
