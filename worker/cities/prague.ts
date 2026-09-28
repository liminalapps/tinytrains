// Cloudflare Worker for prague's live trains. Data files are bundled as text (see prague.jsonc rules).
import { createAdapters } from '../../server/adapters/prague/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/prague/schedule.json';

const { CityHub, worker } = defineCity('prague', createAdapters, { 'server/data/prague/schedule.json': d0 });
export { CityHub };
export default worker;
