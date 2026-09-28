// Cloudflare Worker for paris's live trains. Data files are bundled as text (see paris.jsonc rules).
import { createAdapters } from '../../server/adapters/paris/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/paris/schedule.json';

const { CityHub, worker } = defineCity('paris', createAdapters, { 'server/data/paris/schedule.json': d0 });
export { CityHub };
export default worker;
