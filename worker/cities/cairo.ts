// Cloudflare Worker for cairo's live trains. Data files are bundled as text (see cairo.jsonc rules).
import { createAdapters } from '../../server/adapters/cairo/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/cairo/sim.json';

const { CityHub, worker } = defineCity('cairo', createAdapters, { 'server/data/cairo/sim.json': d0 });
export { CityHub };
export default worker;
