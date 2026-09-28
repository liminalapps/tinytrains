// Cloudflare Worker for montreal's live trains. Data files are bundled as text (see montreal.jsonc rules).
import { createAdapters } from '../../server/adapters/montreal/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/montreal/schedule.json';
import d1 from '../../server/data/montreal/sim.json';

const { CityHub, worker } = defineCity('montreal', createAdapters, { 'server/data/montreal/schedule.json': d0, 'server/data/montreal/sim.json': d1 });
export { CityHub };
export default worker;
