// Cloudflare Worker for naples's live trains. Data files are bundled as text (see naples.jsonc rules).
import { createAdapters } from '../../server/adapters/naples/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/naples/schedule.json';

const { CityHub, worker } = defineCity('naples', createAdapters, { 'server/data/naples/schedule.json': d0 });
export { CityHub };
export default worker;
