import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Istanbul publishes no rail GTFS or open realtime feed: Metro İstanbul lines are simulated from its own timetable,
// TCDD and IETT lines from their published intervals.
export const createAdapters: AdapterFactory = () =>
  simAdapters('istanbul', [
    { id: 'istanbul-metro', name: 'Metro İstanbul · simulated from its timetable', lines: ['M1A', 'M1B', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'] },
    { id: 'istanbul-tram', name: 'Tram · simulated from Metro İstanbul timetable', lines: ['T1', 'T4', 'T5', 'F1', 'F4'] },
    { id: 'istanbul-tcdd', name: 'TCDD Marmaray, M11 & T6 · simulated from published intervals', lines: ['B1', 'M11', 'T6'] },
    { id: 'istanbul-nostalgic', name: 'IETT nostalgic lines · simulated', lines: ['T2', 'T3', 'F2'] },
  ]);
