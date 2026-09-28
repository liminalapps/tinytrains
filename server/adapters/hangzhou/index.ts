import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Hangzhou Metro publishes no open timetable or realtime feed: every train is simulated (sim kit).
export const createAdapters: AdapterFactory = () =>
  simAdapters('hangzhou', [
    {
      id: 'hangzhou-metro',
      name: 'Hangzhou Metro · simulated from typical intervals',
      lines: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '19'],
    },
  ]);
