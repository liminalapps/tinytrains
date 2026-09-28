import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Shenzhen publishes no open timetable or realtime feed: every train is simulated from published intervals.
const LINES = ['1', '2', '3', '4', '5', '6', '7', '9', '10', '11', '12', '13', '14', '16', '20'];

export const createAdapters: AdapterFactory = () =>
  simAdapters('shenzhen', [{ id: 'shenzhen-metro', name: 'Shenzhen Metro · simulated from published intervals', lines: LINES }]);
