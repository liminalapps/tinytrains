// Cloudflare Worker for rome's live trains. Data files are bundled as text (see rome.jsonc rules).
import { createAdapters } from '../../server/adapters/rome/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/rome/schedule.json';
import d1 from '../../server/data/rome/sim.json';

const { CityHub, worker } = defineCity('rome', createAdapters, { 'server/data/rome/schedule.json': d0, 'server/data/rome/sim.json': d1 });
export { CityHub };
export default worker;
