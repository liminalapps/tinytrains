import type { AdapterFactory } from '../types.ts';
import { createSystem } from './trains.ts';

export const createAdapters: AdapterFactory = () => [
  createSystem({
    id: 'berlin-sbahn',
    mode: 's',
    name: 'S-Bahn Berlin · VBB GTFS-realtime',
    timetableName: 'S-Bahn Berlin · timetable (VBB GTFS)',
  }),
  createSystem({
    id: 'berlin-ubahn',
    mode: 'u',
    name: 'BVG U-Bahn · VBB HAFAS radar',
    timetableName: 'BVG U-Bahn · timetable (VBB GTFS)',
    radar: 'subway',
  }),
  createSystem({
    id: 'berlin-tram',
    mode: 't',
    name: 'BVG Tram · VBB HAFAS radar',
    timetableName: 'BVG Tram · timetable (VBB GTFS)',
    radar: 'tram',
  }),
];
