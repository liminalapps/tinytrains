// Low-precision sun and moon positions: good to a fraction of a degree, plenty for lighting a toy city.

const RAD = Math.PI / 180;

export interface SkyPos {
  alt: number; // radians above horizon
  az: number; // radians from north, clockwise (east = +PI/2)
}

function daysSinceJ2000(ms: number) {
  return ms / 86400000 - 10957.5;
}

function toHorizontal(ra: number, dec: number, d: number, lat: number, lon: number): SkyPos {
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  const ha = (gmst + lon) * RAD - ra;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(ha), Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(ha) * Math.sin(phi));
  return { alt, az: (az + 2 * Math.PI) % (2 * Math.PI) };
}

export function sunPosition(ms: number, lat: number, lon: number): SkyPos {
  const d = daysSinceJ2000(ms);
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  return toHorizontal(ra, dec, d, lat, lon);
}

export function moonPosition(ms: number, lat: number, lon: number): SkyPos & { phase: number; lit: number } {
  const d = daysSinceJ2000(ms);
  const L = (218.316 + 13.176396 * d) * RAD;
  const M = (134.963 + 13.064993 * d) * RAD;
  const F = (93.272 + 13.22935 * d) * RAD;
  const l = L + 6.289 * RAD * Math.sin(M);
  const b = 5.128 * RAD * Math.sin(F);
  const e = 23.4397 * RAD;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  // Phase from the sun-moon elongation.
  const g = (357.529 + 0.98560028 * d) * RAD;
  const sunL = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g)) * RAD;
  const elong = Math.acos(Math.cos(b) * Math.cos(l - sunL));
  const lit = (1 - Math.cos(elong)) / 2;
  const waxing = Math.sin(l - sunL) > 0;
  const phase = waxing ? elong / (2 * Math.PI) : 1 - elong / (2 * Math.PI);
  return { ...toHorizontal(ra, dec, d, lat, lon), phase, lit };
}

/** Unit direction toward a sky position in world space (x east, y up, z south). */
export function skyDir(p: SkyPos): [number, number, number] {
  const c = Math.cos(p.alt);
  return [Math.sin(p.az) * c, Math.sin(p.alt), -Math.cos(p.az) * c];
}
