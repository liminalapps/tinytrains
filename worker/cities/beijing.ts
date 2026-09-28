// Cloudflare Worker for beijing's live trains. Data files are bundled as text (see beijing.jsonc rules).
import { createAdapters } from '../../server/adapters/beijing/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/beijing/sim.json';

const { CityHub, worker } = defineCity('beijing', createAdapters, { 'server/data/beijing/sim.json': d0 });
export { CityHub };
export default worker;
