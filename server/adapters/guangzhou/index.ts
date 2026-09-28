import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Guangzhou publishes no open timetable or realtime feed: every train is simulated from published intervals.
const LINES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '18', '21', '22', 'guangfo', 'apm'];

export const createAdapters: AdapterFactory = () =>
  simAdapters('guangzhou', [{ id: 'guangzhou-metro', name: 'Guangzhou Metro · simulated from published intervals', lines: LINES }]);
