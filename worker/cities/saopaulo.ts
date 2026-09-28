// Cloudflare Worker for saopaulo's live trains. Data files are bundled as text (see saopaulo.jsonc rules).
import { createAdapters } from '../../server/adapters/saopaulo/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/saopaulo/sim.json';

const { CityHub, worker } = defineCity('saopaulo', createAdapters, { 'server/data/saopaulo/sim.json': d0 });
export { CityHub };
export default worker;
