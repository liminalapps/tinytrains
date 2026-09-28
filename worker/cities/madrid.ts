// Cloudflare Worker for madrid's live trains. Data files are bundled as text (see madrid.jsonc rules).
import { createAdapters } from '../../server/adapters/madrid/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../public/data/madrid/transit.json';
import d1 from '../../server/data/madrid/metro.json';
import d2 from '../../server/data/madrid/ml.json';
import d3 from '../../server/data/madrid/cercanias.json';

const { CityHub, worker } = defineCity('madrid', createAdapters, { 'public/data/madrid/transit.json': d0, 'server/data/madrid/metro.json': d1, 'server/data/madrid/ml.json': d2, 'server/data/madrid/cercanias.json': d3 });
export { CityHub };
export default worker;
