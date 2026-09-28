// Cloudflare Worker for istanbul's live trains. Data files are bundled as text (see istanbul.jsonc rules).
import { createAdapters } from '../../server/adapters/istanbul/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/istanbul/sim.json';

const { CityHub, worker } = defineCity('istanbul', createAdapters, { 'server/data/istanbul/sim.json': d0 });
export { CityHub };
export default worker;
