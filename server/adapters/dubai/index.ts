// Dubai: RTA Metro and Tram from the RTA static GTFS (GTFS kit; RTA publishes no open realtime feed), and the Palm
// Monorail simulated from its posted 15-minute interval (sim kit).
import { gtfsAdapters } from '../gtfs/index.ts';
import { simAdapters } from '../sim/index.ts';
import type { AdapterFactory } from '../types.ts';

export const createAdapters: AdapterFactory = () => [
  ...gtfsAdapters({
    city: 'dubai',
    schedule: 'server/data/dubai/schedule.json',
    adapters: [
      { id: 'dubai-metro', name: 'Metro', systems: ['metro'] },
      { id: 'dubai-tram', name: 'Tram', systems: ['tram'] },
    ],
  }),
  ...simAdapters('dubai', [{ id: 'dubai-monorail', name: 'Palm Monorail · simulated from its published interval', lines: ['palm'] }]),
];
