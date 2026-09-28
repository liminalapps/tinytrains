// Cloudflare Worker for oslo's live trains. Data files are bundled as text (see oslo.jsonc rules).
import { createAdapters } from '../../server/adapters/oslo/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/oslo/schedule.json';

const { CityHub, worker } = defineCity('oslo', createAdapters, { 'server/data/oslo/schedule.json': d0 });
export { CityHub };
export default worker;
