// Milan: ATM Metro and trams run on the Comune di Milano timetable (no keyless realtime exists for them); Trenord's
// suburban S lines and the Malpensa Express run on the Trenord timetable, shifted by live ViaggiaTreno delays.
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';
import { viaggiaTreno } from './viaggiatreno.ts';

export const createAdapters: AdapterFactory = () =>
  gtfsAdapters({
    city: 'milan',
    schedule: 'server/data/milan/schedule.json',
    adapters: [
      { id: 'milan-metro', name: 'Metro', systems: ['metro'] },
      { id: 'milan-suburbano', name: 'Suburban railway', systems: ['suburbano'], realtime: viaggiaTreno(), match: 'key', dropUnmatched: 'never' },
      { id: 'milan-tram', name: 'Tram', systems: ['tram'] },
    ],
  });
