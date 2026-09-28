// Cloudflare Worker for philadelphia's live trains. Data files are bundled as text (see philadelphia.jsonc rules).
import { createAdapters } from '../../server/adapters/philadelphia/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/philadelphia/schedule.json';

const { CityHub, worker } = defineCity('philadelphia', createAdapters, { 'server/data/philadelphia/schedule.json': d0 });
export { CityHub };
export default worker;
