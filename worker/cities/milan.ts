// Cloudflare Worker for milan's live trains. Data files are bundled as text (see milan.jsonc rules).
import { createAdapters } from '../../server/adapters/milan/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/milan/schedule.json';

const { CityHub, worker } = defineCity('milan', createAdapters, { 'server/data/milan/schedule.json': d0 });
export { CityHub };
export default worker;
