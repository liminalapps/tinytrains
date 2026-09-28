// Cloudflare Worker for london's live trains. Data files are bundled as text (see london.jsonc rules).
import { createAdapters } from '../../server/adapters/london/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../public/data/london/transit.json';
import d1 from '../../server/data/london/routes.json';

const { CityHub, worker } = defineCity('london', createAdapters, { 'public/data/london/transit.json': d0, 'server/data/london/routes.json': d1 });
export { CityHub };
export default worker;
