import type { StockSpec } from '../types.ts';
import { stock as nyc } from './nyc.ts';
import { stock as sf } from './sf.ts';
import { stock as london } from './london.ts';
import { stock as paris } from './paris.ts';
import { stock as berlin } from './berlin.ts';
import { stock as madrid } from './madrid.ts';
import { stock as tokyo } from './tokyo.ts';
import { stock as seoul } from './seoul.ts';
import { stock as hongkong } from './hongkong.ts';
import { stock as washington } from './washington.ts';
import { stock as chicago } from './chicago.ts';
import { stock as boston } from './boston.ts';
import { stock as mexicocity } from './mexicocity.ts';
import { stock as saopaulo } from './saopaulo.ts';
import { stock as moscow } from './moscow.ts';
import { stock as stockholm } from './stockholm.ts';
import { stock as vienna } from './vienna.ts';
import { stock as helsinki } from './helsinki.ts';
import { stock as amsterdam } from './amsterdam.ts';
import { stock as oslo } from './oslo.ts';
import { stock as cairo } from './cairo.ts';
import { stock as delhi } from './delhi.ts';
import { stock as shanghai } from './shanghai.ts';
import { stock as beijing } from './beijing.ts';
import { stock as guangzhou } from './guangzhou.ts';
import { stock as shenzhen } from './shenzhen.ts';
import { stock as chengdu } from './chengdu.ts';
import { stock as hangzhou } from './hangzhou.ts';
import { stock as wuhan } from './wuhan.ts';
import { stock as chongqing } from './chongqing.ts';
import { stock as osaka } from './osaka.ts';
import { stock as taipei } from './taipei.ts';
import { stock as singapore } from './singapore.ts';
import { stock as sydney } from './sydney.ts';

export const STOCK: Record<string, StockSpec> = Object.fromEntries(
  [...nyc, ...sf, ...london, ...paris, ...berlin, ...madrid, ...tokyo, ...seoul, ...hongkong, ...washington, ...chicago, ...boston, ...mexicocity, ...saopaulo, ...moscow, ...stockholm, ...vienna, ...helsinki, ...amsterdam, ...oslo, ...cairo, ...delhi, ...shanghai, ...beijing, ...guangzhou, ...shenzhen, ...chengdu, ...hangzhou, ...wuhan, ...chongqing, ...osaka, ...taipei, ...singapore, ...sydney].map((s) => [s.id, s]),
);
