// Cloudflare Worker for taipei's live trains. Data files are bundled as text (see taipei.jsonc rules).
import { createAdapters } from '../../server/adapters/taipei/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/taipei/schedule.json';
import d1 from '../../server/data/taipei/names.json';

const { CityHub, worker } = defineCity('taipei', createAdapters, { 'server/data/taipei/schedule.json': d0, 'server/data/taipei/names.json': d1 });
export { CityHub };
export default worker;
