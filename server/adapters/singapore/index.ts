import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Singapore: LTA publishes no keyless train positions or timetable; trains are simulated from published
// frequencies (sim kit).
export const createAdapters: AdapterFactory = () =>
  simAdapters('singapore', [
    { id: 'singapore-mrt', name: 'MRT · simulated from published frequencies', lines: ['NSL', 'EWL', 'NEL', 'CCL', 'DTL', 'TEL'] },
    { id: 'singapore-lrt', name: 'LRT · simulated from published frequencies', lines: ['BPLRT', 'SKLRT', 'PGLRT'] },
  ]);
