// Cloudflare Worker for manchester's live trains. Data files are bundled as text (see manchester.jsonc rules).
import { createAdapters } from '../../server/adapters/manchester/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/manchester/schedule.json';

const { CityHub, worker } = defineCity('manchester', createAdapters, { 'server/data/manchester/schedule.json': d0 });
export { CityHub };
export default worker;
