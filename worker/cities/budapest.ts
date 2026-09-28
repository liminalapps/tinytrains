// Cloudflare Worker for budapest's live trains. Data files are bundled as text (see budapest.jsonc rules).
import { createAdapters } from '../../server/adapters/budapest/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/budapest/schedule.json';

const { CityHub, worker } = defineCity('budapest', createAdapters, { 'server/data/budapest/schedule.json': d0 });
export { CityHub };
export default worker;
