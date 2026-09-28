// Cloudflare Worker for berlin's live trains. Data files are bundled as text (see berlin.jsonc rules).
import { createAdapters } from '../../server/adapters/berlin/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/berlin/schedule.json';

const { CityHub, worker } = defineCity('berlin', createAdapters, { 'server/data/berlin/schedule.json': d0 });
export { CityHub };
export default worker;
