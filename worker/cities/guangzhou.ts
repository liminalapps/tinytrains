// Cloudflare Worker for guangzhou's live trains. Data files are bundled as text (see guangzhou.jsonc rules).
import { createAdapters } from '../../server/adapters/guangzhou/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/guangzhou/sim.json';

const { CityHub, worker } = defineCity('guangzhou', createAdapters, { 'server/data/guangzhou/sim.json': d0 });
export { CityHub };
export default worker;
