import { CITIES } from './cities.ts';
import type { CityId, Flat } from './types.ts';

const R = 6371008.8;
const DEG = Math.PI / 180;

/** Local equirectangular projection around the city origin. Returns meters: +x east, +y north. */
export function makeProjection(city: CityId) {
  const [lon0, lat0] = CITIES[city].origin;
  const kx = DEG * R * Math.cos(lat0 * DEG);
  const ky = DEG * R;
  return {
    project(lon: number, lat: number): [number, number] {
      return [(lon - lon0) * kx, (lat - lat0) * ky];
    },
    unproject(x: number, y: number): [number, number] {
      return [x / kx + lon0, y / ky + lat0];
    },
  };
}

/** Projected bounds of the city's diorama bbox. */
export function cityBounds(city: CityId) {
  const { project } = makeProjection(city);
  const [w, s, e, n] = CITIES[city].bbox;
  const [minX, minY] = project(w, s);
  const [maxX, maxY] = project(e, n);
  return { minX, minY, maxX, maxY };
}

/** Round a flat coordinate array to 0.1 m to keep JSON small. */
export function roundFlat(pts: Flat, decimals = 1): Flat {
  const f = 10 ** decimals;
  return pts.map((v) => Math.round(v * f) / f);
}

/** Length of a flat polyline. */
export function flatLength(pts: Flat): number {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}
