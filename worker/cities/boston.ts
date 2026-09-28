// Cloudflare Worker for boston's live trains. Data files are bundled as text (see boston.jsonc rules).
import { createAdapters } from '../../server/adapters/boston/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/boston/schedule.json';

const { CityHub, worker } = defineCity('boston', createAdapters, { 'server/data/boston/schedule.json': d0 });
export { CityHub };
export default worker;
