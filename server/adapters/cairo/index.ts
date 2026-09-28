import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Cairo publishes no open timetable or realtime feed: trains are simulated from Transport for Cairo's frequencies.
export const createAdapters: AdapterFactory = () =>
  simAdapters('cairo', [
    { id: 'cairo-metro', name: 'Cairo Metro · simulated from published frequencies', lines: ['L1', 'L2', 'L3'] },
    { id: 'cairo-monorail', name: 'Cairo Monorail · simulated (estimated frequency)', lines: ['EN'] },
  ]);
