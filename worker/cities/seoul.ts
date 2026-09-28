// Cloudflare Worker for seoul's live trains. Data files are bundled as text (see seoul.jsonc rules).
import { createAdapters } from '../../server/adapters/seoul/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/seoul/network.json';
import d1 from '../../server/data/seoul/timetable.json';

const { CityHub, worker } = defineCity('seoul', createAdapters, { 'server/data/seoul/network.json': d0, 'server/data/seoul/timetable.json': d1 });
export { CityHub };
export default worker;
