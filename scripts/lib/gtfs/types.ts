// Config interface of the GTFS kit (see docs/KIT_GTFS.md). Keep it stable: other cities' build scripts use it.
import type { BulletShape, CityId, LineKind, SystemDef } from '../../../shared/types.ts';
import type { StockMix } from '../../../server/adapters/gtfs/schedule.ts';

export type { StockMix };

/** A raw GTFS row: column name -> value. */
export type Row = Record<string, string>;

export interface FeedConfig {
  /** Short id; also the cache file name (.cache/<city>/<id>.zip) unless `file` is given. */
  id: string;
  /** Zip URL, or a local path to a zip. */
  url: string;
  headers?: Record<string, string>;
  file?: string;
}

export interface RouteMatch {
  feed?: string;
  routeId?: string | string[];
  shortName?: string | string[] | RegExp;
  longName?: RegExp;
  /** Basic GTFS route types; extended types (400 metro, 900 tram, 109 suburban rail…) are normalized first. */
  routeType?: number | number[];
  /** agency_id or agency_name. */
  agency?: string | RegExp;
  test?: (route: Row) => boolean;
}

export interface LineConfig {
  id: string;
  system: string;
  match: RouteMatch;
  name: string;
  nameLocal?: string;
  short: string;
  /** Defaults to route_color / route_text_color. */
  color?: string;
  textColor?: string;
  kind: LineKind;
  bullet: BulletShape;
  /** A stock id, or a mix shared out by trip in proportion to `share`. The first entry is the line's default stock. */
  stock: string | StockMix[];
  /** OSM railway=* values of the line's track, for levels and OSM geometry. Default by kind. */
  osm?: string[];
  /**
   * OSM route relation ids of the line: OSM routing and levels then use only their ways, so a line stacked over or
   * under another one (viaduct above a tunnel) doesn't snap to the other line's track.
   */
  osmRelations?: number[];
  geometry?: GeometrySource;
}

export type GeometrySource = 'auto' | 'shapes' | 'osm' | 'straight';

export interface StationConfig {
  /** Station ids are `${idPrefix}:${key}`. Default: the city id. */
  idPrefix?: string;
  /**
   * 'parent' (default): stops group under parent_station; without one, IFOPT-style ids ('at:49:1000:0:1') group by
   * their stop area ('at:49:1000'), anything else by normalized name within 400 m. A function returns your own key.
   */
  group?: 'parent' | 'name' | ((stop: Row) => string);
  /** Lines whose platforms lie further apart than this (m) within a group become separate stations. Default 120. */
  maxSpread?: number;
  name?: (name: string, stop: Row) => string;
  nameLocal?: (name: string, stop: Row) => string | undefined;
}

export interface GeometryConfig {
  source?: GeometrySource;
  /** Track levels (el) from OSM tunnel/bridge/layer tags. Default true. */
  levels?: boolean;
  /** Custom Overpass QL body (without [out:json] and the output statement) if the default railway query misses track. */
  overpass?: string;
  /** Max stop-to-track distance accepted, m. Default 150. */
  snap?: number;
  /**
   * 'merge': between two stations, fold other geometry variants into the most-used one when they share a line or are
   * the same kind (parallel platform tracks and shape variants otherwise draw as a fan of ribbons). Tram variants
   * always stay (one-way streets, different routes). Default 'merge'.
   */
  variants?: 'keep' | 'merge';
  /** Only merge variants that run within this many meters of each other (separate alignments stay). Default 150. */
  mergeWithin?: number;
}

export interface TripStop {
  stopId: string;
  station: string;
  name: string;
  a: number;
  d: number;
  /** stop_headsign at this stop, if the feed has one. */
  headsign?: string;
}

export interface TripInfo {
  feed: string;
  route: Row;
  trip: Row;
  line: string;
  /** Stops inside the clip area, merged per station, times in seconds after the service day's noon-minus-12h. */
  stops: TripStop[];
  /** The whole trip, before clipping. */
  allStops: { stopId: string; name: string; a: number; d: number }[];
  /** The trip passes stations that other trips of the line serve between two of its stops. */
  skips: boolean;
}

export interface TripHooks {
  /** Early filter on the raw trip, before stations are built (drop replacement buses and the like here). */
  keepTrip?: (t: { feed: string; route: Row; trip: Row; stopIds: string[] }) => boolean;
  keep?: (t: TripInfo) => boolean;
  dest?: (t: TripInfo) => string;
  destLocal?: (t: TripInfo) => string | undefined;
  dir?: (t: TripInfo) => string | undefined;
  /**
   * Destination / direction from stop i of t.stops onward, for trips whose sign changes on the way (loop services).
   * Default for destAt: stop_headsign when it varies along the trip.
   */
  destAt?: (t: TripInfo, i: number) => string | undefined;
  dirAt?: (t: TripInfo, i: number) => string | undefined;
  service?: (t: TripInfo) => string | undefined;
  serviceLocal?: (t: TripInfo) => string | undefined;
  label?: (t: TripInfo) => string | undefined;
  consist?: (t: TripInfo) => StockMix | undefined;
  rtKey?: (t: TripInfo) => string | undefined;
  /**
   * Join trips that share a block_id and service when the next one starts at the station the previous one ended,
   * within this many minutes (through-running split at a terminus, e.g. Sydney Trains at Central). The train keeps
   * one id; its destination changes where the second trip begins. Off by default; `true` means 15 minutes.
   */
  chainBlocks?: boolean | number;
}

export interface GtfsCityConfig {
  city: CityId;
  feeds: FeedConfig[];
  systems: SystemDef[];
  lines: LineConfig[];
  routes?: { match: RouteMatch; line: (route: Row) => Omit<LineConfig, 'match'> | null };
  stations?: StationConfig;
  geometry?: GeometryConfig;
  clip?: 'bbox' | ((lon: number, lat: number) => boolean);
  trips?: TripHooks;
  realtimeKeys?: boolean;
  /** Keep only service dates from today + from to today + to (days). */
  days?: { from: number; to: number };
  attribution: string[];
  out?: { transit?: string; schedule?: string };
}
