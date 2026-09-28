import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Shanghai publishes no open timetable or realtime feed: every train is simulated from published intervals.
const METRO = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', 'pujiang'];

export const createAdapters: AdapterFactory = () =>
  simAdapters('shanghai', [
    { id: 'shanghai-metro', name: 'Shanghai Metro · simulated from published intervals', lines: METRO },
    { id: 'shanghai-maglev', name: 'Shanghai Maglev · simulated from the timetable', lines: ['maglev'] },
    { id: 'shanghai-airport-link', name: 'Airport Link Line · simulated from published intervals', lines: ['airport'] },
  ]);
