// Taipei: Taipei Metro and New Taipei Metro from the operators' published timetables (GTFS kit, built by
// scripts/build-taipei.ts), with Taipei Metro's keyless train-arrival feed on top.
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';
import { TaipeiArrivals } from './arrivals.ts';

export const createAdapters: AdapterFactory = () =>
  gtfsAdapters({
    city: 'taipei',
    schedule: 'server/data/taipei/schedule.json',
    adapters: [
      // The feed sees a fraction of the trains at any moment, so trains it hasn't seen keep running on the timetable.
      { id: 'taipei-metro', name: 'Taipei Metro', systems: ['trtc'], realtime: new TaipeiArrivals(), match: 'key', dropUnmatched: 'never' },
      { id: 'taipei-ntm', name: 'New Taipei Metro', systems: ['ntm'] },
    ],
  });
