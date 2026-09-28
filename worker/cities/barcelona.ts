// Cloudflare Worker for barcelona's live trains. Data files are bundled as text (see barcelona.jsonc rules).
import { createAdapters } from '../../server/adapters/barcelona/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/barcelona/schedule.json';

const { CityHub, worker } = defineCity('barcelona', createAdapters, { 'server/data/barcelona/schedule.json': d0 });
export { CityHub };
export default worker;
