// Cloudflare Worker for helsinki's live trains. Data files are bundled as text (see helsinki.jsonc rules).
import { createAdapters } from '../../server/adapters/helsinki/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/helsinki/schedule.json';

const { CityHub, worker } = defineCity('helsinki', createAdapters, { 'server/data/helsinki/schedule.json': d0 });
export { CityHub };
export default worker;
