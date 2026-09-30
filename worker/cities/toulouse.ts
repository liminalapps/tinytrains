// Cloudflare Worker for toulouse's live trains. Data files are bundled as text (see toulouse.jsonc rules).
import { createAdapters } from '../../server/adapters/toulouse/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/toulouse/schedule.json';

const { CityHub, worker } = defineCity('toulouse', createAdapters, { 'server/data/toulouse/schedule.json': d0 });
export { CityHub };
export default worker;
