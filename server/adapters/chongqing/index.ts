import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Chongqing Rail Transit publishes no open timetable or realtime feed: every train is simulated (sim kit).
export const createAdapters: AdapterFactory = () =>
  simAdapters('chongqing', [
    {
      id: 'chongqing-crt',
      name: 'Chongqing Rail Transit · simulated from typical intervals',
      lines: ['0', '1', '2', '3', '4', '5', '6', '9', '10', '18', 'exp', 'jt'],
    },
  ]);
