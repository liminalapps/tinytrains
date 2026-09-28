// Mexico City: STC Metro, Tren Ligero and Tren Suburbano from the SEMOVI timetable (GTFS kit). No public realtime feed.
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

export const createAdapters: AdapterFactory = () =>
  gtfsAdapters({
    city: 'mexicocity',
    schedule: 'server/data/mexicocity/schedule.json',
    adapters: [
      { id: 'mexicocity-metro', name: 'Metro', systems: ['metro'] },
      { id: 'mexicocity-tl', name: 'Tren Ligero', systems: ['tl'] },
      { id: 'mexicocity-sub', name: 'Tren Suburbano', systems: ['sub'] },
    ],
  });
