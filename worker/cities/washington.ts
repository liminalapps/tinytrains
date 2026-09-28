// Cloudflare Worker for washington's live trains. Data files are bundled as text (see washington.jsonc rules).
import { createAdapters } from '../../server/adapters/washington/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/washington/schedule.json';

const { CityHub, worker } = defineCity('washington', createAdapters, { 'server/data/washington/schedule.json': d0 });
export { CityHub };
export default worker;
