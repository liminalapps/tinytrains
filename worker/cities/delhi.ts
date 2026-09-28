// Cloudflare Worker for delhi's live trains. Data files are bundled as text (see delhi.jsonc rules).
import { createAdapters } from '../../server/adapters/delhi/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/delhi/sim.json';

const { CityHub, worker } = defineCity('delhi', createAdapters, { 'server/data/delhi/sim.json': d0 });
export { CityHub };
export default worker;
