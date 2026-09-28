import { CITY_ORDER } from '../shared/cities.ts';
import type { CityId } from '../shared/types.ts';

declare const __CITIES_READY__: CityId[] | undefined;

/** Cities with network data in this build, in picker order. A city in shared/cities.ts that isn't ready yet is
 * hidden (picker, search, links) until its data lands. */
export const READY: CityId[] = typeof __CITIES_READY__ !== 'undefined' ? __CITIES_READY__ : CITY_ORDER;
export const isReady = (c: string): c is CityId => (READY as string[]).includes(c);
