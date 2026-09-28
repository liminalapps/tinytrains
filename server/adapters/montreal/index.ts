// Montreal: STM Métro and exo commuter trains from their official timetables (GTFS kit), and the REM simulated from
// its published frequencies (sim kit). None of the three publishes keyless realtime train positions: STM's
// GTFS-realtime covers buses only, and exo's needs a token.
import { gtfsAdapters } from '../gtfs/index.ts';
import { simAdapters } from '../sim/index.ts';
import type { AdapterFactory } from '../types.ts';

export const createAdapters: AdapterFactory = () => [
  ...gtfsAdapters({
    city: 'montreal',
    schedule: 'server/data/montreal/schedule.json',
    adapters: [
      { id: 'montreal-metro', name: 'Métro', systems: ['stm'] },
      { id: 'montreal-exo', name: 'exo Trains', systems: ['exo'] },
    ],
  }),
  ...simAdapters('montreal', [{ id: 'montreal-rem', name: 'REM · simulated from published frequencies', lines: ['rem'] }]),
];
