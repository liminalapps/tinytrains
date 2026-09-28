// Shared contracts between the data build scripts, the live-data server and the client.
// All planar coordinates are meters in the city's local projection (see shared/geo.ts):
// +x = east, +y = north, origin = CityConfig.origin.

export type CityId =
  | 'nyc'
  | 'sf'
  | 'london'
  | 'paris'
  | 'berlin'
  | 'madrid'
  | 'tokyo'
  | 'seoul'
  | 'hongkong'
  | 'washington'
  | 'chicago'
  | 'boston'
  | 'mexicocity'
  | 'saopaulo'
  | 'moscow'
  | 'stockholm'
  | 'vienna'
  | 'helsinki'
  | 'amsterdam'
  | 'oslo'
  | 'cairo'
  | 'delhi'
  | 'shanghai'
  | 'beijing'
  | 'guangzhou'
  | 'shenzhen'
  | 'chengdu'
  | 'hangzhou'
  | 'wuhan'
  | 'chongqing'
  | 'osaka'
  | 'taipei'
  | 'singapore'
  | 'sydney'
  | 'budapest'
  | 'milan'
  | 'rome'
  | 'philadelphia';

/** Flat coordinate list: [x0, y0, x1, y1, ...] in meters. */
export type Flat = number[];

// ---------------------------------------------------------------------------
// Static transit network: public/data/{city}/transit.json
// ---------------------------------------------------------------------------

export interface TransitData {
  city: CityId;
  /** ISO date the data was built. */
  built: string;
  /** Attribution strings shown in the UI credits. */
  attribution: string[];
  systems: SystemDef[];
  lines: LineDef[];
  stations: StationDef[];
  segments: SegmentDef[];
}

export interface SystemDef {
  id: string; // e.g. 'nyc-subway', 'bart', 'tfl-tube', 'toei'
  name: string; // 'NYC Subway'
  /** 'realtime' when a live feed backs it, 'scheduled' when positions come from a timetable. */
  live: 'realtime' | 'scheduled';
}

export type LineKind = 'subway' | 'metro' | 'rail' | 'light' | 'tram' | 'cable' | 'monorail' | 'agt';
export type BulletShape = 'circle' | 'diamond' | 'roundel' | 'square' | 'pill' | 'bar';

export interface LineDef {
  id: string; // unique within the city, used by TrainState.line and SegmentDef.lines
  system: string; // SystemDef.id
  name: string; // 'A Eighth Avenue Express', 'Victoria', 'Asakusa Line'
  nameLocal?: string; // '浅草線'
  short: string; // bullet text, 1-3 chars: 'A', '7', 'A' (Toei letter), 'V' ... may be '' for bar-style lines
  color: string; // '#0039A6'
  textColor: string; // '#FFFFFF'
  kind: LineKind;
  bullet: BulletShape;
  stock: string; // default StockSpec.id for this line
}

export interface StationDef {
  id: string; // matches ids used in TrainState.stops[].s
  name: string;
  nameLocal?: string;
  x: number;
  y: number;
  lines: string[]; // LineDef ids serving this station
}

/**
 * Track geometry between two consecutive stops of at least one service pattern.
 * One entry per distinct (unordered) station pair + geometry. A train going from `to`
 * back to `from` uses the same entry reversed.
 */
export interface SegmentDef {
  from: string; // StationDef.id
  to: string; // StationDef.id
  lines: string[]; // LineDef ids that run over this stretch between these two stops
  pts: Flat; // polyline from `from` to `to`, first point at/near `from`, last at/near `to`
  /** Optional per-point level: -1 tunnel/underground, 0 at grade, 1 elevated/viaduct/bridge. Length = pts.length / 2. */
  el?: number[];
}

// ---------------------------------------------------------------------------
// Live train state: GET /api/{city}/trains
// ---------------------------------------------------------------------------

/** A stop on a train's timeline. Times are unix epoch SECONDS. */
export interface TimelineStop {
  s: string; // StationDef.id
  a: number; // arrival time (estimated)
  d: number; // departure time (estimated), >= a
}

export interface TrainState {
  /** Stable across polls for the same physical train/trip. Unique within the city. */
  id: string;
  line: string; // LineDef.id
  /** Destination display name (English/Latin). */
  dest: string;
  destLocal?: string; // e.g. '西馬込'
  /** Service type if meaningful: 'Express', 'Local', 'Rapid', 'Limited Express', 'Semi Express'... */
  service?: string;
  serviceLocal?: string; // '急行'
  /** Direction label for display: 'Uptown', 'Northbound', 'Outbound', 'Clockwise'... */
  dir?: string;
  stock: string; // StockSpec.id
  cars: number; // number of cars in the consist
  live: boolean; // true when derived from a realtime feed, false when simulated from a timetable
  delay?: number; // seconds late, when known (negative = early)
  label?: string; // run / train number to show, e.g. '1A 0931+ 242/SFY'
  /**
   * Ordered timeline. stops[0] is the station the train most recently departed (or is at),
   * followed by upcoming stops. Must contain at least 2 entries unless the train is dwelling
   * at a terminal. Consecutive stops should be connected by a SegmentDef.
   * Keep it short: previous stop + up to ~15 upcoming stops.
   */
  stops: TimelineStop[];
}

export interface SourceStatus {
  id: string; // adapter id
  name: string; // 'MTA Subway (GTFS-RT)'
  live: boolean;
  ok: boolean;
  updated: number; // epoch ms of last successful poll
  trains: number;
  error?: string;
}

export interface TrainsResponse {
  city: CityId;
  now: number; // server epoch ms when the response was sent
  recv?: number; // server epoch ms when the request arrived
  trains: TrainState[];
  sources: SourceStatus[];
}

// ---------------------------------------------------------------------------
// Geography: public/data/{city}/geo.json (+ buildings.bin)
// ---------------------------------------------------------------------------

/** Polygon = list of rings; ring 0 is the outer ring, the rest are holes. Each ring is a Flat list, unclosed. */
export type Polygon = Flat[];

export interface GeoData {
  city: CityId;
  /** The diorama extent in local meters. Everything is clipped to this. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  water: Polygon[]; // ocean, bays, rivers, lakes, reservoirs
  parks: Polygon[]; // parks, cemeteries, golf courses, nature reserves
  green?: Polygon[]; // wood / forest / grass landcover (non-park greenery)
  sand?: Polygon[]; // beaches
  airports?: Polygon[]; // aerodrome areas
  runways?: Polygon[]; // runway + taxiway surfaces
  roads: { k: 0 | 1 | 2 | 3; pts: Flat }[]; // k: 0 motorway, 1 trunk/primary, 2 secondary, 3 tertiary
  rail?: Flat[]; // other (non-modelled) railway lines, for texture
  labels: GeoLabel[];
}

export interface GeoLabel {
  text: string;
  local?: string; // native-script name if different (Tokyo)
  x: number;
  y: number;
  kind: 'city' | 'borough' | 'neighborhood' | 'water' | 'park' | 'island' | 'airport';
  rank: number; // lower = more important
}

/**
 * buildings.bin: little-endian Int16Array, stride 6 per building:
 *   [cx / 2, cy / 2, w * 2, d * 2, angle * 10000, h * 2]
 * cx, cy: center (meters, local projection); w, d: oriented box size (meters);
 * angle: rotation of the w axis from +x toward +y (radians, in [-PI/2, PI/2]); h: height (meters).
 */
export const BUILDING_STRIDE = 6;

// ---------------------------------------------------------------------------
// Rolling stock: shared/stock/{city}.ts exports `stock: StockSpec[]`
// ---------------------------------------------------------------------------

export type Hex = string; // '#RRGGBB'

export interface StockStripe {
  /** Band color, or 'line' to use the line's color (e.g. Tokyo line stripes, NYC route signs). */
  color: Hex | 'line';
  /** Vertical extent as fractions of the body side height, measured from the bottom (0) to the roof edge (1). */
  from: number;
  to: number;
}

export interface StockSpec {
  id: string; // 'nyc-r160', 'tfl-1972', 'toei-5500' ... prefix with the city id
  name: string; // 'R160'
  maker: string; // 'Alstom / Kawasaki'
  introduced: number; // year of first passenger service
  /** One short, accurate, charming fact. <= 140 chars. */
  blurb: string;

  // Real-world dimensions of ONE car, meters.
  length: number;
  width: number;
  height: number; // rail head to roof
  doors: number; // doors per side, per car

  profile: 'box' | 'tube' | 'rounded' | 'bilevel' | 'tram' | 'streetcar' | 'cablecar' | 'monorail' | 'agt';
  nose: 'flat' | 'slant' | 'rounded' | 'bullet';

  // Livery
  body: Hex; // main body color
  finish: 'paint' | 'stainless';
  roof: Hex;
  front: Hex; // cab-end mask / face color around the windshield
  doorColor: Hex;
  windowColor?: Hex; // default dark tinted glass
  skirt?: Hex; // band along the very bottom of the body side
  stripes?: StockStripe[];
  frontStripes?: StockStripe[]; // bands on the cab face (same fractional coords)
  pattern?: 'sinewave'; // special decoration (Marunouchi Line)
  /** Full-height color panel at both ends of every car side (e.g. BART's blue end panels). Width in meters. */
  endBand?: { color: Hex | 'line'; width: number };
  pantograph: boolean; // overhead-wire current collector on roof
  trolleyPole?: boolean; // streetcar pole
  /** For trams/LRVs: number of articulated body sections that make up one 'car'. */
  sections?: number;
}
