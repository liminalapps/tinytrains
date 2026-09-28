import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Moscow: no public realtime or timetable feed; trains are simulated from typical intervals (sim kit).
export const createAdapters: AdapterFactory = () =>
  simAdapters('moscow', [
    {
      id: 'moscow-metro',
      name: 'Moscow Metro · simulated from typical intervals',
      lines: ['1', '2', '3', '4', '5', '6', '7', '8', '8A', '9', '10', '11', '12', '15', '16', '17'],
    },
    { id: 'moscow-mcc', name: 'MCC · simulated from typical intervals', lines: ['14'] },
    { id: 'moscow-mcd', name: 'MCD · simulated from typical intervals', lines: ['D1', 'D2', 'D3', 'D4'] },
  ]);
