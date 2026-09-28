// Cloudflare Worker for hangzhou's live trains. Data files are bundled as text (see hangzhou.jsonc rules).
import { createAdapters } from '../../server/adapters/hangzhou/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/hangzhou/sim.json';

const { CityHub, worker } = defineCity('hangzhou', createAdapters, { 'server/data/hangzhou/sim.json': d0 });
export { CityHub };
export default worker;
