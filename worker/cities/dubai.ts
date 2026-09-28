// Cloudflare Worker for dubai's live trains. Data files are bundled as text (see dubai.jsonc rules).
import { createAdapters } from '../../server/adapters/dubai/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/dubai/schedule.json';
import d1 from '../../server/data/dubai/sim.json';

const { CityHub, worker } = defineCity('dubai', createAdapters, { 'server/data/dubai/schedule.json': d0, 'server/data/dubai/sim.json': d1 });
export { CityHub };
export default worker;
