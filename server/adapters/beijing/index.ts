import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Beijing publishes no open timetable or realtime feed: every train is simulated from published intervals.
const LINES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', 'yizhuang', 'fangshan', 'changping', 's1', 'xijiao'];

export const createAdapters: AdapterFactory = () =>
  simAdapters('beijing', [
    { id: 'beijing-subway', name: 'Beijing Subway · simulated from published intervals', lines: LINES },
    { id: 'beijing-airport', name: 'Beijing airport expresses · simulated from published intervals', lines: ['airport', 'daxing-airport'] },
  ]);
