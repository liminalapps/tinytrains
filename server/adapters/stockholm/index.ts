// Stockholm: SL tunnelbana, pendeltåg, trams and light railways from the GTFS Regional timetable (GTFS kit). The
// tunnelbana and pendeltåg are refined with expected times from SL's keyless departure boards (sl.ts); SL's
// GTFS-realtime needs a Trafiklab key.
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';
import { slRealtime } from './sl.ts';

export const createAdapters: AdapterFactory = () => {
  const realtime = slRealtime();
  return gtfsAdapters({
    city: 'stockholm',
    schedule: 'server/data/stockholm/schedule.json',
    adapters: [
      // Boards cover every train only near the polled stations: never take a train without predictions as cancelled.
      { id: 'stockholm-tunnelbana', name: 'Tunnelbana', systems: ['tunnelbana'], realtime, match: 'time', dropUnmatched: 'never' },
      { id: 'stockholm-pendeltag', name: 'Pendeltåg', systems: ['pendeltag'], realtime, match: 'time', dropUnmatched: 'never' },
      { id: 'stockholm-sparvag', name: 'Spårväg', systems: ['sparvag'] },
      { id: 'stockholm-lokalbana', name: 'Lokalbanor', systems: ['lokalbana'] },
    ],
  });
};
