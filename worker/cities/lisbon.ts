// Cloudflare Worker for lisbon's live trains. Data files are bundled as text (see lisbon.jsonc rules).
import { createAdapters } from '../../server/adapters/lisbon/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/lisbon/schedule.json';

const { CityHub, worker } = defineCity('lisbon', createAdapters, { 'server/data/lisbon/schedule.json': d0 });
export { CityHub };
export default worker;
