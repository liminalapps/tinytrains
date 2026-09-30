// Cloudflare Worker for bangkok's live trains. Data files are bundled as text (see bangkok.jsonc rules).
import { createAdapters } from '../../server/adapters/bangkok/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/bangkok/sim.json';

const { CityHub, worker } = defineCity('bangkok', createAdapters, { 'server/data/bangkok/sim.json': d0 });
export { CityHub };
export default worker;
