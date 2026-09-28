// Cloudflare Worker for sydney's live trains. Data files are bundled as text (see sydney.jsonc rules).
import { createAdapters } from '../../server/adapters/sydney/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/sydney/schedule.json';

const { CityHub, worker } = defineCity('sydney', createAdapters, { 'server/data/sydney/schedule.json': d0 });
export { CityHub };
export default worker;
