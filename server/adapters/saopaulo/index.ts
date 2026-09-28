// São Paulo: Metrô (lines 1–6, 15, 17) and the Trem Metropolitano (lines 7–13), simulated from published intervals
// over an OSM-built network (sim kit). No keyless realtime feed exists.
import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

export const createAdapters: AdapterFactory = () =>
  simAdapters('saopaulo', [
    { id: 'saopaulo-metro', name: 'Metrô · simulated from published intervals', lines: ['1', '2', '3', '4', '5', '6', '15', '17'] },
    { id: 'saopaulo-trem', name: 'Trem Metropolitano · simulated from published intervals', lines: ['7', '8', '9', '10', '11', '12', '13'] },
  ]);
