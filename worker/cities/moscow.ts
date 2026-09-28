// Cloudflare Worker for moscow's live trains. Data files are bundled as text (see moscow.jsonc rules).
import { createAdapters } from '../../server/adapters/moscow/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/moscow/sim.json';

const { CityHub, worker } = defineCity('moscow', createAdapters, { 'server/data/moscow/sim.json': d0 });
export { CityHub };
export default worker;
