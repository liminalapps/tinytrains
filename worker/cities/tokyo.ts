// Cloudflare Worker for tokyo's live trains. Data files are bundled as text (see tokyo.jsonc rules).
import { createAdapters } from '../../server/adapters/tokyo/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/tokyo/schedule.json';

const { CityHub, worker } = defineCity('tokyo', createAdapters, { 'server/data/tokyo/schedule.json': d0 });
export { CityHub };
export default worker;
