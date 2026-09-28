// Cloudflare Worker for chicago's live trains. Data files are bundled as text (see chicago.jsonc rules).
import { createAdapters } from '../../server/adapters/chicago/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/chicago/schedule.json';

const { CityHub, worker } = defineCity('chicago', createAdapters, { 'server/data/chicago/schedule.json': d0 });
export { CityHub };
export default worker;
