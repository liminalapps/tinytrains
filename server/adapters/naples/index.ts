// Naples: ANM Metro Lines 1 and 6, the funiculars and the EAV railways run on their published timetables (GTFS kit;
// neither ANM nor EAV has keyless realtime). Trenitalia's Line 2 runs on the timetable, shifted by live ViaggiaTreno
// delays where the API answers (it blocks Cloudflare, so production shows Line 2 from the timetable).
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';
import { viaggiaTreno } from './viaggiatreno.ts';

export const createAdapters: AdapterFactory = () =>
  gtfsAdapters({
    city: 'naples',
    schedule: 'server/data/naples/schedule.json',
    adapters: [
      { id: 'naples-metro', name: 'Metro', systems: ['metro'], lines: ['l1', 'l6'] },
      { id: 'naples-line2', name: 'Metro Line 2', lines: ['l2'], realtime: viaggiaTreno('l2'), match: 'time', dropUnmatched: 'never' },
      { id: 'naples-eav', name: 'EAV railways', systems: ['eav'] },
      { id: 'naples-funicular', name: 'Funiculars', systems: ['funicular'] },
    ],
  });
