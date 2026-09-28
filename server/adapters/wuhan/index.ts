import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Wuhan Metro publishes no open timetable or realtime feed: every train is simulated (sim kit).
export const createAdapters: AdapterFactory = () =>
  simAdapters('wuhan', [
    {
      id: 'wuhan-metro',
      name: 'Wuhan Metro · simulated from typical intervals',
      lines: ['1', '2', '3', '4', '5', '6', '7', '8', '11', '12', '16', '19', 'yangluo'],
    },
  ]);
