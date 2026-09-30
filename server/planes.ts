// Live aircraft over a city, from community ADS-B networks: adsb.lol (ODbL), falling back to adsb.fi.
// Both are keyless; adsb.lol asks for a User-Agent with contact info. Shared by the Node server and the
// front Worker, so it only uses fetch.
import { CITIES } from '../shared/cities.ts';
import type { CityId } from '../shared/types.ts';

export const PLANE_UA = 'TinyTrains/1.0 (+https://tinytrains.app)';

/** One aircraft, trimmed to what the map draws. */
export interface Plane {
  hex: string; // ICAO 24-bit address
  cs: string; // callsign ("" if not broadcast)
  reg: string; // registration
  t: string; // ICAO type designator (A320, B77W, …)
  lat: number;
  lon: number;
  alt: number; // feet (barometric); 0 on the ground
  gnd: boolean;
  gs: number; // ground speed, knots
  trk: number; // true track, degrees
  vr: number; // vertical rate, ft/min
  age: number; // seconds since the position was received
  cat?: string; // ADS-B emitter category (A1 light … A5 heavy, A7 rotorcraft)
}

export interface PlanesResponse {
  city: CityId;
  now: number;
  source: string;
  planes: Plane[];
}

/** A circle (nautical miles) around the city's map that covers all of it plus a margin for approaches. */
function area(city: CityId) {
  const [w, s, e, n] = CITIES[city].bbox;
  const lat = (s + n) / 2;
  const lon = (w + e) / 2;
  const kmX = ((e - w) / 2) * 111.32 * Math.cos((lat * Math.PI) / 180);
  const kmY = ((n - s) / 2) * 110.57;
  const nm = Math.min(250, Math.ceil((Math.hypot(kmX, kmY) * 1.35) / 1.852));
  return { lat, lon, nm };
}

interface Raw {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  seen_pos?: number;
  category?: string;
}

function normalize(ac: Raw[]): Plane[] {
  const out: Plane[] = [];
  for (const a of ac) {
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number' || !a.hex) continue;
    if ((a.seen_pos ?? 0) > 60) continue;
    const gnd = a.alt_baro === 'ground';
    out.push({
      hex: a.hex,
      cs: (a.flight ?? '').trim(),
      reg: a.r ?? '',
      t: a.t ?? '',
      lat: +a.lat.toFixed(5),
      lon: +a.lon.toFixed(5),
      alt: gnd ? 0 : Math.max(0, Math.round(Number(a.alt_baro) || 0)),
      gnd,
      gs: Math.round(a.gs ?? 0),
      trk: Math.round(a.track ?? a.true_heading ?? 0),
      vr: Math.round(a.baro_rate ?? a.geom_rate ?? 0),
      age: +(a.seen_pos ?? 0).toFixed(1),
      ...(a.category ? { cat: a.category } : {}),
    });
  }
  return out;
}

const SOURCES = [
  { name: 'adsb.lol', url: (a: ReturnType<typeof area>) => `https://api.adsb.lol/v2/lat/${a.lat.toFixed(4)}/lon/${a.lon.toFixed(4)}/dist/${a.nm}` },
  { name: 'adsb.fi', url: (a: ReturnType<typeof area>) => `https://opendata.adsb.fi/api/v2/lat/${a.lat.toFixed(4)}/lon/${a.lon.toFixed(4)}/dist/${a.nm}` },
];

/** OpenSky state vectors (no aircraft type; see fetchTypes). */
async function openSky(city: CityId): Promise<Plane[]> {
  const [w, s, e, n] = CITIES[city].bbox;
  const pad = 0.25;
  const u = `https://opensky-network.org/api/states/all?lamin=${(s - pad).toFixed(3)}&lomin=${(w - pad).toFixed(3)}&lamax=${(n + pad).toFixed(3)}&lomax=${(e + pad).toFixed(3)}`;
  const r = await fetch(u, { headers: { 'user-agent': PLANE_UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 60)}`);
  const j = (await r.json()) as { time: number; states: (string | number | boolean | null)[][] | null };
  const out: Plane[] = [];
  for (const v of j.states ?? []) {
    const [hex, cs, , tPos, , lon, lat, baro, gnd, vel, trk, vr] = v as [string, string, string, number, number, number, number, number, boolean, number, number, number];
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const age = Math.max(0, j.time - (tPos ?? j.time));
    if (age > 60) continue;
    out.push({
      hex,
      cs: (cs ?? '').trim(),
      reg: '',
      t: '',
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
      alt: gnd ? 0 : Math.max(0, Math.round((baro ?? 0) * 3.28084)),
      gnd: !!gnd,
      gs: Math.round((vel ?? 0) * 1.94384),
      trk: Math.round(trk ?? 0),
      vr: Math.round((vr ?? 0) * 196.85),
      age,
    });
  }
  return out;
}

export async function fetchPlanes(city: CityId): Promise<PlanesResponse> {
  const a = area(city);
  const errs: string[] = [];
  for (const src of SOURCES) {
    try {
      const r = await fetch(src.url(a), { headers: { 'user-agent': PLANE_UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) {
        errs.push(`${src.name}: HTTP ${r.status}`);
        continue;
      }
      const j = (await r.json()) as { ac?: Raw[]; aircraft?: Raw[] };
      return { city, now: Date.now(), source: src.name, planes: normalize(j.ac ?? j.aircraft ?? []) };
    } catch (e) {
      errs.push(`${src.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  try {
    return { city, now: Date.now(), source: 'opensky', planes: await openSky(city) };
  } catch (e) {
    errs.push(`opensky: ${e instanceof Error ? e.message : e}`);
  }
  throw new Error(errs.join(' · ') || 'no plane source answered');
}

/** Type and registration for an aircraft address, from adsbdb (keyless, CORS-friendly). */
export async function fetchAircraft(hex: string): Promise<{ t: string; reg: string; name: string; owner: string } | null> {
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const r = await fetch(`https://api.adsbdb.com/v0/aircraft/${hex}`, { headers: { 'user-agent': PLANE_UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { response?: { aircraft?: Record<string, string> } | string };
  const a = typeof j.response === 'object' ? j.response.aircraft : undefined;
  if (!a) return null;
  return { t: a.icao_type ?? '', reg: a.registration ?? '', name: `${a.manufacturer ?? ''} ${a.type ?? ''}`.trim(), owner: a.registered_owner ?? '' };
}

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  lat: number | null;
  lon: number | null;
}
export interface FlightRoute {
  callsign: string;
  airline: string | null;
  airlineIata: string | null;
  from: Airport | null;
  to: Airport | null;
}

/** Airline and origin/destination for a callsign, from adsbdb (keyless). Null when unknown. */
export async function fetchRoute(callsign: string): Promise<FlightRoute | null> {
  if (!/^[A-Z0-9]{2,8}$/.test(callsign)) return null;
  const r = await fetch(`https://api.adsbdb.com/v0/callsign/${callsign}`, { headers: { 'user-agent': PLANE_UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { response?: { flightroute?: Record<string, any> } | string };
  const f = typeof j.response === 'object' ? j.response.flightroute : undefined;
  if (!f) return null;
  const ap = (x: any): Airport | null =>
    x
      ? {
          iata: x.iata_code ?? '',
          icao: x.icao_code ?? '',
          name: x.name ?? '',
          city: x.municipality ?? '',
          country: x.country_name ?? '',
          lat: typeof x.latitude === 'number' ? x.latitude : null,
          lon: typeof x.longitude === 'number' ? x.longitude : null,
        }
      : null;
  return { callsign, airline: f.airline?.name ?? null, airlineIata: f.airline?.iata ?? null, from: ap(f.origin), to: ap(f.destination) };
}
