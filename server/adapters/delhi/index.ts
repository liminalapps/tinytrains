import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Delhi has no usable realtime or current timetable feed: trains are simulated from DMRC's published frequencies.
export const createAdapters: AdapterFactory = () =>
  simAdapters('delhi', [
    {
      id: 'delhi-metro',
      name: 'Delhi Metro · simulated from DMRC frequencies',
      lines: ['red', 'yellow', 'blue', 'green', 'violet', 'airport', 'pink', 'magenta', 'grey', 'rapid'],
    },
    { id: 'delhi-noida', name: 'Noida Metro · simulated from published frequencies', lines: ['aqua'] },
    { id: 'delhi-namo', name: 'Namo Bharat · simulated from published frequencies', lines: ['namo'] },
  ]);
