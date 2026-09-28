import type { CityId, TrainState } from '../../shared/types.ts';

/** Optional API keys, read from the environment (.env is loaded by server/index.ts). */
export interface AdapterEnv {
  API_511_KEY?: string; // 511.org SF Bay Area open data token (Muni, Caltrain realtime)
  ODPT_KEY?: string; // developer.odpt.org consumer key (Tokyo Metro realtime)
  TFL_APP_KEY?: string; // api.tfl.gov.uk app_key (higher rate limit; anonymous works too)
  PRIM_KEY?: string; // prim.iledefrance-mobilites.fr API key (Paris realtime)
  SEOUL_API_KEY?: string; // data.seoul.go.kr OpenAPI key (Seoul realtime positions)
  SEOUL_DAILY_BUDGET?: string; // realtime calls per KST day for that key (default 900; 'unlimited' once the cap is lifted)
  WMATA_KEY?: string; // api.wmata.com (Washington Metrorail realtime + GTFS)
  CTA_TRAIN_KEY?: string; // transitchicago.com Train Tracker API
  MBTA_KEY?: string; // api-v3.mbta.com (optional; raises the rate limit)
  TFNSW_KEY?: string; // opendata.transport.nsw.gov.au (Sydney realtime + GTFS)
  BKK_KEY?: string; // opendata.bkk.hu (Budapest GTFS-realtime)
  TRAFIKLAB_KEY?: string; // trafiklab.se GTFS Sweden 3 / GTFS Regional (Stockholm realtime)
  DIGITRANSIT_KEY?: string; // digitransit.fi (Helsinki realtime)
  TDX_CLIENT_ID?: string; // tdx.transportdata.tw OAuth client (Taipei Metro realtime)
  TDX_CLIENT_SECRET?: string;
  /** Key-value storage that survives restarts (Durable Object storage on Cloudflare), for state such as call budgets. */
  storage?: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
}

/**
 * One live (or scheduled) data source for a city. The hub calls poll() every intervalMs while
 * someone is watching the city, and merges the trains of all adapters of that city.
 */
export interface Adapter {
  id: string; // 'nyc-subway'
  city: CityId;
  name: string; // shown in the UI source list, e.g. 'MTA Subway · GTFS-realtime'
  live: boolean; // true = realtime feed, false = timetable simulation
  intervalMs: number;
  /** Return every train currently in service. `now` is epoch ms. May throw; the hub keeps the last good result. */
  poll(now: number): Promise<TrainState[]>;
}

export type AdapterFactory = (env: AdapterEnv) => Adapter[];
