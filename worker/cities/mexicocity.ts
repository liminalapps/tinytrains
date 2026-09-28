// Cloudflare Worker for mexicocity's live trains. Data files are bundled as text (see mexicocity.jsonc rules).
import { createAdapters } from '../../server/adapters/mexicocity/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/mexicocity/schedule.json';

const { CityHub, worker } = defineCity('mexicocity', createAdapters, { 'server/data/mexicocity/schedule.json': d0 });
export { CityHub };
export default worker;
