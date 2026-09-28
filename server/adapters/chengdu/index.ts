import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Chengdu Metro publishes no open timetable or realtime feed: every train is simulated (sim kit).
export const createAdapters: AdapterFactory = () =>
  simAdapters('chengdu', [
    {
      id: 'chengdu-metro',
      name: 'Chengdu Metro · simulated from typical intervals',
      lines: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '13', '17', '18', '19', '27', '30'],
    },
  ]);
