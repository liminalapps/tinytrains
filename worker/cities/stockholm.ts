// Cloudflare Worker for stockholm's live trains. Data files are bundled as text (see stockholm.jsonc rules).
import { createAdapters } from '../../server/adapters/stockholm/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/stockholm/schedule.json';

const { CityHub, worker } = defineCity('stockholm', createAdapters, { 'server/data/stockholm/schedule.json': d0 });
export { CityHub };
export default worker;
