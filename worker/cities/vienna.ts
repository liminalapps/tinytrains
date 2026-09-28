// Cloudflare Worker for vienna's live trains. Data files are bundled as text (see vienna.jsonc rules).
import { createAdapters } from '../../server/adapters/vienna/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/vienna/schedule.json';
import d1 from '../../server/data/vienna/rbl.json';

const { CityHub, worker } = defineCity('vienna', createAdapters, { 'server/data/vienna/schedule.json': d0, 'server/data/vienna/rbl.json': d1 });
export { CityHub };
export default worker;
