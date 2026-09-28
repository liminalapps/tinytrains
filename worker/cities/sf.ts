// Cloudflare Worker for sf's live trains. Data files are bundled as text (see sf.jsonc rules).
import { createAdapters } from '../../server/adapters/sf/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/sf/bart.json';
import d1 from '../../server/data/sf/muni.json';
import d2 from '../../server/data/sf/caltrain.json';

const { CityHub, worker } = defineCity('sf', createAdapters, { 'server/data/sf/bart.json': d0, 'server/data/sf/muni.json': d1, 'server/data/sf/caltrain.json': d2 });
export { CityHub };
export default worker;
