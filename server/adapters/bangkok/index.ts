import type { AdapterFactory } from '../types.ts';
import { simAdapters } from '../sim/index.ts';

// Bangkok: no operator publishes open realtime. Every line is simulated from the headways in the OTP national GTFS
// (frequencies per line and day type), over OSM track.
export const createAdapters: AdapterFactory = () =>
  simAdapters('bangkok', [
    { id: 'bangkok-bts', name: 'BTS Skytrain · simulated from published headways', lines: ['sukhumvit', 'silom', 'gold'] },
    { id: 'bangkok-mrt', name: 'MRT · simulated from published headways', lines: ['blue', 'purple', 'yellow', 'pink'] },
    { id: 'bangkok-arl', name: 'Airport Rail Link · simulated from published headways', lines: ['arl'] },
    { id: 'bangkok-srt', name: 'SRT Red Lines · simulated from published headways', lines: ['darkred', 'lightred'] },
  ]);
