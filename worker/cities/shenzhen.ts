// Cloudflare Worker for shenzhen's live trains. Data files are bundled as text (see shenzhen.jsonc rules).
import { createAdapters } from '../../server/adapters/shenzhen/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/shenzhen/sim.json';

const { CityHub, worker } = defineCity('shenzhen', createAdapters, { 'server/data/shenzhen/sim.json': d0 });
export { CityHub };
export default worker;
