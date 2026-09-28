// Cloudflare Worker for shanghai's live trains. Data files are bundled as text (see shanghai.jsonc rules).
import { createAdapters } from '../../server/adapters/shanghai/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/shanghai/sim.json';

const { CityHub, worker } = defineCity('shanghai', createAdapters, { 'server/data/shanghai/sim.json': d0 });
export { CityHub };
export default worker;
