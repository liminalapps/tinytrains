// Cloudflare Worker for singapore's live trains. Data files are bundled as text (see singapore.jsonc rules).
import { createAdapters } from '../../server/adapters/singapore/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/singapore/sim.json';

const { CityHub, worker } = defineCity('singapore', createAdapters, { 'server/data/singapore/sim.json': d0 });
export { CityHub };
export default worker;
