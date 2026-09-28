// Vienna: Wiener Linien U-Bahn, Straßenbahn and Badner Bahn from the timetable (GTFS kit), with the U-Bahn upgraded
// by the keyless Wiener Linien realtime monitor.
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';
import { wlMonitor } from './monitor.ts';

export const createAdapters: AdapterFactory = () =>
  gtfsAdapters({
    city: 'vienna',
    schedule: 'server/data/vienna/schedule.json',
    adapters: [
      { id: 'vienna-ubahn', name: 'U-Bahn', systems: ['ubahn'], realtime: wlMonitor() },
      { id: 'vienna-tram', name: 'Straßenbahn', systems: ['tram'] },
      { id: 'vienna-wlb', name: 'Badner Bahn', systems: ['wlb'] },
    ],
  });
