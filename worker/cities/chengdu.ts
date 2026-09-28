// Cloudflare Worker for chengdu's live trains. Data files are bundled as text (see chengdu.jsonc rules).
import { createAdapters } from '../../server/adapters/chengdu/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/chengdu/sim.json';

const { CityHub, worker } = defineCity('chengdu', createAdapters, { 'server/data/chengdu/sim.json': d0 });
export { CityHub };
export default worker;
