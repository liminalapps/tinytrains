// Cloudflare Worker for hongkong's live trains. Data files are bundled as text (see hongkong.jsonc rules).
import { createAdapters } from '../../server/adapters/hongkong/index.ts';
import { defineCity } from '../city.ts';
import d0 from '../../server/data/hongkong/network.json';

const { CityHub, worker } = defineCity('hongkong', createAdapters, { 'server/data/hongkong/network.json': d0 });
export { CityHub };
export default worker;
