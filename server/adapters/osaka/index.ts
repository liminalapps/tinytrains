import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// No Osaka rail operator publishes an open timetable or realtime feed: trains are simulated from published intervals.
export const createAdapters: AdapterFactory = () =>
  simAdapters('osaka', [
    { id: 'osaka-metro', name: 'Osaka Metro · simulated from published intervals', lines: ['M', 'T', 'Y', 'C', 'S', 'K', 'N', 'I', 'P'] },
    { id: 'osaka-jr', name: 'JR West · simulated from published intervals', lines: ['jr-o', 'jr-p', 'jr-r', 'jr-q'] },
    { id: 'osaka-hankyu', name: 'Hankyu · simulated from published intervals', lines: ['hk-kobe', 'hk-takarazuka', 'hk-kyoto'] },
    { id: 'osaka-hanshin', name: 'Hanshin · simulated from published intervals', lines: ['hs-main'] },
    { id: 'osaka-keihan', name: 'Keihan · simulated from published intervals', lines: ['kh-main'] },
    { id: 'osaka-nankai', name: 'Nankai · simulated from published intervals', lines: ['nk-main', 'nk-koya'] },
    { id: 'osaka-kintetsu', name: 'Kintetsu · simulated from published intervals', lines: ['kt-nara', 'kt-osaka'] },
    { id: 'osaka-monorail', name: 'Osaka Monorail · simulated from published intervals', lines: ['om'] },
  ]);
