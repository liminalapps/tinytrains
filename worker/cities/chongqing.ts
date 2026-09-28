// Cloudflare Worker for chongqing's live trains. Data files are bundled as text (see chongqing.jsonc rules).
import { createAdapters } from '../../server/adapters/chongqing/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/chongqing/sim.json';

const { CityHub, worker } = defineCity('chongqing', createAdapters, { 'server/data/chongqing/sim.json': d0 });
export { CityHub };
export default worker;
