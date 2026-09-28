import type { AdapterFactory } from '../types.ts';
import { cercaniasAdapter } from './cercanias.ts';
import { timetableAdapter } from './timetable.ts';

export const createAdapters: AdapterFactory = () => [
  timetableAdapter({ id: 'madrid-metro', name: 'Metro de Madrid', schedule: 'metro', prefix: 'm' }),
  timetableAdapter({ id: 'madrid-ml', name: 'Metro Ligero', schedule: 'ml', prefix: 'ml' }),
  cercaniasAdapter(),
];
