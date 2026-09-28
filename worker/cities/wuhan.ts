// Cloudflare Worker for wuhan's live trains. Data files are bundled as text (see wuhan.jsonc rules).
import { createAdapters } from '../../server/adapters/wuhan/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/wuhan/sim.json';

const { CityHub, worker } = defineCity('wuhan', createAdapters, { 'server/data/wuhan/sim.json': d0 });
export { CityHub };
export default worker;
