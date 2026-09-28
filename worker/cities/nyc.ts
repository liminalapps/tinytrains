// Cloudflare Worker for nyc's live trains. Data files are bundled as text (see nyc.jsonc rules).
import { createAdapters } from '../../server/adapters/nyc/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../public/data/nyc/transit.json';
import d1 from '../../server/data/nyc/schedule.json';

const { CityHub, worker } = defineCity('nyc', createAdapters, { 'public/data/nyc/transit.json': d0, 'server/data/nyc/schedule.json': d1 });
export { CityHub };
export default worker;
