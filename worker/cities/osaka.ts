// Cloudflare Worker for osaka's live trains. Data files are bundled as text (see osaka.jsonc rules).
import { createAdapters } from '../../server/adapters/osaka/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/osaka/sim.json';

const { CityHub, worker } = defineCity('osaka', createAdapters, { 'server/data/osaka/sim.json': d0 });
export { CityHub };
export default worker;
