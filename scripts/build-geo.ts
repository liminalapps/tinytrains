// Bakes public/data/{city}/geo.json + buildings.bin from OpenFreeMap vector tiles (OpenMapTiles schema).
// Usage: npx tsx scripts/build-geo.ts [city...] [--no-density] [--geo-only] [--offline]
//   --geo-only: write geo.json only (no buildings.bin, no density.bin); --offline: fail instead of downloading tiles.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { VectorTile, classifyRings, type VectorTileFeature } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { CITIES, CITY_ORDER } from '../shared/cities.ts';
import { cityBounds, makeProjection } from '../shared/geo.ts';
import { BUILDING_STRIDE, type CityId, type Flat, type GeoData, type GeoLabel, type Polygon } from '../shared/types.ts';

type BBox = [number, number, number, number]; // west, south, east, north

/** Areas that get buildings and tertiary roads. */
const CORE: Record<CityId, BBox[]> = {
  nyc: [
    [-74.025, 40.698, -73.955, 40.772], // Lower Manhattan + Midtown
    [-73.995, 40.765, -73.925, 40.88], // Upper Manhattan
    [-74.02, 40.665, -73.93, 40.735], // Downtown Brooklyn, DUMBO, Red Hook, Williamsburg, Greenpoint
    [-73.965, 40.735, -73.915, 40.765], // Long Island City
    [-74.065, 40.705, -74.018, 40.76], // Jersey City waterfront + Hoboken
  ],
  sf: [
    [-122.515, 37.705, -122.355, 37.812], // San Francisco
    [-122.3, 37.79, -122.25, 37.83], // Downtown Oakland
  ],
  london: [
    [-0.235, 51.46, -0.02, 51.56], // Zones 1-2
    [-0.04, 51.485, 0.015, 51.515], // Canary Wharf, Greenwich Peninsula
  ],
  paris: [
    [2.25, 48.815, 2.416, 48.902], // Inside the Périphérique
    [2.222, 48.882, 2.256, 48.9], // La Défense
  ],
  berlin: [
    [13.278, 52.463, 13.482, 52.556], // Inside the Ringbahn, incl. Kreuzberg, Friedrichshain, Prenzlauer Berg
  ],
  madrid: [
    [-3.738, 40.381, -3.655, 40.468], // Inside the M-30
    [-3.705, 40.44, -3.672, 40.482], // Azca, Castellana north to Plaza de Castilla and the Cuatro Torres
  ],
  tokyo: [
    [139.685, 35.615, 139.8, 35.74], // Inside and around the Yamanote loop
    [139.76, 35.61, 139.81, 35.665], // Odaiba, Toyosu
  ],
  seoul: [
    [126.955, 37.54, 127.025, 37.592], // Jongno, Jung-gu, Seoul Station, Namsan
    [126.905, 37.513, 126.95, 37.537], // Yeouido
    [127.015, 37.49, 127.068, 37.518], // Gangnam, Teheran-ro to COEX
  ],
  hongkong: [
    [114.12, 22.255, 114.245, 22.297], // Hong Kong Island north shore, Kennedy Town to Chai Wan
    [114.152, 22.292, 114.195, 22.34], // Kowloon: Tsim Sha Tsui, Mong Kok, Kowloon Tong
  ],
  washington: [
    [-77.075, 38.865, -76.98, 38.93], // Downtown, the Mall, Capitol Hill, Georgetown, Dupont Circle, Navy Yard
    [-77.09, 38.85, -77.045, 38.9], // Rosslyn, the Pentagon, Pentagon City, Crystal City
  ],
  chicago: [[-87.685, 41.845, -87.595, 41.925]], // The Loop, River North, Streeterville, West Loop, South Loop, Lincoln Park
  boston: [[-71.125, 42.33, -71.02, 42.378]], // Downtown, Back Bay, Beacon Hill, North End, Seaport, South End, Cambridge to Harvard
  mexicocity: [[-99.215, 19.395, -99.12, 19.45]], // Centro Histórico, Reforma, Roma, Condesa, Chapultepec, Polanco
  saopaulo: [[-46.705, -23.605, -46.625, -23.535]], // Centro, Paulista, Jardins, Pinheiros, Itaim Bibi, Vila Olímpia
  moscow: [[37.535, 55.705, 37.715, 55.795]], // Inside the Third Ring, incl. Moscow City
  stockholm: [[17.99, 59.305, 18.11, 59.35]], // Gamla Stan, Norrmalm, Östermalm, Södermalm, Kungsholmen, Vasastan
  vienna: [[16.325, 48.178, 16.42, 48.24]], // Innere Stadt, inside the Gürtel, Leopoldstadt, Prater, Donau City
  helsinki: [[24.895, 60.145, 25.0, 60.2]], // Kamppi, Kruununhaka, Töölö, Kallio, Pasila, Kalasatama
  amsterdam: [[4.855, 52.335, 4.95, 52.39]], // Canal ring, Jordaan, De Pijp, Oost, Noord's IJ bank, Zuidas
  oslo: [[10.69, 59.9, 10.79, 59.94]], // Sentrum, Bjørvika, Aker Brygge, Frogner, Grünerløkka, Gamle Oslo
  cairo: [
    [31.19, 30.02, 31.27, 30.075], // Downtown, Zamalek, Garden City, Islamic Cairo, Dokki, Mohandessin
    [31.12, 29.97, 31.14, 29.985], // Giza pyramids
  ],
  delhi: [[77.18, 28.6, 77.25, 28.67]], // Connaught Place, Lutyens' Delhi, India Gate, Old Delhi, Red Fort
  shanghai: [[121.43, 31.19, 121.53, 31.25]], // The Bund, People's Square, Jing'an, Xintiandi, Xujiahui, Lujiazui
  beijing: [[116.345, 39.855, 116.48, 39.95]], // Inside the 2nd Ring Road, CBD
  guangzhou: [[113.24, 23.095, 113.345, 23.145]], // Yuexiu, Zhujiang New Town, Canton Tower
  shenzhen: [[113.92, 22.51, 114.13, 22.56]], // Nanshan, Futian CBD, Luohu
  chengdu: [[104.02, 30.615, 104.11, 30.7]], // Inside the 2nd Ring Road
  hangzhou: [[120.13, 30.23, 120.22, 30.3]], // West Lake's east shore, Wulin, Qianjiang New City
  wuhan: [[114.25, 30.53, 114.35, 30.61]], // Hankou, Hanyang, Wuchang at the confluence
  chongqing: [[106.52, 29.535, 106.6, 29.585]], // Yuzhong peninsula, Jiangbei and Nan'an riverfronts
  osaka: [[135.48, 34.64, 135.535, 34.71]], // Umeda, Nakanoshima, Honmachi, Namba, Tennoji, Osaka Castle
  taipei: [[121.5, 25.02, 121.575, 25.065]], // Taipei Main Station, Ximending, Zhongshan, Da'an, Xinyi
  singapore: [[103.815, 1.265, 103.875, 1.31]], // Downtown Core, Marina Bay, Chinatown, Orchard, Bugis
  sydney: [[151.18, -33.9, 151.23, -33.83]], // CBD, The Rocks, Darling Harbour, Pyrmont, Surry Hills, North Sydney
  prague: [[14.40, 50.075, 14.45, 50.095]], // Old Town, Malá Strana, the Castle, Wenceslas Square
  naples: [[14.235, 40.83, 14.275, 40.86]], // Centro Storico, Toledo, Chiaia, the port
  barcelona: [[2.15, 41.375, 2.195, 41.405]], // Ciutat Vella, Eixample, Sagrada Família
  lisbon: [[-9.16, 38.705, -9.125, 38.73]], // Baixa, Chiado, Alfama, Bairro Alto
  istanbul: [[28.95, 41.0, 29.0, 41.045]], // Sultanahmet, Eminönü, Karaköy, Beyoğlu
  montreal: [[-73.59, 45.495, -73.55, 45.52]], // Downtown, Old Montreal, the Plateau's edge
  dubai: [[55.26, 25.18, 55.30, 25.21]], // Downtown, Burj Khalifa, Business Bay
  budapest: [[19.03, 47.485, 19.085, 47.52]], // Belváros, Lipótváros, Castle Hill, Parliament, Terézváros, Erzsébetváros
  milan: [[9.16, 45.45, 9.215, 45.49]], // Duomo, Brera, Porta Nuova, Centrale, Porta Venezia
  rome: [[12.455, 41.88, 12.51, 41.91]], // Centro Storico, Vatican, Trastevere, Termini, Colosseum
  philadelphia: [[-75.185, 39.94, -75.14, 39.965]], // Center City, Old City, Rittenhouse, Logan Square
};

/**
 * Famous places the tiles carry no label point for (tidal straits, small islands, regions), or only minor ones
 * (a numbered subdivision, a park too big to count as one). These win over tile labels of the same name.
 * Water labels are only used when the point is on water, the others only when it is on land.
 * Coordinates are WGS84 like OSM; Chinese web maps (and many quoted coordinates) use GCJ-02, 300-700 m off.
 */
const EXTRA_LABELS: Record<CityId, { text: string; local?: string; kind: GeoLabel['kind']; at: [number, number]; rank: number }[]> = {
  washington: [],
  budapest: [],
  prague: [],
  naples: [],
  barcelona: [],
  lisbon: [],
  istanbul: [],
  montreal: [],
  dubai: [],
  milan: [],
  rome: [],
  philadelphia: [],
  chicago: [{ text: 'Lake Michigan', kind: 'water', at: [-87.575, 41.95], rank: 0 }],
  boston: [],
  mexicocity: [
    { text: 'Centro Histórico', kind: 'neighborhood', at: [-99.1332, 19.4326], rank: 3 },
    { text: 'Bosque de Chapultepec', kind: 'park', at: [-99.19, 19.42], rank: 2 },
  ],
  saopaulo: [
    { text: 'Guarapiranga Reservoir', kind: 'water', at: [-46.72, -23.69], rank: 2 },
    { text: 'Billings Reservoir', kind: 'water', at: [-46.645, -23.712], rank: 2 },
    { text: 'Avenida Paulista', kind: 'neighborhood', at: [-46.6558, -23.5614], rank: 3 },
  ],
  moscow: [{ text: 'Kremlin', local: 'Кремль', kind: 'neighborhood', at: [37.6175, 55.7515], rank: 3 }],
  stockholm: [
    { text: 'Lake Mälaren', kind: 'water', at: [17.905, 59.305], rank: 0 },
    { text: 'Gamla Stan', kind: 'neighborhood', at: [18.0707, 59.3251], rank: 3 },
  ],
  vienna: [],
  helsinki: [{ text: 'Gulf of Finland', kind: 'water', at: [24.95, 60.13], rank: 0 }],
  amsterdam: [{ text: 'IJmeer', kind: 'water', at: [5.04, 52.38], rank: 1 }],
  oslo: [{ text: 'Oslofjord', kind: 'water', at: [10.68, 59.875], rank: 0 }],
  cairo: [
    { text: 'Pyramids of Giza', local: 'أهرامات الجيزة', kind: 'park', at: [31.1342, 29.9792], rank: 2 },
    { text: 'Tahrir Square', local: 'ميدان التحرير', kind: 'neighborhood', at: [31.2357, 30.0444], rank: 3 },
  ],
  delhi: [],
  osaka: [
    { text: 'Osaka Bay', local: '大阪湾', kind: 'water', at: [135.37, 34.62], rank: 0 },
    { text: 'Umeda', local: '梅田', kind: 'neighborhood', at: [135.4983, 34.7025], rank: 3 },
    { text: 'Namba', local: '難波', kind: 'neighborhood', at: [135.5013, 34.6666], rank: 3 },
    { text: 'Dotonbori', local: '道頓堀', kind: 'neighborhood', at: [135.5018, 34.6687], rank: 3 },
    { text: 'Shinsekai', local: '新世界', kind: 'neighborhood', at: [135.5063, 34.6525], rank: 3 },
    { text: 'Senri-Chuo', local: '千里中央', kind: 'neighborhood', at: [135.4945, 34.8095], rank: 3 },
  ],
  taipei: [],
  singapore: [
    { text: 'Singapore Strait', kind: 'water', at: [103.9, 1.24], rank: 0 },
    { text: 'Straits of Johor', kind: 'water', at: [103.75, 1.44], rank: 1 },
    { text: 'Marina Bay', kind: 'water', at: [103.8575, 1.2835], rank: 2 },
  ],
  sydney: [
    { text: 'Tasman Sea', kind: 'water', at: [151.297, -33.9], rank: 0 },
    { text: 'Botany Bay', kind: 'water', at: [151.19, -33.975], rank: 1 },
  ],
  shanghai: [
    { text: 'The Bund', local: '外滩', kind: 'neighborhood', at: [121.486, 31.2403], rank: 3 },
    { text: "People's Square", local: '人民广场', kind: 'neighborhood', at: [121.47, 31.2315], rank: 3 },
  ],
  beijing: [
    { text: 'Forbidden City', local: '故宫', kind: 'neighborhood', at: [116.3908, 39.9173], rank: 3 },
    { text: 'Tiananmen Square', local: '天安门广场', kind: 'neighborhood', at: [116.3914, 39.9027], rank: 3 },
    { text: 'Summer Palace', local: '颐和园', kind: 'park', at: [116.2692, 39.9983], rank: 2 },
    { text: 'Beihai Park', local: '北海公园', kind: 'park', at: [116.3825, 39.925], rank: 3 },
  ],
  guangzhou: [],
  shenzhen: [{ text: 'Shenzhen Bay', local: '深圳湾', kind: 'water', at: [113.97, 22.495], rank: 1 }],
  chengdu: [],
  hangzhou: [],
  wuhan: [],
  chongqing: [{ text: 'Chaotianmen', local: '朝天门', kind: 'neighborhood', at: [106.5843, 29.5645], rank: 3 }],

  nyc: [
    { text: 'East River', kind: 'water', at: [-73.966, 40.744], rank: 0 },
    { text: 'Liberty Island', kind: 'island', at: [-74.0445, 40.6897], rank: 3 },
  ],
  sf: [
    { text: 'Pacific Ocean', kind: 'water', at: [-122.51, 37.38], rank: 0 },
    { text: 'Golden Gate', kind: 'water', at: [-122.478, 37.818], rank: 1 },
    { text: 'Alcatraz Island', kind: 'island', at: [-122.4229, 37.8267], rank: 3 },
  ],
  london: [],
  paris: [
    { text: 'Île de la Cité', kind: 'island', at: [2.3468, 48.8556], rank: 3 },
    { text: 'Île Saint-Louis', kind: 'island', at: [2.3567, 48.8517], rank: 3 },
  ],
  berlin: [{ text: 'Spree', kind: 'water', at: [13.3882, 52.5221], rank: 1 }],
  madrid: [{ text: 'Casa de Campo', kind: 'park', at: [-3.757, 40.418], rank: 2 }],
  tokyo: [{ text: 'Tokyo Bay', local: '東京湾', kind: 'water', at: [139.87, 35.57], rank: 0 }],
  seoul: [
    { text: 'Namsan', local: '남산', kind: 'park', at: [126.9882, 37.5512], rank: 3 },
    { text: 'Myeong-dong', local: '명동', kind: 'neighborhood', at: [126.9857, 37.5636], rank: 3 },
    { text: 'Hongdae', local: '홍대', kind: 'neighborhood', at: [126.9236, 37.5563], rank: 3 },
  ],
  hongkong: [
    { text: 'Victoria Harbour', local: '維多利亞港', kind: 'water', at: [114.172, 22.2885], rank: 0 },
    { text: 'Kowloon', local: '九龍', kind: 'borough', at: [114.1825, 22.3175], rank: 1 },
    { text: 'New Territories', local: '新界', kind: 'borough', at: [114.13, 22.41], rank: 1 },
  ],
};

/** Corrections for wrong or clumsy English names in the source data, keyed by the native or the English name. */
const NAME_FIXES: Record<string, string> = {
  上野公園: 'Ueno Park',
  한강: 'Han River',
  중구: 'Jung-gu',
  동작구: 'Dongjak',
  마포구: 'Mapo',
  'Deep Bay - Shenzhen Bay': 'Deep Bay',
  'parc of Sceaux': 'Parc de Sceaux',
  'Hill of Uncle Pius': 'Cerro del Tío Pío',
  'Trade Fair Moscow, All-Russia Exhibition Centre': 'VDNKh',
  'Tsaritsyno Park + palace': 'Tsaritsyno',
  'Preobrazenskoe cementery': 'Preobrazhenskoye Cemetery',
  'Tyoply Stan landspace reserve': 'Tyoply Stan Nature Reserve',
  'Kolomenskoe open-air museum': 'Kolomenskoye',
  'Kuzminki Lyublino park': 'Kuzminki Park',
  'Moscow Botanical Garden of Academy of Sciences': 'Main Botanical Garden',
  'Yugo-Zapadniy forrest park': 'Yugo-Zapadny Forest Park',
  'Raj Ghat and associated memorials': 'Raj Ghat',
  "Tsurumiryokuchi Expo '90 Commemorative Park": 'Tsurumi Ryokuchi Park',
  'Royal Botanic Gardens, Sydney': 'Royal Botanic Garden',
  'Arlington House, The Robert E. Lee Memorial': 'Arlington House',
  'Downtown Washington': 'Downtown',
  'The North Trunk of Dong River': 'Dong River',
  'Chang Jiang': 'Yangtze River',
  'Chicago Loop': 'The Loop',
  'Gezira-Zamalek': 'Gezira Island',
  'Vantaa River': 'Vantaanjoki',
  'Fifteenth Of May': '15th of May City',
  堺区: 'Sakai Ward', // a ward of Sakai city, not of Osaka; 'Sakai' is the city
  'Al Roda Island': 'Roda Island',
  'Mission Hills Golf Club Shenzhen Clubhouse': 'Mission Hills Golf Club',
  'Cemetery of 72 Martyrs of Yellow Flower Mound': 'Huanghuagang Mausoleum',
};

/** Features too small or too man-made to name on the map. */
const MINOR_WATER = /fountain|pool|pond|basin|dock|darse|reflecting|waterfall|moat|\bslip\b|marina|aqueduct|drainage|\bdrain\b|flood relief/i;
const MINOR_PARK = /fountain|terrace|lawn|playground|plaza|\bpool\b|roof garden|community garden|nectar garden|stadium|dog run|driving range|grill|\bbbq\b|barbecue|resting area|^site$|^pit \d|\bsection [a-z\d]+$/i;
/** Housing estates and development zones tagged as places. */
const MINOR_PLACE = /^(ZAC|ZI|ZA|Résidence|Lotissement|Urbanizaci[oó]n(es)?|Residencial|Pol[ií]gono|Unidad Habitacional|Sector \d|Block [A-Z\d]|Pocket \d|Phase \d)/;
const MINOR_ISLAND = /\b(Rocks?|Ledge|Reef)$/i;
/** Ranks for labels whose translations overstate them (a small Oslo bay carrying the fjord's 44 names). */
const RANK_FIXES: Partial<Record<CityId, Record<string, number>>> = {
  oslo: { Bispevika: 3 },
  nyc: { 'Lower Manhattan': 4 }, // a region name; at rank 3 it crowds out Tribeca
  sydney: { 'Darling Harbour': 2, 'Sydney Harbour': 0 },
  hangzhou: { 'West Lake': 1 },
  guangzhou: { 'Lijiao Waterway': 2, 'Dong River': 2, 'Liuxi River': 1 },
  beijing: { 'Yongding River': 1 },
  chongqing: { Jiefangbei: 3 },
  amsterdam: { IJ: 1 },
  vienna: { 'New Danube': 2 },
  helsinki: { Vanhankaupunginselkä: 3 },
  chicago: { 'Grant Park': 3, 'Midway Airport': 2 },
  cairo: { 'Roda Island': 3 },
  boston: { 'Logan Airport': 2 },
  shanghai: { 'Hongqiao Airport': 2 },
  taipei: { 'Songshan Airport': 2 },
  osaka: { 'Itami Airport': 2 },
  // Rivers dammed into the southern reservoirs count as wide water; the Tietê is the city's river.
  saopaulo: { 'Rio Grande': 3, 'Rio Embu Mirim': 3, 'Rio Tietê': 1, 'Congonhas Airport': 2 },
  washington: { 'Reagan National Airport': 2 },
};
/** Place points that aren't places. */
const SKIP_NAMES = new Set([
  'Indigenous peoples of Mexico City',
  'Kranji Resevoir Park B',
  'National Mall and Memorial Parks',
  'Río Nilo', // a Nile branch without an English name
  'Rhoda Island', // tagged on Manial, the island's north end; 'Al Roda Island' names the whole island
]);

/** Short, friendly airport names by IATA code. */
const AIRPORT_NAMES: Record<string, string> = {
  JFK: 'JFK Airport', LGA: 'LaGuardia Airport', EWR: 'Newark Airport', SFO: 'SFO', OAK: 'Oakland Airport', SJC: 'San José Airport',
  LHR: 'Heathrow', LCY: 'London City Airport', HND: 'Haneda Airport',
  CDG: 'Charles de Gaulle Airport', ORY: 'Orly Airport', LBG: 'Le Bourget Airport', BER: 'Berlin Brandenburg Airport', MAD: 'Madrid-Barajas Airport',
  DCA: 'Reagan National Airport', ORD: "O'Hare Airport", MDW: 'Midway Airport', BOS: 'Logan Airport', MEX: 'Mexico City Airport',
  CGH: 'Congonhas Airport', GRU: 'Guarulhos Airport', BMA: 'Bromma Airport', VIE: 'Vienna Airport', HEL: 'Helsinki Airport', AMS: 'Schiphol',
  CAI: 'Cairo Airport', DEL: 'Delhi Airport', PVG: 'Pudong Airport', SHA: 'Hongqiao Airport', PEK: 'Beijing Capital Airport',
  CAN: 'Baiyun Airport', SZX: "Bao'an Airport", CTU: 'Shuangliu Airport', WUH: 'Tianhe Airport', CKG: 'Jiangbei Airport',
  ITM: 'Itami Airport', TSA: 'Songshan Airport', SIN: 'Changi Airport', XSP: 'Seletar Airport', SYD: 'Sydney Airport',
};

/**
 * Native-script names for `GeoLabel.local`: Japanese, Korean, Chinese (Traditional in Hong Kong and Taipei, Simplified
 * on the mainland and in Singapore), Russian, Arabic and Hindi. Hong Kong's `name` is bilingual ('中環 Central'), so its `name:zh` only
 * counts when `name` is too; Shenzhen features without that are in Simplified Chinese.
 */
function nativeName(city: CityId, p: Record<string, unknown>): string | undefined {
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined);
  /** v, when it's written in the given script and carries no Latin. */
  const only = (v: string | undefined, script: RegExp) => (v && script.test(v) && !/[A-Za-z]/.test(v) ? v : undefined);
  switch (city) {
    case 'tokyo':
      return s('name:ja') || s('name');
    case 'osaka':
      return only(s('name:ja') || s('name'), /[\u3040-\u30ff\u4e00-\u9fff]/);
    case 'seoul': {
      const ko = s('name:ko') || s('name');
      return ko && /[\uac00-\ud7af]/.test(ko) ? ko : undefined;
    }
    case 'hongkong': {
      const zh = s('name:zh-Hant') || (/[A-Za-z]/.test(s('name') ?? '') ? s('name:zh') : undefined);
      return zh && /[\u4e00-\u9fff]/.test(zh) && !/[A-Za-z]/.test(zh) ? zh : undefined;
    }
    case 'taipei':
      return only(s('name:zh-Hant') || s('name:zh') || s('name'), /[\u4e00-\u9fff]/);
    case 'shanghai':
    case 'beijing':
    case 'guangzhou':
    case 'shenzhen':
    case 'chengdu':
    case 'hangzhou':
    case 'wuhan':
    case 'chongqing':
      return only(s('name:zh-Hans') || s('name:zh') || s('name'), /[\u4e00-\u9fff]/);
    case 'singapore':
      return only(s('name:zh-Hans') || s('name:zh'), /[\u4e00-\u9fff]/);
    case 'moscow':
      return only(s('name:ru') || s('name'), /[\u0400-\u04ff]/);
    case 'cairo':
      return only(s('name:ar') || s('name'), /[\u0600-\u06ff]/);
    case 'delhi':
      return only(s('name:hi'), /[\u0900-\u097f]/);
  }
  return undefined;
}

/** Name keys that say nothing about how well known a place is: Hong Kong names everything in both official languages. */
const FAME_SKIP: Partial<Record<CityId, string[]>> = { hongkong: ['name:en', 'name:zh', 'name:zh-Hant', 'name:zh-Hans'] };

/** Cities whose neighborhoods and districts only show up in z14 tiles: read those over the whole map, not just the core. */
const Z14_PLACES = new Set<CityId>(['seoul', 'madrid']);
const WARD_CITIES = new Set<CityId>(['osaka', 'taipei', 'shanghai', 'beijing', 'guangzhou', 'shenzhen', 'chengdu', 'hangzhou', 'wuhan', 'chongqing']);

/** Neighborhoods farther than this from the initial view rank 4 or lower (villages at the edge of the map). */
const OUTSKIRTS = 10_000;
/** How many of the best-known neighborhoods inside OUTSKIRTS rank 3 at least. */
const TOP_HOODS = 20;

const argv = process.argv.slice(2);
const GEO_ONLY = argv.includes('--geo-only');
const OFFLINE = argv.includes('--offline');

const POLY_Z = 13;
const BUILDING_Z = 14;
const EXT = 4096;
const CONCURRENCY = 6;
const MAX_LABELS = 300;
const LABEL_ZOOMS = [10, 11, 12];
const MAX_BUILDINGS = 250_000;

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

let tileUrl = '';
async function tileTemplate(): Promise<string> {
  if (tileUrl) return tileUrl;
  const p = '.cache/geo/tilejson.json';
  if (!existsSync(p)) {
    mkdirSync(dirname(p), { recursive: true });
    const r = await fetch('https://tiles.openfreemap.org/planet');
    if (!r.ok) throw new Error(`TileJSON HTTP ${r.status}`);
    writeFileSync(p, await r.text());
  }
  tileUrl = JSON.parse(readFileSync(p, 'utf8')).tiles[0];
  return tileUrl;
}

const tilePath = (z: number, x: number, y: number) => `.cache/tiles/${z}/${x}/${y}.pbf`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(z: number, x: number, y: number) {
  const url = (await tileTemplate()).replace('{z}', `${z}`).replace('{x}', `${x}`).replace('{y}', `${y}`);
  const p = tilePath(z, x, y);
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'tiny-trains-geo-bake/0.1 (one-off build, cached)' } });
      let buf = Buffer.alloc(0);
      if (r.ok) buf = Buffer.from(await r.arrayBuffer());
      else if (r.status !== 404 && r.status !== 204) throw new Error(`HTTP ${r.status} for ${url}`);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(`${p}.tmp`, buf.length ? gzipSync(buf) : buf);
      renameSync(`${p}.tmp`, p);
      return;
    } catch (e) {
      if (attempt >= 5) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

async function ensureTiles(z: number, tiles: [number, number][]) {
  const missing = tiles.filter(([x, y]) => !existsSync(tilePath(z, x, y)));
  if (!missing.length) return;
  if (OFFLINE) throw new Error(`--offline: ${missing.length} z${z} tiles are not cached`);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < missing.length) {
      const [x, y] = missing[next++];
      await download(z, x, y);
      if (++done % 100 === 0) console.log(`    z${z}: ${done}/${missing.length} tiles downloaded`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
  console.log(`    z${z}: downloaded ${missing.length} tiles`);
}

function readTile(z: number, x: number, y: number): VectorTile | null {
  let buf: Buffer = readFileSync(tilePath(z, x, y));
  if (!buf.length) return null;
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  return new VectorTile(new PbfReader(buf));
}

// Global pixel space at zoom z: EXT units per tile, y down.
const lonToPx = (lon: number, z: number) => ((lon + 180) / 360) * EXT * 2 ** z;
function latToPx(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * EXT * 2 ** z;
}
const pxToLon = (x: number, z: number) => (x / (EXT * 2 ** z)) * 360 - 180;
const pxToLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (EXT * 2 ** z)))) * 180) / Math.PI;

/** [x0, y0, x1, y1] in global px. */
type Rect = [number, number, number, number];
const bboxToPx = ([w, s, e, n]: BBox, z: number): Rect => [lonToPx(w, z), latToPx(n, z), lonToPx(e, z), latToPx(s, z)];

function tilesInRect([x0, y0, x1, y1]: Rect): [number, number][] {
  const out: [number, number][] = [];
  for (let ty = Math.floor(y0 / EXT); ty <= Math.floor((y1 - 1e-6) / EXT); ty++)
    for (let tx = Math.floor(x0 / EXT); tx <= Math.floor((x1 - 1e-6) / EXT); tx++) out.push([tx, ty]);
  return out;
}

function rectIntersect(a: Rect, b: Rect): Rect | null {
  const r: Rect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[0] < r[2] && r[1] < r[3] ? r : null;
}

const inRect = (x: number, y: number, r: Rect) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];

/** Feature geometry in global px. Rings are unclosed flat arrays. */
function featurePx(f: VectorTileFeature, tx: number, ty: number): number[][] {
  const s = EXT / f.extent;
  const ox = tx * EXT;
  const oy = ty * EXT;
  return f.loadGeometry().map((ring) => {
    const a: number[] = [];
    for (const p of ring) a.push(ox + p.x * s, oy + p.y * s);
    return a;
  });
}

/** Polygons (outer ring first, then holes) in global px. Outer rings get positive shoelace area (y down), holes negative. */
function featurePolygonsPx(f: VectorTileFeature, tx: number, ty: number): number[][][] {
  const s = EXT / f.extent;
  const ox = tx * EXT;
  const oy = ty * EXT;
  return classifyRings(f.loadGeometry()).map((poly) =>
    poly.map((ring, i) => {
      const a: number[] = [];
      for (const p of ring) a.push(ox + p.x * s, oy + p.y * s);
      if (a.length >= 4 && a[0] === a[a.length - 2] && a[1] === a[a.length - 1]) a.length -= 2;
      const area = ringArea(a);
      if ((i === 0) !== area > 0) reverseRing(a);
      return a;
    }),
  );
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function ringArea(r: number[]): number {
  let a = 0;
  const n = r.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) a += r[j] * r[i + 1] - r[i] * r[j + 1];
  return a / 2;
}

function reverseRing(r: number[]) {
  for (let i = 0, j = r.length - 2; i < j; i += 2, j -= 2) {
    [r[i], r[j]] = [r[j], r[i]];
    [r[i + 1], r[j + 1]] = [r[j + 1], r[i + 1]];
  }
}

function ringBBox(r: number[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < r.length; i += 2) {
    if (r[i] < x0) x0 = r[i];
    if (r[i] > x1) x1 = r[i];
    if (r[i + 1] < y0) y0 = r[i + 1];
    if (r[i + 1] > y1) y1 = r[i + 1];
  }
  return [x0, y0, x1, y1];
}

function pointInRing(x: number, y: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Intersection of segment a-b with the line axis=v. Computed in a canonical order so both neighbors of a tile edge get identical numbers. */
function cut(ax: number, ay: number, bx: number, by: number, axis: 0 | 1, v: number): [number, number] {
  if (ax > bx || (ax === bx && ay > by)) [ax, ay, bx, by] = [bx, by, ax, ay];
  if (axis === 0) return [v, ay + ((v - ax) / (bx - ax)) * (by - ay)];
  return [ax + ((v - ay) / (by - ay)) * (bx - ax), v];
}

function clipRingEdge(pts: number[], axis: 0 | 1, v: number, keepGreater: boolean): number[] {
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + n - 1) % n;
    const cIn = keepGreater ? pts[2 * i + axis] >= v : pts[2 * i + axis] <= v;
    const pIn = keepGreater ? pts[2 * j + axis] >= v : pts[2 * j + axis] <= v;
    if (cIn !== pIn) out.push(...cut(pts[2 * j], pts[2 * j + 1], pts[2 * i], pts[2 * i + 1], axis, v));
    if (cIn) out.push(pts[2 * i], pts[2 * i + 1]);
  }
  return out;
}

/** Sutherland-Hodgman clip of one ring to a rectangle. */
function clipRing(r: number[], rect: Rect): number[] {
  const [bx0, by0, bx1, by1] = ringBBox(r);
  if (bx0 >= rect[0] && bx1 <= rect[2] && by0 >= rect[1] && by1 <= rect[3]) return r;
  if (bx1 <= rect[0] || bx0 >= rect[2] || by1 <= rect[1] || by0 >= rect[3]) return [];
  let p = clipRingEdge(r, 0, rect[0], true);
  p = clipRingEdge(p, 0, rect[2], false);
  p = clipRingEdge(p, 1, rect[1], true);
  p = clipRingEdge(p, 1, rect[3], false);
  return dedupeRing(p);
}

function dedupeRing(p: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const n = out.length;
    if (n && out[n - 2] === p[i] && out[n - 1] === p[i + 1]) continue;
    out.push(p[i], p[i + 1]);
  }
  while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
}

/** Clip a polyline to a rectangle (Liang-Barsky per segment). Returns the inside runs. */
function clipLine(pts: number[], rect: Rect): number[][] {
  const out: number[][] = [];
  let cur: number[] | null = null;
  const snap = (v: number, lo: number, hi: number) => (Math.abs(v - lo) < 1e-7 ? lo : Math.abs(v - hi) < 1e-7 ? hi : v);
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    let ok = true;
    for (const [p, q] of [[-dx, ax - rect[0]], [dx, rect[2] - ax], [-dy, ay - rect[1]], [dy, rect[3] - ay]]) {
      if (p === 0) {
        if (q < 0) ok = false;
      } else {
        const t = q / p;
        if (p < 0) { if (t > t1) ok = false; else if (t > t0) t0 = t; }
        else { if (t < t0) ok = false; else if (t < t1) t1 = t; }
      }
    }
    if (!ok || t0 >= t1) {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    const px = snap(ax + t0 * dx, rect[0], rect[2]), py = snap(ay + t0 * dy, rect[1], rect[3]);
    const qx = snap(ax + t1 * dx, rect[0], rect[2]), qy = snap(ay + t1 * dy, rect[1], rect[3]);
    if (!cur || cur[cur.length - 2] !== px || cur[cur.length - 1] !== py) {
      if (cur) out.push(cur);
      cur = [px, py];
    }
    cur.push(qx, qy);
    if (t1 < 1) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.filter((r) => r.length >= 4);
}

/** Douglas-Peucker on an open polyline; keeps both ends. */
function simplifyLine(p: number[], tol: number): number[] {
  const n = p.length / 2;
  if (n <= 2) return p.slice();
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  dpRange(p, 0, n - 1, tol * tol, keep);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
  return out;
}

function dpRange(p: number[], first: number, last: number, tol2: number, keep: Uint8Array) {
  const stack = [first, last];
  while (stack.length) {
    const b = stack.pop()!;
    const a = stack.pop()!;
    const ax = p[2 * a], ay = p[2 * a + 1], bx = p[2 * b], by = p[2 * b + 1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const px = p[2 * i] - ax, py = p[2 * i + 1] - ay;
      let d: number;
      if (len2 === 0) d = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - t * dx, ey = py - t * dy;
        d = ex * ex + ey * ey;
      }
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push(a, idx, idx, b);
    }
  }
}

/** Douglas-Peucker on a closed ring. Pinned vertices are always kept. */
function simplifyRing(r: number[], tol: number, pinned: (x: number, y: number) => boolean): number[] {
  const n = r.length / 2;
  if (n <= 4) return r.slice();
  const keep = new Uint8Array(n);
  const anchors: number[] = [];
  for (let i = 0; i < n; i++) if (pinned(r[2 * i], r[2 * i + 1])) anchors.push(i);
  if (anchors.length < 2) {
    let far = 0, best = -1;
    for (let i = 1; i < n; i++) {
      const d = (r[2 * i] - r[0]) ** 2 + (r[2 * i + 1] - r[1]) ** 2;
      if (d > best) { best = d; far = i; }
    }
    anchors.length = 0;
    anchors.push(0, far);
  }
  // Unroll the ring so every anchor-to-anchor chain is contiguous.
  const ext = r.concat(r);
  const k2 = new Uint8Array(2 * n);
  for (let a = 0; a < anchors.length; a++) {
    const i = anchors[a];
    const j = a + 1 < anchors.length ? anchors[a + 1] : anchors[0] + n;
    k2[i] = k2[j] = 1;
    dpRange(ext, i, j, tol * tol, k2);
  }
  for (let i = 0; i < 2 * n; i++) if (k2[i]) keep[i % n] = 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(r[2 * i], r[2 * i + 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Polygon merging across tile edges
// ---------------------------------------------------------------------------

/**
 * Union of ring pieces that were clipped to a grid of rectangles. Edges lying on grid lines cancel against
 * the opposite-direction edges of the neighboring piece; the rest are chained back into rings.
 * Returns polygons (outer ring positive area, then holes), in the same space as the input.
 */
function mergePieces(rings: number[][], vLines: Set<number>, hLines: Set<number>): number[][][] {
  const edges: number[] = []; // x0, y0, x1, y1 quads
  const onV = new Map<number, number[]>();
  const onH = new Map<number, number[]>();
  const push = (m: Map<number, number[]>, k: number, a: number, b: number) => {
    let l = m.get(k);
    if (!l) m.set(k, (l = []));
    l.push(a, b);
  };
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x0 = r[2 * i], y0 = r[2 * i + 1], x1 = r[2 * j], y1 = r[2 * j + 1];
      if (x0 === x1 && y0 === y1) continue;
      if (x0 === x1 && vLines.has(x0)) push(onV, x0, y0, y1);
      else if (y0 === y1 && hLines.has(y0)) push(onH, y0, x0, x1);
      else edges.push(x0, y0, x1, y1);
    }
  }
  for (const [x, segs] of onV) for (const [a, b] of netIntervals(segs)) edges.push(x, a, x, b);
  for (const [y, segs] of onH) for (const [a, b] of netIntervals(segs)) edges.push(a, y, b, y);
  return assembleRings(edges);
}

/** Directed 1-D intervals [a0, b0, a1, b1, ...] -> elementary intervals with their net direction. */
function netIntervals(segs: number[]): [number, number][] {
  const delta = new Map<number, number>();
  for (let i = 0; i < segs.length; i += 2) {
    const a = segs[i], b = segs[i + 1];
    const s = b > a ? 1 : -1;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    delta.set(lo, (delta.get(lo) ?? 0) + s);
    delta.set(hi, (delta.get(hi) ?? 0) - s);
  }
  const keys = [...delta.keys()].sort((p, q) => p - q);
  const out: [number, number][] = [];
  let net = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    net += delta.get(keys[i])!;
    for (let k = 0; k < Math.abs(net); k++) out.push(net > 0 ? [keys[i], keys[i + 1]] : [keys[i + 1], keys[i]]);
  }
  return out;
}

let openChains = 0;

function assembleRings(edges: number[]): number[][][] {
  const m = edges.length / 4;
  const byStart = new Map<string, number[]>();
  for (let i = 0; i < m; i++) {
    const k = `${edges[4 * i]},${edges[4 * i + 1]}`;
    let l = byStart.get(k);
    if (!l) byStart.set(k, (l = []));
    l.push(i);
  }
  const used = new Uint8Array(m);
  const rings: number[][] = [];
  for (let s = 0; s < m; s++) {
    if (used[s]) continue;
    const ring: number[] = [];
    const sx = edges[4 * s], sy = edges[4 * s + 1];
    let e = s;
    let closed = false;
    for (;;) {
      used[e] = 1;
      const x0 = edges[4 * e], y0 = edges[4 * e + 1], x1 = edges[4 * e + 2], y1 = edges[4 * e + 3];
      ring.push(x0, y0);
      if (x1 === sx && y1 === sy) {
        closed = true;
        break;
      }
      const cands = byStart.get(`${x1},${y1}`);
      let next = -1;
      let bestTurn = -Infinity;
      const dx = x1 - x0, dy = y1 - y0;
      if (cands)
        for (const c of cands) {
          if (used[c]) continue;
          const ex = edges[4 * c + 2] - x1, ey = edges[4 * c + 3] - y1;
          const turn = Math.atan2(dx * ey - dy * ex, dx * ex + dy * ey);
          if (turn > bestTurn) { bestTurn = turn; next = c; }
        }
      if (next < 0) break;
      e = next;
    }
    if (!closed) openChains++;
    const clean = removeCollinear(ring);
    if (clean.length >= 6) rings.push(clean);
  }
  return nestRings(rings);
}

/** Drops consecutive duplicates and exactly collinear axis-aligned midpoints (left over from tile edges). */
function removeCollinear(r: number[]): number[] {
  let pts = dedupeRing(r);
  for (let pass = 0; pass < 2; pass++) {
    const n = pts.length / 2;
    if (n < 3) return pts;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n, q = (i + 1) % n;
      const x = pts[2 * i], y = pts[2 * i + 1];
      if ((pts[2 * p] === x && pts[2 * q] === x) || (pts[2 * p + 1] === y && pts[2 * q + 1] === y)) continue;
      out.push(x, y);
    }
    pts = out;
  }
  return pts;
}

/** Groups rings into polygons: positive-area rings are outers, negative ones become holes of the smallest outer containing them. */
function nestRings(rings: number[][]): number[][][] {
  const outers: { r: number[]; area: number; bb: Rect; holes: number[][] }[] = [];
  const holes: { r: number[]; bb: Rect }[] = [];
  for (const r of rings) {
    const a = ringArea(r);
    if (a > 0) outers.push({ r, area: a, bb: ringBBox(r), holes: [] });
    else if (a < 0) holes.push({ r, bb: ringBBox(r) });
  }
  for (const h of holes) {
    let best: (typeof outers)[number] | null = null;
    for (const o of outers) {
      if (o.bb[0] > h.bb[0] || o.bb[1] > h.bb[1] || o.bb[2] < h.bb[2] || o.bb[3] < h.bb[3]) continue;
      if (best && o.area >= best.area) continue;
      let votes = 0;
      const n = h.r.length / 2;
      for (let k = 0; k < 3; k++) {
        const i = Math.floor((k * n) / 3);
        if (pointInRing(h.r[2 * i], h.r[2 * i + 1], o.r)) votes++;
      }
      if (votes >= 2) best = o;
    }
    if (best) best.holes.push(h.r);
  }
  return outers.map((o) => [o.r, ...o.holes]);
}

/** Coarse raster over the city bounds, for overlap tests. */
class Grid {
  cols: number;
  rows: number;
  data: Uint8Array;
  constructor(
    private b: { minX: number; minY: number; maxX: number; maxY: number },
    private cell: number,
  ) {
    this.cols = Math.ceil((b.maxX - b.minX) / cell);
    this.rows = Math.ceil((b.maxY - b.minY) / cell);
    this.data = new Uint8Array(this.cols * this.rows);
  }
  /** Calls fn for each cell whose center lies inside the polygon (even-odd). */
  cells(poly: Polygon, fn: (i: number) => void) {
    const { cell, b, cols, rows } = this;
    const [, by0, , by1] = ringBBox(poly[0]);
    const r0 = Math.max(0, Math.ceil((by0 - b.minY) / cell - 0.5));
    const r1 = Math.min(rows - 1, Math.ceil((by1 - b.minY) / cell - 0.5) - 1);
    if (r1 < r0) return;
    const xs: number[][] = Array.from({ length: r1 - r0 + 1 }, () => []);
    for (const ring of poly)
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const ya = ring[j + 1], yb = ring[i + 1];
        if (ya === yb) continue;
        const ra = Math.max(r0, Math.ceil((Math.min(ya, yb) - b.minY) / cell - 0.5));
        const rb = Math.min(r1, Math.ceil((Math.max(ya, yb) - b.minY) / cell - 0.5) - 1);
        for (let r = ra; r <= rb; r++) {
          const yc = b.minY + (r + 0.5) * cell;
          xs[r - r0].push(ring[j] + ((yc - ya) / (yb - ya)) * (ring[i] - ring[j]));
        }
      }
    xs.forEach((row, k) => {
      row.sort((p, q) => p - q);
      const r = r0 + k;
      for (let i = 0; i + 1 < row.length; i += 2) {
        const c0 = Math.max(0, Math.ceil((row[i] - b.minX) / cell - 0.5));
        const c1 = Math.min(cols - 1, Math.ceil((row[i + 1] - b.minX) / cell - 0.5) - 1);
        for (let c = c0; c <= c1; c++) fn(r * cols + c);
      }
    });
  }
  fill(poly: Polygon, v: number) {
    this.cells(poly, (i) => (this.data[i] = v));
  }
  /** Share of the polygon's cells holding v (0 for polygons smaller than a few cells). */
  coverage(poly: Polygon, v: number) {
    let n = 0, hit = 0;
    this.cells(poly, (i) => {
      n++;
      if (this.data[i] === v) hit++;
    });
    return n >= 3 ? hit / n : 0;
  }
}

// ---------------------------------------------------------------------------
// Line merging across tile edges
// ---------------------------------------------------------------------------

interface Run {
  k: number;
  pts: number[];
  tile: number;
}

/** Joins runs that were cut at tile edges, and runs of the same class meeting end-to-end. */
function mergeRuns(runs: Run[], vLines: Set<number>, hLines: Set<number>, tol: number): Run[] {
  // 1. Pair up endpoints sitting on shared tile edges and snap them together.
  const onLine = new Map<string, { run: number; end: number; t: number }[]>();
  runs.forEach((r, i) => {
    for (const end of [0, 1]) {
      const x = end ? r.pts[r.pts.length - 2] : r.pts[0];
      const y = end ? r.pts[r.pts.length - 1] : r.pts[1];
      const key = vLines.has(x) ? `v${x}` : hLines.has(y) ? `h${y}` : null;
      if (!key) continue;
      let l = onLine.get(key);
      if (!l) onLine.set(key, (l = []));
      l.push({ run: i, end, t: key[0] === 'v' ? y : x });
    }
  });
  for (const list of onLine.values()) {
    list.sort((a, b) => a.t - b.t);
    const taken = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      if (taken.has(i)) continue;
      const a = list[i];
      let best = -1, bestD = tol;
      for (let j = i + 1; j < list.length && list[j].t - a.t <= tol; j++) {
        const b = list[j];
        if (taken.has(j) || runs[b.run].tile === runs[a.run].tile || runs[b.run].k !== runs[a.run].k) continue;
        if (Math.abs(b.t - a.t) <= bestD) { bestD = Math.abs(b.t - a.t); best = j; }
      }
      if (best < 0) continue;
      taken.add(i);
      taken.add(best);
      const b = list[best];
      const ra = runs[a.run].pts, rb = runs[b.run].pts;
      const ia = a.end ? ra.length - 2 : 0, ib = b.end ? rb.length - 2 : 0;
      const mx = (ra[ia] + rb[ib]) / 2, my = (ra[ia + 1] + rb[ib + 1]) / 2;
      ra[ia] = rb[ib] = mx;
      ra[ia + 1] = rb[ib + 1] = my;
    }
  }
  // 2. Chain runs through nodes: pairs at degree-2 nodes, and the straightest continuations at junctions.
  const ends = new Map<string, number[]>();
  const endKey = (code: number) => {
    const p = runs[code >> 1].pts;
    return `${runs[code >> 1].k}:${code & 1 ? `${p[p.length - 2]},${p[p.length - 1]}` : `${p[0]},${p[1]}`}`;
  };
  for (let c = 0; c < runs.length * 2; c++) {
    const k = endKey(c);
    let l = ends.get(k);
    if (!l) ends.set(k, (l = []));
    l.push(c);
  }
  /** Unit direction pointing from a run end into the run. */
  const dirOf = (code: number): [number, number] => {
    const p = runs[code >> 1].pts;
    const n = p.length / 2;
    const i = code & 1 ? n - 1 : 0;
    const step = code & 1 ? -1 : 1;
    for (let j = i + step; j >= 0 && j < n; j += step) {
      const dx = p[2 * j] - p[2 * i], dy = p[2 * j + 1] - p[2 * i + 1];
      const l = Math.hypot(dx, dy);
      if (l > 4 || j === (code & 1 ? 0 : n - 1)) return l > 0 ? [dx / l, dy / l] : [0, 0];
    }
    return [0, 0];
  };
  const pairOf = new Map<number, number>();
  for (const l of ends.values()) {
    if (l.length === 2) {
      if (l[0] >> 1 !== l[1] >> 1) {
        pairOf.set(l[0], l[1]);
        pairOf.set(l[1], l[0]);
      }
      continue;
    }
    if (l.length < 3) continue;
    const cand: [number, number, number][] = [];
    for (let a = 0; a < l.length; a++)
      for (let b = a + 1; b < l.length; b++) {
        if (l[a] >> 1 === l[b] >> 1) continue;
        const [ax, ay] = dirOf(l[a]), [bx, by] = dirOf(l[b]);
        const straight = -(ax * bx + ay * by);
        if (straight > 0.8) cand.push([straight, l[a], l[b]]);
      }
    cand.sort((p, q) => q[0] - p[0]);
    for (const [, a, b] of cand) {
      if (pairOf.has(a) || pairOf.has(b)) continue;
      pairOf.set(a, b);
      pairOf.set(b, a);
    }
  }
  const partner = (code: number) => pairOf.get(code) ?? -1;
  const used = new Uint8Array(runs.length);
  const out: Run[] = [];
  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue;
    // Walk back to the head of the chain (entering each run through `code`).
    let code = 2 * i + 1; // `code` is the end we leave the current run through
    const seen = new Set<number>([i]);
    for (;;) {
      const p = partner(code ^ 1);
      if (p < 0 || seen.has(p >> 1)) break;
      seen.add(p >> 1);
      code = p;
    }
    // Walk forward from the head.
    const pts: number[] = [];
    for (;;) {
      const r = code >> 1;
      used[r] = 1;
      const src = runs[r].pts;
      const fwd = (code & 1) === 1;
      const seq: number[] = [];
      if (fwd) seq.push(...src);
      else for (let j = src.length - 2; j >= 0; j -= 2) seq.push(src[j], src[j + 1]);
      pts.push(...(pts.length ? seq.slice(2) : seq));
      const p = partner(code);
      if (p < 0 || used[p >> 1]) break;
      code = p ^ 1;
    }
    out.push({ k: runs[i].k, pts, tile: -1 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// City build
// ---------------------------------------------------------------------------

type PolyCat = 'water' | 'parks' | 'green' | 'sand' | 'airports' | 'runways';
const POLY_CATS: PolyCat[] = ['water', 'parks', 'green', 'sand', 'airports', 'runways'];
const PARK_SUB = new Set(['park', 'golf_course', 'recreation_ground', 'garden', 'village_green', 'allotments']);
const GREEN_SUB = new Set(['grass', 'grassland', 'meadow', 'scrub', 'heath', 'fell']);
const SIMPLIFY: Record<PolyCat, number> = { water: 3, parks: 3, green: 5, sand: 3, airports: 5, runways: 2 };
const MIN_AREA: Record<PolyCat, number> = { water: 150, parks: 1500, green: 1500, sand: 1500, airports: 50_000, runways: 1500 };
/** [simplify tolerance m, min area m²] for green, tried in order until geo.json fits GEO_BUDGET. */
const GREEN_LEVELS = [[4, 2500], [6, 5000], [9, 10_000], [13, 20_000], [18, 40_000], [25, 80_000]];
const GEO_BUDGET = 3.9e6;

function polyCategory(layer: string, p: Record<string, unknown>): PolyCat | null {
  const c = p.class as string;
  switch (layer) {
    case 'water':
      return c !== 'swimming_pool' && p.brunnel !== 'tunnel' ? 'water' : null;
    case 'park':
      // Protected areas: only reserve-like ones (regional designations and historic districts cover towns).
      return /nature|natural|wildlife|reserv|state park|game_land|forest/i.test(c) && !/historic|marine|monument/i.test(c) ? 'parks' : null;
    case 'landuse':
      return c === 'cemetery' || c === 'zoo' ? 'parks' : null;
    case 'landcover':
      if (c === 'grass' && PARK_SUB.has(p.subclass as string)) return 'parks';
      if (c === 'wood' || c === 'forest' || c === 'farmland') return 'green';
      if (c === 'wetland' && p.subclass !== 'tidalflat') return 'green';
      if (c === 'grass' && GREEN_SUB.has(p.subclass as string)) return 'green';
      if (c === 'sand') return 'sand';
      return null;
    case 'aeroway':
      if (c === 'aerodrome') return 'airports';
      if (c === 'runway' || c === 'taxiway' || c === 'apron') return 'runways';
      return null;
  }
  return null;
}

const ROAD_K: Record<string, 0 | 1 | 2 | 3> = { motorway: 0, trunk: 1, primary: 1, secondary: 2, tertiary: 3 };
const RAIL_SKIP_SERVICE = new Set(['yard', 'siding', 'spur', 'crossover']);

function englishName(p: Record<string, unknown>): string {
  for (const k of ['name:en', 'name_en', 'name:ja-Latn', 'name_int', 'name']) {
    const v = p[k];
    if (typeof v !== 'string') continue;
    let t = v.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (k === 'name_int') t = t.split(', ')[0]; // 'Gezîret el-Manâshi, Geziret al Manashi'
    if (/[A-Za-z]/.test(t) && !/[\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(t)) return t;
  }
  return '';
}

/** Rejects codes ('A5;A7'), generic lowercase names and Tokyo block numbers ('Aomi 2', 'Kotobashi 1-chome'). */
function usableLabel(city: CityId, text: string): boolean {
  if (text.includes(';') || /^[A-Z]{0,3}\d/.test(text) || !/[A-Z]/.test(text)) return false;
  if (city === 'tokyo' && (/\d$/.test(text) || /ch[oō]me$/i.test(text))) return false;
  return true;
}

/**
 * Capitalizes ('bois de Boulogne'), drops river articles ('La Seine', 'Río Manzanares'), 'Berlin-' prefixes
 * and Seoul's numbered subdivisions ('Myeong-dong 2-ga', '명동2가').
 */
function cleanName(city: CityId, l: GeoLabel) {
  l.text = l.text.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F]/gu, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
  l.text = l.text.charAt(0).toUpperCase() + l.text.slice(1);
  if (l.kind === 'city') l.text = l.text.replace(/ Municipality$/, ''); // 'Danderyd Municipality'
  if (city === 'paris' && l.kind === 'water') l.text = l.text.replace(/^(La |Le |L'|L’)(?=\p{Lu})/u, '');
  if (city === 'madrid' && l.kind === 'water') l.text = l.text.replace(/^Río /, '');
  if (city === 'berlin' && l.kind === 'neighborhood') l.text = l.text.replace(/^Berlin-/, '');
  if (city === 'seoul') {
    l.text = l.text.replace(/ \d+-ga$/, '');
    if (l.local) l.local = l.local.replace(/\d+가$/, '');
  }
  if (city === 'hongkong' && l.local) l.local = l.local.replace(/ - .*$/, ''); // '后海灣 - 深圳灣'
  if (city === 'mexicocity' && l.kind === 'neighborhood') l.text = l.text.replace(/^Colonia /, '').replace(/ \d+ª Sección$/, '');
  if (WARD_CITIES.has(city) && city !== 'osaka' && city !== 'taipei') {
    l.text = l.text.replace(/ Subdistrict$/, '');
    if (l.local) l.local = l.local.replace(/(?<=..)(街道|镇|中央商务区|办事处|经济开发区)$/, '').replace(/（[^）]*）$/, ''); // '小河街道', '高新区（南区）'
  }
  if (city === 'guangzhou' && l.text === 'Beijing') l.text = 'Beijing Road'; // 北京街道, named after the street
  if (city === 'saopaulo' && l.kind === 'neighborhood') l.text = l.text.replace(/ District$/, ''); // 'Sé District'
  if (city === 'vienna' && l.kind === 'water') l.text = l.text === 'Wien' ? 'Wien River' : l.text === 'Donau' ? 'Danube' : l.text;
  if (city === 'osaka') {
    l.text = l.text.replace(/ \d+[- ]chome$/i, ''); // 'Umeda 1-chome'
    if (l.local) l.local = l.local.replace(/[一二三四五六七八九十]+丁目$/, '');
  }
}

interface RawLabel extends GeoLabel {
  key: string;
  score: number; // tie-breaker within rank, higher first
  lake?: boolean; // ranked later by the size of the lake it sits in
  extra?: boolean; // from EXTRA_LABELS: skips the minor-feature filters
}

async function buildCity(city: CityId) {
  const t0 = Date.now();
  const cfg = CITIES[city];
  const bounds = cityBounds(city);
  const { project } = makeProjection(city);
  const Z = POLY_Z;
  const cityRect = bboxToPx(cfg.bbox, Z);
  const coreRects = CORE[city].map((b) => bboxToPx(b, Z));
  const inCore = (x: number, y: number, pad = 0) =>
    coreRects.some((r) => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad);
  const toLocal = (x: number, y: number, z = Z): [number, number] => project(pxToLon(x, z), pxToLat(y, z));
  const pxMeters = (2 * Math.PI * 6378137 * Math.cos((cfg.origin[1] * Math.PI) / 180)) / (EXT * 2 ** Z);

  console.log(`\n[${city}] ${cfg.name}`);
  fameSkip = new Set(FAME_SKIP[city] ?? []);
  const tiles = tilesInRect(cityRect);
  console.log(`  z${Z}: ${tiles.length} tiles`);
  await ensureTiles(Z, tiles);

  const vLines = new Set<number>([cityRect[0], cityRect[2]]);
  const hLines = new Set<number>([cityRect[1], cityRect[3]]);
  for (const [tx, ty] of tiles) {
    vLines.add(tx * EXT).add((tx + 1) * EXT);
    hLines.add(ty * EXT).add((ty + 1) * EXT);
  }
  // Interior tile edges only (endpoints on the outer bounds are real ends).
  const vTile = new Set([...vLines].filter((v) => v > cityRect[0] && v < cityRect[2]));
  const hTile = new Set([...hLines].filter((v) => v > cityRect[1] && v < cityRect[3]));

  const groups: Record<PolyCat, Map<string, number[][]>> = Object.fromEntries(POLY_CATS.map((c) => [c, new Map()])) as never;
  const roadRuns: Run[] = [];
  const railRuns: Run[] = [];
  const runwayLines: { pts: number[]; w: number }[] = [];
  const rawLabels = new Map<string, RawLabel>();
  const rivers = new Map<string, Run[]>();
  const riverFame = new Map<string, number>();
  const riverLocal = new Map<string, string | undefined>();
  const waterNameLines = new Map<string, { text: string; local?: string; pts: number[]; rank: number; fame: number; lake: boolean }>();

  const [viewX, viewY] = project(...cfg.view.center);
  const addLabel = (l: RawLabel) => {
    cleanName(city, l);
    const fix = NAME_FIXES[l.local ?? ''] ?? NAME_FIXES[l.text];
    if (fix) l.text = fix;
    const rankFix = RANK_FIXES[city]?.[l.text];
    if (rankFix !== undefined) l.rank = rankFix;
    if (!usableLabel(city, l.text)) return;
    if (!l.extra && ((l.kind === 'water' && MINOR_WATER.test(l.text)) || (l.kind === 'park' && MINOR_PARK.test(l.text)))) return;
    if (l.kind === 'neighborhood' && (MINOR_PLACE.test(l.text) || /\s\d+$|Constituency$/.test(l.text))) return;
    if ((l.kind === 'island' && MINOR_ISLAND.test(l.text)) || SKIP_NAMES.has(l.text)) return;
    const village = city === 'hongkong' && /\b(Village|Tsuen)$/.test(l.text);
    if (l.kind === 'neighborhood' && (village || Math.hypot(l.x - viewX, l.y - viewY) > OUTSKIRTS)) l.rank = Math.max(l.rank, 4);
    const old = rawLabels.get(l.key);
    if (!old || l.rank < old.rank || (l.rank === old.rank && l.score > old.score)) rawLabels.set(l.key, l);
  };
  const localName = (p: Record<string, unknown>, text: string) => {
    const local = nativeName(city, p);
    return local && local !== text ? local : undefined;
  };

  // Label importance: the lowest zoom at which a label first shows up in the tiles.
  const minZoom = new Map<string, number>();
  for (const z of LABEL_ZOOMS) {
    const zr = bboxToPx(cfg.bbox, z);
    const zt = tilesInRect(zr);
    await ensureTiles(z, zt);
    for (const [tx, ty] of zt) {
      const vt = readTile(z, tx, ty);
      const clip = rectIntersect([tx * EXT, ty * EXT, (tx + 1) * EXT, (ty + 1) * EXT], zr);
      if (!vt || !clip) continue;
      for (const layerName of ['place', 'water_name', 'aerodrome_label']) {
        const layer = vt.layers[layerName];
        if (layer)
          for (let i = 0; i < layer.length; i++) {
            const f = layer.feature(i);
            const [g] = featurePx(f, tx, ty);
            if (f.id === undefined || !g || (f.type === 1 && !inRect(g[0], g[1], clip))) continue;
            const key = `${layerName}:${f.id}`;
            if (!minZoom.has(key)) minZoom.set(key, z);
          }
      }
    }
  }
  const zRank = (key: string, z: number, base: number) => Math.min(9, base + Math.max(0, (minZoom.get(key) ?? z) - LABEL_ZOOMS[0]));

  /** Place, water and airport point labels of one tile. */
  const collectPoints = (vt: VectorTile, z: number, tx: number, ty: number, clip: Rect) => {
    const each = (layerName: string, fn: (p: Record<string, unknown>, x: number, y: number, key: string) => void) => {
      const layer = vt.layers[layerName];
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (f.type !== 1) continue;
        const [g] = featurePx(f, tx, ty);
        if (!g || !inRect(g[0], g[1], clip)) continue;
        const [x, y] = project(pxToLon(g[0], z), pxToLat(g[1], z));
        fn(f.properties, x, y, `${layerName}:${f.id ?? `${g[0]},${g[1]}`}`);
      }
    };
    each('place', (p, x, y, key) => {
      const l = placeLabel(city, p, (base) => zRank(key, z, base));
      if (l) addLabel({ ...l, x, y, key, local: l.kind === 'city' && l.rank === 0 && cfg.nameLocal ? cfg.nameLocal : localName(p, l.text) });
    });
    each('water_name', (p, x, y, key) => {
      const text = englishName(p);
      if (!text) return;
      const rank = waterRank(p.class as string, fame(p));
      addLabel({ text, local: localName(p, text), x, y, kind: 'water', rank, key: `water:${text}`, score: fame(p), lake: p.class === 'lake' });
    });
    each('aerodrome_label', (p, x, y, key) => {
      const cls = p.class as string;
      const iata = p.iata as string | undefined;
      // Some big airports come through as class 'other' without an IATA code (LaGuardia), so fame counts too.
      const n = fame(p);
      if (!(iata && ['international', 'public', 'regional', 'military'].includes(cls)) && n < 20) return;
      const text = (iata && AIRPORT_NAMES[iata]) || englishName(p).replace(/ International/, '');
      const rank = cls === 'international' || n >= 40 ? 2 : 4;
      if (text) addLabel({ text, local: localName(p, text), x, y, kind: 'airport', rank, key, score: n });
    });
  };

  let tileIdx = 0;
  for (const [tx, ty] of tiles) {
    tileIdx++;
    const vt = readTile(Z, tx, ty);
    if (!vt) continue;
    const clip = rectIntersect([tx * EXT, ty * EXT, (tx + 1) * EXT, (ty + 1) * EXT], cityRect);
    if (!clip) continue;
    const tileId = tx * 100000 + ty;

    for (const layerName of ['water', 'park', 'landuse', 'landcover', 'aeroway']) {
      const layer = vt.layers[layerName];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        const p = f.properties;
        if (layerName === 'aeroway' && f.type === 2 && (p.class === 'runway' || p.class === 'taxiway')) {
          for (const g of featurePx(f, tx, ty)) for (const run of clipLine(g, clip)) runwayLines.push({ pts: run, w: p.class === 'runway' ? 50 : 22 });
          continue;
        }
        if (f.type !== 3) continue;
        const cat = polyCategory(layerName, p);
        if (!cat) continue;
        const key = cat === 'water' && p.class === 'ocean' ? 'ocean' : `${layerName}/${p.class}/${p.subclass ?? ''}:${f.id ?? `${tileId}/${i}`}`;
        let list = groups[cat].get(key);
        for (const poly of featurePolygonsPx(f, tx, ty)) {
          for (const ring of poly) {
            const c = clipRing(ring, clip);
            if (c.length < 6 || ringArea(c) === 0) continue;
            if (!list) groups[cat].set(key, (list = []));
            list.push(c);
          }
        }
      }
    }

    const tr = vt.layers.transportation;
    if (tr)
      for (let i = 0; i < tr.length; i++) {
        const f = tr.feature(i);
        if (f.type !== 2) continue;
        const p = f.properties;
        const cls = p.class as string;
        const k = ROAD_K[cls];
        const isRail = cls === 'rail' || cls === 'transit';
        if (k === undefined && !isRail) continue;
        if (isRail && RAIL_SKIP_SERVICE.has(p.service as string)) continue;
        const geom = featurePx(f, tx, ty);
        // Tunnels are skipped, except short ones: those are mostly building passages (Tower Bridge's towers).
        if (p.brunnel === 'tunnel' && geom.reduce((sum, g) => sum + lineLength(g), 0) * pxMeters > 80) continue;
        for (const g of geom) {
          for (const run of clipLine(g, clip)) {
            if (isRail) railRuns.push({ k: 0, pts: run, tile: tileId });
            else if (k !== 3) roadRuns.push({ k, pts: run, tile: tileId });
            else {
              // Tertiary roads only inside the core areas (cut into inside runs).
              let cur: number[] = [];
              for (let j = 0; j < run.length; j += 2) {
                if (inCore(run[j], run[j + 1], 40)) cur.push(run[j], run[j + 1]);
                else {
                  if (cur.length >= 4) roadRuns.push({ k: 3, pts: cur, tile: tileId });
                  cur = [];
                }
              }
              if (cur.length >= 4) roadRuns.push({ k: 3, pts: cur, tile: tileId });
            }
          }
        }
      }

    const ww = vt.layers.waterway;
    if (ww)
      for (let i = 0; i < ww.length; i++) {
        const f = ww.feature(i);
        const p = f.properties;
        if (f.type !== 2 || (p.class !== 'river' && p.class !== 'canal') || p.brunnel === 'tunnel') continue;
        const text = englishName(p);
        if (!text) continue;
        const nameKey = `${p.class}:${text}`;
        riverFame.set(nameKey, Math.max(riverFame.get(nameKey) ?? 0, fame(p)));
        if (!riverLocal.has(nameKey)) riverLocal.set(nameKey, localName(p, text));
        let list = rivers.get(nameKey);
        if (!list) rivers.set(nameKey, (list = []));
        for (const g of featurePx(f, tx, ty)) for (const run of clipLine(g, clip)) list.push({ k: p.class === 'river' ? 0 : 1, pts: run, tile: tileId });
      }

    collectPoints(vt, Z, tx, ty, clip);
    const wn = vt.layers.water_name;
    if (wn)
      for (let i = 0; i < wn.length; i++) {
        const f = wn.feature(i);
        if (f.type !== 2) continue;
        const text = englishName(f.properties);
        if (!text) continue;
        const cls = f.properties.class as string;
        const rank = waterRank(cls, fame(f.properties));
        for (const g of featurePx(f, tx, ty)) {
          const cur = waterNameLines.get(text);
          if (!cur || rank < cur.rank || (rank === cur.rank && g.length > cur.pts.length))
            waterNameLines.set(text, { text, local: localName(f.properties, text), pts: g, rank, fame: fame(f.properties), lake: cls === 'lake' });
        }
      }

    if (tileIdx % 100 === 0) console.log(`    decoded ${tileIdx}/${tiles.length}`);
  }

  // Polygons: merge per group, project, simplify.
  const inBoundsX = (x: number) => Math.abs(x - bounds.minX) < 1e-3 || Math.abs(x - bounds.maxX) < 1e-3;
  const inBoundsY = (y: number) => Math.abs(y - bounds.minY) < 1e-3 || Math.abs(y - bounds.maxY) < 1e-3;
  const roundX = (x: number) =>
    Math.abs(x - bounds.minX) < 1e-3 ? Math.floor(bounds.minX) : Math.abs(x - bounds.maxX) < 1e-3 ? Math.ceil(bounds.maxX) : Math.round(x);
  const roundY = (y: number) =>
    Math.abs(y - bounds.minY) < 1e-3 ? Math.floor(bounds.minY) : Math.abs(y - bounds.maxY) < 1e-3 ? Math.ceil(bounds.maxY) : Math.round(y);

  const projectRing = (r: number[]): number[] => {
    const out: number[] = [];
    for (let i = r.length - 2; i >= 0; i -= 2) {
      // Reversed: y flips, so this keeps outers counterclockwise in local meters.
      let [x, y] = toLocal(r[i], r[i + 1]);
      if (r[i] === cityRect[0]) x = bounds.minX;
      if (r[i] === cityRect[2]) x = bounds.maxX;
      if (r[i + 1] === cityRect[1]) y = bounds.maxY;
      if (r[i + 1] === cityRect[3]) y = bounds.minY;
      out.push(x, y);
    }
    return out;
  };
  const finishRing = (r: number[], tol: number): number[] | null => {
    const s = simplifyRing(r, tol, (x, y) => inBoundsX(x) || inBoundsY(y));
    const out: number[] = [];
    for (let i = 0; i < s.length; i += 2) {
      const x = roundX(s[i]), y = roundY(s[i + 1]);
      const n = out.length;
      if (n && out[n - 2] === x && out[n - 1] === y) continue;
      out.push(x, y);
    }
    while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
    return out.length >= 6 && ringArea(out) !== 0 ? out : null;
  };

  // Merge tile pieces once (global px); simplification happens afterwards, possibly at several levels.
  const merged = {} as Record<PolyCat, { key: string; poly: number[][] }[]>;
  openChains = 0;
  for (const cat of POLY_CATS) {
    merged[cat] = [];
    for (const [key, rings] of groups[cat]) for (const poly of mergePieces(rings, vLines, hLines)) merged[cat].push({ key, poly });
  }
  if (openChains) console.log(`  warning: ${openChains} open ring chains`);
  /** `params` gives [simplify tolerance, min area] per merged polygon (global px). */
  const finishPolys = (cat: PolyCat, params: (key: string, poly: number[][]) => [number, number]) => {
    const out: Polygon[] = [];
    const areas: number[] = [];
    const keys: string[] = [];
    for (const { key, poly } of merged[cat]) {
      const [tol, minArea] = params(key, poly);
      const outer = finishRing(projectRing(poly[0]), tol);
      if (!outer) continue;
      let area = ringArea(outer);
      if (area < minArea) continue;
      // Protected-area boundaries larger than this take in whole towns.
      if (key.startsWith('park/') && area > 10e6) continue;
      const rings2: Flat[] = [outer];
      for (const h of poly.slice(1)) {
        const hr = finishRing(projectRing(h), tol);
        if (hr && -ringArea(hr) >= (cat === 'water' ? 50 : 500)) {
          rings2.push(hr);
          area += ringArea(hr);
        }
      }
      out.push(rings2);
      areas.push(area);
      keys.push(key);
    }
    return { polys: out, areas, keys };
  };
  const polys = {} as Record<PolyCat, Polygon[]>;
  const polyAreas = {} as Record<PolyCat, number[]>;
  let waterIsOcean: boolean[] = [];
  for (const cat of POLY_CATS) {
    if (cat === 'green') continue;
    const r = finishPolys(cat, () => [SIMPLIFY[cat], MIN_AREA[cat]]);
    polys[cat] = r.polys;
    polyAreas[cat] = r.areas;
    if (cat === 'water') {
      // Drop water that duplicates the ocean (river polygons inside the tidal coastline).
      const isOcean = r.keys.map((k) => k === 'ocean');
      const oceanMask = new Grid(bounds, 20);
      r.polys.forEach((p, i) => isOcean[i] && oceanMask.fill(p, 1));
      const keep = r.polys.map((p, i) => isOcean[i] || oceanMask.coverage(p, 1) < 0.9);
      polys.water = r.polys.filter((_, i) => keep[i]);
      polyAreas.water = r.areas.filter((_, i) => keep[i]);
      waterIsOcean = isOcean.filter((_, i) => keep[i]);
      console.log(`  dropped ${keep.filter((k) => !k).length} water polygons inside the ocean`);
    }
  }
  const mask = new Grid(bounds, 20);
  for (const p of polys.water) mask.fill(p, 1);
  const notOverWater = (ps: Polygon[]) => ps.map((p) => mask.coverage(p, 1) < 0.5);
  {
    const keep = notOverWater(polys.parks);
    polys.parks = polys.parks.filter((_, i) => keep[i]);
    polyAreas.parks = polyAreas.parks.filter((_, i) => keep[i]);
    console.log(`  dropped ${keep.filter((k) => !k).length} parks polygons over water`);
  }

  // Runway/taxiway lines become little rectangles (square caps close the joints).
  for (const { pts, w } of runwayLines) {
    const loc: number[] = [];
    for (let i = 0; i < pts.length; i += 2) loc.push(...toLocal(pts[i], pts[i + 1]));
    const s = simplifyLine(loc, 2);
    for (let i = 0; i + 3 < s.length; i += 2) {
      const ax = s[i], ay = s[i + 1], bx = s[i + 2], by = s[i + 3];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      const ux = (bx - ax) / len, uy = (by - ay) / len;
      const h = w / 2;
      const nx = -uy * h, ny = ux * h;
      const ex = ux * h, ey = uy * h;
      const rect = [ax - ex + nx, ay - ey + ny, ax - ex - nx, ay - ey - ny, bx + ex - nx, by + ey - ny, bx + ex + nx, by + ey + ny];
      const ring = rect.map((v, j) => (j % 2 ? Math.round(Math.max(bounds.minY, Math.min(bounds.maxY, v))) : Math.round(Math.max(bounds.minX, Math.min(bounds.maxX, v)))));
      if (Math.abs(ringArea(ring)) > 50) polys.runways.push([ringArea(ring) > 0 ? ring : reversed(ring)]);
    }
  }

  // Roads and rail.
  const finishLines = (runs: Run[], tol: number, minLen: number) =>
    mergeRuns(runs, vTile, hTile, 1.5).flatMap((r) => {
      const loc: number[] = [];
      for (let i = 0; i < r.pts.length; i += 2) loc.push(...toLocal(r.pts[i], r.pts[i + 1]));
      const s = simplifyLine(loc, tol);
      const out: number[] = [];
      for (let i = 0; i < s.length; i += 2) {
        const x = Math.round(s[i]), y = Math.round(s[i + 1]);
        const n = out.length;
        if (n && out[n - 2] === x && out[n - 1] === y) continue;
        out.push(x, y);
      }
      return out.length >= 4 && lineLength(out) >= minLen ? [{ k: r.k, pts: out }] : [];
    });
  const roads = finishLines(roadRuns, 2.5, 30).map((r) => ({ k: r.k as 0 | 1 | 2 | 3, pts: r.pts }));
  roads.sort((a, b) => b.k - a.k);
  const rail = finishLines(railRuns, 2.5, 60).map((r) => r.pts);

  // River labels: one per name, at the point of the river nearest the initial view. Ranked by how much
  // of it is wide water (±50 m across the line): length alone promotes long thin creeks, and fame fails
  // because the Hudson's segments carry almost no translations.
  const isWet = (x: number, y: number) => {
    const c = Math.floor((x - bounds.minX) / 20), r = Math.floor((y - bounds.minY) / 20);
    return c >= 0 && r >= 0 && c < mask.cols && r < mask.rows && mask.data[r * mask.cols + c] === 1;
  };
  const riverLines = [...rivers].flatMap(([nameKey, runs]) => {
    const merged = mergeRuns(runs, vTile, hTile, 1.5).map((r) => {
      const loc: number[] = [];
      for (let i = 0; i < r.pts.length; i += 2) loc.push(...toLocal(r.pts[i], r.pts[i + 1]));
      return loc;
    });
    const total = merged.reduce((s, l) => s + lineLength(l), 0);
    return total < 2000 ? [] : [{ nameKey, merged, total }];
  });
  // Tributaries' lines often run on into the main river to meet its center line (the Han into the Yangtze):
  // keep their labels clear of the bigger river's water (its half-width) plus a margin, so they don't name it.
  const CONFLUENCE = 600, MAX_HALF = 2000, CELL = CONFLUENCE + MAX_HALF;
  const halfWidth = (x: number, y: number, ux: number, uy: number) => {
    let half = 0;
    for (const side of [1, -1]) {
      let d = 25;
      while (d < MAX_HALF && isWet(x - side * uy * d, y + side * ux * d)) d += 25;
      half = Math.max(half, d);
    }
    return half;
  };
  const riverHash = new Map<string, number[]>(); // cell -> [x, y, river index, half-width, ...]
  riverLines.forEach(({ merged }, idx) =>
    merged.forEach((l) =>
      samplesAlong(l, 100, (x, y, _d, ux, uy) => {
        const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
        let list = riverHash.get(k);
        if (!list) riverHash.set(k, (list = []));
        list.push(x, y, idx, halfWidth(x, y, ux, uy));
      }),
    ),
  );
  const nearBiggerRiver = (x: number, y: number, idx: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = cx - 1; i <= cx + 1; i++)
      for (let j = cy - 1; j <= cy + 1; j++) {
        const list = riverHash.get(`${i},${j}`);
        if (list)
          for (let k = 0; k < list.length; k += 4) {
            const o = list[k + 2];
            if (o === idx || riverLines[o].total <= riverLines[idx].total) continue;
            if (Math.hypot(list[k] - x, list[k + 1] - y) < list[k + 3] + CONFLUENCE) return true;
          }
      }
    return false;
  };
  for (const [idx, { nameKey, merged, total }] of riverLines.entries()) {
    const text = nameKey.slice(nameKey.indexOf(':') + 1);
    let wide = 0;
    // Nearest the view, preferring points on drawn water, then points clear of a bigger river, then anywhere.
    const best = { x: 0, y: 0, d: Infinity };
    const clear = { x: 0, y: 0, d: Infinity };
    const anywhere = { x: 0, y: 0, d: Infinity };
    for (const l of merged) {
      const len = lineLength(l);
      const end = Math.min(300, len / 4);
      samplesAlong(l, 100, (x, y, d, ux, uy) => {
        if (isWet(x - uy * 50, y + ux * 50) && isWet(x + uy * 50, y - ux * 50)) wide += 100;
        const dm = Math.hypot(x - viewX, y - viewY);
        if (d <= end || d >= len - end) return;
        if (dm < anywhere.d) Object.assign(anywhere, { x, y, d: dm });
        if (dm >= clear.d || nearBiggerRiver(x, y, idx)) return;
        Object.assign(clear, { x, y, d: dm });
        if (dm < best.d && isWet(x, y)) Object.assign(best, { x, y, d: dm });
      });
    }
    if (best.d === Infinity) Object.assign(best, clear);
    if (best.d === Infinity) Object.assign(best, anywhere);
    if (best.d === Infinity) continue;
    const n = riverFame.get(nameKey) ?? 0;
    const rank = nameKey.startsWith('canal')
      ? wide >= 1000 ? 3 : n >= 10 ? 4 : 5
      : total < 5000 ? (wide >= 1000 ? 3 : 4) // short channels in a harbor are wide but minor
      : wide >= 15_000 ? 0 : wide >= 5000 ? 1 : wide >= 1000 || total >= 15_000 ? 2 : 3;
    addLabel({ text, local: riverLocal.get(nameKey), x: best.x, y: best.y, kind: 'water', rank, key: `river:${text}`, score: total });
  }
  for (const w of waterNameLines.values()) {
    const loc: number[] = [];
    for (let i = 0; i < w.pts.length; i += 2) loc.push(...toLocal(w.pts[i], w.pts[i + 1]));
    const [x, y] = pointAlong(loc, lineLength(loc) / 2);
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
    addLabel({ text: w.text, local: w.local, x, y, kind: 'water', rank: w.rank, key: `water:${w.text}`, score: w.fame, lake: w.lake });
  }

  for (const e of EXTRA_LABELS[city]) {
    const [x, y] = project(...e.at);
    const wet = mask.data[Math.floor((y - bounds.minY) / 20) * mask.cols + Math.floor((x - bounds.minX) / 20)] === 1;
    if (wet === (e.kind === 'water')) addLabel({ text: e.text, local: e.local, x, y, kind: e.kind, rank: e.rank, key: `${e.kind}:${e.text}`, score: 99, extra: true });
    else console.log(`  warning: extra label ${e.text} is not on ${e.kind === 'water' ? 'water' : 'land'}`);
  }

  // Buildings + park names (z14, core areas).
  const parkPois: ParkPoi[] = [];
  const buildings = await buildBuildings(city, project, bounds, (vt, tx, ty) => {
    const r = bboxToPx(cfg.bbox, BUILDING_Z);
    const clip = rectIntersect([tx * EXT, ty * EXT, (tx + 1) * EXT, (ty + 1) * EXT], r);
    if (clip) collectPoints(vt, BUILDING_Z, tx, ty, clip);
    parkPois.push(...readParkPois(vt, tx, ty, project, localName));
  });
  if (Z14_PLACES.has(city)) {
    const r = bboxToPx(cfg.bbox, BUILDING_Z);
    const zt = tilesInRect(r);
    await ensureTiles(BUILDING_Z, zt);
    for (const [tx, ty] of zt) {
      const vt = readTile(BUILDING_Z, tx, ty);
      const clip = rectIntersect([tx * EXT, ty * EXT, (tx + 1) * EXT, (ty + 1) * EXT], r);
      if (vt && clip) collectPoints(vt, BUILDING_Z, tx, ty, clip);
    }
  }
  await addParkLabels(city, polys.parks, polyAreas.parks, parkPois, project, addLabel, localName);

  for (const l of rawLabels.values()) {
    if (!l.lake || RANK_FIXES[city]?.[l.text] !== undefined) continue;
    let a = 0;
    polys.water.forEach((p, i) => {
      const bb = ringBBox(p[0]);
      if (waterIsOcean[i] || l.x < bb[0] || l.x > bb[2] || l.y < bb[1] || l.y > bb[3] || polyAreas.water[i] <= a) return;
      if (pointInRing(l.x, l.y, p[0]) && !p.slice(1).some((h) => pointInRing(l.x, l.y, h))) a = polyAreas.water[i];
    });
    if (a < 300_000) rawLabels.delete(l.key);
    else l.rank = a > 5e6 ? 2 : a > 1e6 ? (l.score >= 20 ? 2 : 3) : l.score >= 20 ? 4 : 6; // well-known lakes (Tegel, Wannsee) a rank higher
  }
  // The best-known neighborhoods near the middle rank 3 even where names carry few translations (Hong Kong, Seoul).
  const central = [...rawLabels.values()].filter(
    (l) => l.kind === 'neighborhood' && RANK_FIXES[city]?.[l.text] === undefined && Math.hypot(l.x - viewX, l.y - viewY) <= OUTSKIRTS,
  );
  central.sort((a, b) => b.score - a.score);
  for (const l of central.slice(0, TOP_HOODS)) l.rank = Math.min(l.rank, 3);
  writeFileSync(`.cache/geo/${city}-labels-raw.json`, JSON.stringify([...rawLabels.values()]));
  const labels = pickLabels([...rawLabels.values()], bounds);

  // Green is the bulkiest and least important layer: coarsen it outside the core areas until the file fits the budget.
  const rest = JSON.stringify({ ...polys, green: [], roads, rail, labels }).length;
  const nearCore = (poly: number[][]) => {
    const [x0, y0, x1, y1] = ringBBox(poly[0]);
    return inCore((x0 + x1) / 2, (y0 + y1) / 2, 1500 / pxMeters);
  };
  for (const level of GREEN_LEVELS) {
    const r = finishPolys('green', (key, poly) => {
      const [tol, minArea] = nearCore(poly) ? GREEN_LEVELS[0] : level;
      return [tol, (key.startsWith('landcover/grass/') ? 4 : 1) * minArea];
    });
    const keep = notOverWater(r.polys);
    polys.green = r.polys.filter((_, i) => keep[i]);
    const size = JSON.stringify(polys.green).length;
    if (rest + size <= GEO_BUDGET) break;
    console.log(`  green at ${level[0]} m / ${level[1]} m² outside the core is ${(size / 1e6).toFixed(1)} MB, coarsening`);
  }

  const geo: GeoData = {
    city,
    bounds: {
      minX: Math.round(bounds.minX * 100) / 100,
      minY: Math.round(bounds.minY * 100) / 100,
      maxX: Math.round(bounds.maxX * 100) / 100,
      maxY: Math.round(bounds.maxY * 100) / 100,
    },
    water: polys.water,
    parks: polys.parks,
    green: polys.green,
    sand: polys.sand,
    airports: polys.airports,
    runways: polys.runways,
    roads,
    rail,
    labels,
  };
  const dir = `public/data/${city}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/geo.json`, JSON.stringify(geo));
  if (!GEO_ONLY) writeFileSync(`${dir}/buildings.bin`, Buffer.from(buildings.buffer, buildings.byteOffset, buildings.byteLength));

  const kb = (p: string) => `${(statSync(p).size / 1024).toFixed(0)} KB`;
  const verts = (ps: Polygon[]) => ps.reduce((s, p) => s + p.reduce((t, r) => t + r.length / 2, 0), 0);
  const size = (v: unknown) => `${(JSON.stringify(v).length / 1024).toFixed(0)} KB`;
  console.log(`  geo.json ${kb(`${dir}/geo.json`)}, buildings.bin ${kb(`${dir}/buildings.bin`)} (${buildings.length / BUILDING_STRIDE} buildings)`);
  for (const cat of POLY_CATS)
    console.log(`    ${cat.padEnd(9)} ${String(polys[cat].length).padStart(6)} polys ${String(verts(polys[cat])).padStart(7)} verts  ${size(polys[cat])}`);
  const roadCounts = [0, 1, 2, 3].map((k) => roads.filter((r) => r.k === k).length).join('/');
  console.log(`    roads     ${String(roads.length).padStart(6)} lines (k0-3: ${roadCounts}) ${size(roads)}`);
  console.log(`    rail      ${String(rail.length).padStart(6)} lines ${size(rail)}`);
  const kinds: Record<string, number> = {};
  for (const l of labels) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
  console.log(`    labels    ${String(labels.length).padStart(6)} ${JSON.stringify(kinds)}`);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

function reversed(r: number[]): number[] {
  const c = r.slice();
  reverseRing(c);
  return c;
}

function lineLength(p: number[]): number {
  let s = 0;
  for (let i = 2; i < p.length; i += 2) s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return s;
}

/** Calls fn at every `step` meters along the polyline, with the distance so far and the unit direction there. */
function samplesAlong(p: number[], step: number, fn: (x: number, y: number, d: number, ux: number, uy: number) => void) {
  let next = step / 2, done = 0;
  for (let i = 2; i < p.length; i += 2) {
    const l = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    while (next <= done + l && l > 0) {
      const t = (next - done) / l;
      const ux = (p[i] - p[i - 2]) / l, uy = (p[i + 1] - p[i - 1]) / l;
      fn(p[i - 2] + t * (p[i] - p[i - 2]), p[i - 1] + t * (p[i + 1] - p[i - 1]), next, ux, uy);
      next += step;
    }
    done += l;
  }
}

function pointAlong(p: number[], d: number): [number, number] {
  for (let i = 2; i < p.length; i += 2) {
    const l = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (d <= l && l > 0) {
      const t = d / l;
      return [p[i - 2] + t * (p[i] - p[i - 2]), p[i - 1] + t * (p[i + 1] - p[i - 1])];
    }
    d -= l;
  }
  return [p[p.length - 2], p[p.length - 1]];
}

const NYC_BOROUGHS = new Set(['Manhattan', 'Brooklyn', 'Queens', 'The Bronx', 'Staten Island']);

let fameSkip = new Set<string>();
/** How widely known a name is: the number of translations it carries. */
const fame = (p: Record<string, unknown>) => Object.keys(p).filter((k) => k.startsWith('name:') && !fameSkip.has(k)).length;
/** Oceans and seas first, then bays, sounds, straits and channels by how widely known they are. Lakes are re-ranked by size later. */
const waterRank = (cls: string, n: number) => (cls === 'ocean' || cls === 'sea' ? 0 : [0, 1, 3, 4][fameRank(n, 0, [20, 12, 5])]);
/** Rank from fame: the first threshold met picks the rank, starting at `best`. */
const fameRank = (n: number, best: number, steps: number[]) => {
  const i = steps.findIndex((t) => n >= t);
  return best + (i < 0 ? steps.length : i);
};

/** `zr(base)` = base + how many zoom levels past the first label zoom the place appears. */
function placeLabel(city: CityId, p: Record<string, unknown>, zr: (base: number) => number): Omit<RawLabel, 'x' | 'y' | 'key'> | null {
  const cls = p.class as string;
  const text = englishName(p);
  if (!text) return null;
  const n = fame(p);
  const score = n;
  // Wards and districts (区/區) of Japanese and Chinese cities are boroughs, whatever their place class.
  if (WARD_CITIES.has(city) && cls !== 'village' && cls !== 'hamlet' && /(?<!社|开发|商务|园|合作|中心|保税|起步)[区區]$/.test(p.name as string) && text !== CITIES[city].name)
    return { text: text.replace(/ (Ward|District)$/, ''), kind: 'borough', rank: 1, score };
  // Townships (乡/镇) on the outskirts are neighborhoods, not cities.
  if (WARD_CITIES.has(city) && (cls === 'city' || cls === 'town') && /[乡镇鄉鎮]$/.test(p.name as string))
    return { text, kind: 'neighborhood', rank: Math.max(3, zr(3)), score };
  switch (cls) {
    case 'city':
      if (text === CITIES[city].name) return { text, kind: 'city', rank: 0, score };
      // Tokyo's special wards are tagged as cities.
      if (city === 'tokyo' && /区$/.test(p.name as string)) return { text, kind: 'borough', rank: 1, score };
      return { text, kind: 'city', rank: Math.min(zr(2), fameRank(n, 2, [30])), score };
    case 'town':
      return { text, kind: 'city', rank: Math.min(zr(3), fameRank(n, 3, [40])), score };
    case 'borough':
      // Hong Kong's borough points are ad hoc ('Sai Wan', 'Chai Wan District'); its real districts have none.
      if (city !== 'hongkong') return { text, kind: 'borough', rank: 1, score };
    // falls through
    case 'suburb':
    case 'quarter':
      if (city === 'nyc' && NYC_BOROUGHS.has(text)) return { text, kind: 'borough', rank: 1, score };
      return { text, kind: 'neighborhood', rank: Math.min(zr(2), fameRank(n, 3, [30, 12])), score };
    case 'neighbourhood':
      return { text, kind: 'neighborhood', rank: Math.min(zr(2), fameRank(n, 3, [30, 15, 5])), score };
    case 'village':
      return { text, kind: 'neighborhood', rank: Math.min(zr(3), fameRank(n, 3, [40, 15])), score };
    case 'hamlet':
      return { text, kind: 'neighborhood', rank: Math.min(zr(3), fameRank(n, 4, [30, 10])), score };
    case 'island':
      if (/airport/i.test(text)) return null;
      return { text, kind: 'island', rank: fameRank(n, 3, [20, 5]), score };
  }
  return null;
}

/**
 * One label per name: case, accents and punctuation ignored; for waters also 'River'/'The' ('Thames' = 'River Thames')
 * and compounding ('Teltowkanal' = 'Teltow Canal'); Seoul's '-dong'; and one per native name ('Jungnangcheon' = 'Jungrangcheon Stream').
 */
function nameKeys(l: GeoLabel): string[] {
  const n = l.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const keys = [n];
  if (l.kind === 'water') keys.push(`w:${n.replace(/\b(river|the)\b/g, '').replace(/canal/g, 'kanal').replace(/\s+/g, '')}`);
  if (l.local) keys.push(`l:${l.kind}:${l.local}`); // per kind: the Moskva River and Moscow are both 'Москва'
  if (/-dong$/.test(l.text)) keys.push(n.replace(/ dong$/, '')); // 'Itaewon-dong' = 'Itaewon'
  return keys;
}

const LABEL_QUOTA: Record<GeoLabel['kind'], number> = { city: 30, borough: 30, neighborhood: 130, water: 45, park: 50, island: 10, airport: 8 };

/**
 * Picks up to MAX_LABELS by rank with a soft quota per kind (spare room is filled afterwards),
 * skipping repeats of the same text nearby and crowded minor labels.
 */
function pickLabels(all: RawLabel[], b: { minX: number; minY: number; maxX: number; maxY: number }): GeoLabel[] {
  const inside = all.filter((l) => l.x > b.minX && l.x < b.maxX && l.y > b.minY && l.y < b.maxY);
  inside.sort((a, c) => a.rank - c.rank || c.score - a.score);
  const picked: RawLabel[] = [];
  const count: Record<string, number> = {};
  const names = new Set<string>();
  const fits = (l: RawLabel) => {
    if (nameKeys(l).some((k) => names.has(k))) return false;
    const minGap = l.rank <= 2 ? 0 : l.rank === 3 ? 400 : l.rank === 4 ? 500 : 650;
    for (const q of picked) {
      // The city's own name and its big river or harbor would push everything else away from the middle of the map;
      // the client culls overlapping labels by rank anyway.
      if (q.rank === 0) continue;
      const d = Math.hypot(q.x - l.x, q.y - l.y);
      if (d < minGap || (l.kind === 'airport' && q.kind === 'airport' && d < 3000)) return false;
    }
    return true;
  };
  const take = (l: RawLabel) => {
    picked.push(l);
    for (const k of nameKeys(l)) names.add(k);
  };
  const deferred: RawLabel[] = [];
  for (const l of inside) {
    if (picked.length >= MAX_LABELS) break;
    if ((count[l.kind] ?? 0) >= LABEL_QUOTA[l.kind]) deferred.push(l);
    else if (fits(l)) {
      take(l);
      count[l.kind] = (count[l.kind] ?? 0) + 1;
    }
  }
  for (const l of deferred) {
    if (picked.length >= MAX_LABELS) break;
    if (fits(l)) take(l);
  }
  picked.sort((a, c) => a.rank - c.rank || c.score - a.score);
  return picked.map((l) => {
    const out: GeoLabel = { text: l.text, x: Math.round(l.x), y: Math.round(l.y), kind: l.kind, rank: l.rank };
    if (l.local) out.local = l.local;
    return out;
  });
}

// ---------------------------------------------------------------------------
// Parks: names from z14 POIs
// ---------------------------------------------------------------------------

interface ParkPoi {
  text: string;
  local?: string;
  x: number;
  y: number;
  cls: string;
  fame: number;
}

async function addParkLabels(
  city: CityId,
  parks: Polygon[],
  areas: number[],
  pois: ParkPoi[],
  project: (lon: number, lat: number) => [number, number],
  addLabel: (l: RawLabel) => void,
  localName: (p: Record<string, unknown>, text: string) => string | undefined,
) {
  const bbs = parks.map((p) => ringBBox(p[0]));
  const centers = parks.map((p) => interiorPoint(p[0]));
  const cands = new Map<number, ParkPoi[]>();
  const assign = (poi: ParkPoi) => {
    let best = -1;
    for (let i = 0; i < parks.length; i++) {
      const bb = bbs[i];
      if (poi.x < bb[0] || poi.x > bb[2] || poi.y < bb[1] || poi.y > bb[3]) continue;
      if (pointInRing(poi.x, poi.y, parks[i][0]) && (best < 0 || areas[i] > areas[best])) best = i;
    }
    if (best < 0) return;
    let l = cands.get(best);
    if (!l) cands.set(best, (l = []));
    l.push(poi);
  };
  for (const poi of pois) assign(poi);
  const best = (i: number) => {
    const [cx, cy] = centers[i];
    const score = (q: ParkPoi) => PARK_POI[q.cls] * 1e6 + Math.hypot(q.x - cx, q.y - cy);
    return cands.get(i)?.reduce((p, q) => (score(q) < score(p) ? q : p));
  };

  // Big parks without a proper park POI yet: fetch the z14 tile under their middle to find the name.
  const { unproject } = makeProjection(city);
  const want = new Map<string, [number, number]>();
  for (let i = 0; i < parks.length; i++) {
    if (areas[i] < 400_000 || PARK_POI[best(i)?.cls ?? 'zoo'] === 0) continue;
    const [lon, lat] = unproject(...centers[i]);
    const tx = Math.floor(lonToPx(lon, BUILDING_Z) / EXT), ty = Math.floor(latToPx(lat, BUILDING_Z) / EXT);
    want.set(`${tx},${ty}`, [tx, ty]);
  }
  await ensureTiles(BUILDING_Z, [...want.values()]);
  for (const [tx, ty] of want.values()) {
    const vt = readTile(BUILDING_Z, tx, ty);
    if (vt) for (const poi of readParkPois(vt, tx, ty, project, localName)) assign(poi);
  }

  for (const i of cands.keys()) {
    const a = areas[i];
    if (a < 100_000) continue;
    const poi = best(i)!;
    // A POI off to one side of a big green (a garden, a zoo, a playground) names only that corner of it.
    const [cx, cy] = ringCentroid(parks[i][0]);
    if (Math.hypot(poi.x - cx, poi.y - cy) > (PARK_POI[poi.cls] > 0 ? 0.4 : 0.6) * Math.sqrt(a)) continue;
    const minor = PARK_POI[poi.cls] >= 2 ? 1 : 0;
    const rank = Math.min((a > 3e6 ? 2 : a > 1e6 ? 3 : a > 300_000 ? 4 : 5) + minor, fameRank(poi.fame, 2, [40, 20]));
    addLabel({ text: poi.text, local: poi.local, x: poi.x, y: poi.y, kind: 'park', rank, key: `park:${poi.text}`, score: poi.fame });
  }
}

function ringCentroid(r: number[]): [number, number] {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const f = r[j] * r[i + 1] - r[i] * r[j + 1];
    a += f;
    cx += (r[j] + r[i]) * f;
    cy += (r[j + 1] + r[i + 1]) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : [r[0], r[1]];
}

/** A point inside the ring: the midpoint of the widest horizontal span through the bbox middle. */
function interiorPoint(r: number[]): [number, number] {
  const [x0, y0, x1, y1] = ringBBox(r);
  const y = (y0 + y1) / 2 + 1e-3;
  const xs: number[] = [];
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const yi = r[i + 1], yj = r[j + 1];
    if (yi > y !== yj > y) xs.push(r[i] + ((y - yi) / (yj - yi)) * (r[j] - r[i]));
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] = [(x0 + x1) / 2, y];
  let bestW = -1;
  for (let i = 0; i + 1 < xs.length; i += 2)
    if (xs[i + 1] - xs[i] > bestW) {
      bestW = xs[i + 1] - xs[i];
      best = [(xs[i] + xs[i + 1]) / 2, y];
    }
  return best;
}

/** Park-like POI classes, by how well they name the surrounding green polygon (lower is better). */
const PARK_POI: Record<string, number> = { park: 0, nature_reserve: 1, garden: 1, golf: 2, cemetery: 2, zoo: 3 };

function readParkPois(
  vt: VectorTile,
  tx: number,
  ty: number,
  project: (lon: number, lat: number) => [number, number],
  localName: (p: Record<string, unknown>, text: string) => string | undefined,
): ParkPoi[] {
  const out: ParkPoi[] = [];
  const layer = vt.layers.poi;
  if (!layer) return out;
  const rect: Rect = [tx * EXT, ty * EXT, (tx + 1) * EXT, (ty + 1) * EXT];
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    const p = f.properties;
    const cls = p.class as string;
    if (f.type !== 1 || PARK_POI[cls] === undefined) continue;
    const text = englishName(p);
    if (!text) continue;
    const [g] = featurePx(f, tx, ty);
    if (!inRect(g[0], g[1], rect)) continue;
    const [x, y] = project(pxToLon(g[0], BUILDING_Z), pxToLat(g[1], BUILDING_Z));
    out.push({ text, local: localName(p, text), x, y, cls, fame: fame(p) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

interface Footprint {
  id?: number;
  ring: number[]; // global px at BUILDING_Z
  holes: number[][];
  h: number;
  minH: number;
  hide: boolean;
  bb: Rect;
}

interface Piece {
  pts: number[];
  holes: number[][];
  area: number; // px^2, net of courtyards
  h: number;
  tile: number;
}

async function buildBuildings(
  city: CityId,
  project: (lon: number, lat: number) => [number, number],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  onTile: (vt: VectorTile, tx: number, ty: number) => void,
) {
  const Z = BUILDING_Z;
  const cores = CORE[city].map((b) => bboxToPx(b, Z));
  const tileSet = new Map<string, [number, number]>();
  for (const r of cores) for (const t of tilesInRect(r)) tileSet.set(`${t[0]},${t[1]}`, t);
  const tiles = [...tileSet.values()];
  console.log(`  z${Z}: ${tiles.length} building tiles`);
  await ensureTiles(Z, tiles);

  const pieces: Piece[] = [];
  // Edges of pieces that lie on tile boundaries: line key -> [pieceIdx, lo, hi]
  const edgeIndex = new Map<string, number[]>();
  let dropped = { parts: 0, outlines: 0 };

  const perTile: { tileRect: Rect; tileId: number; fps: Footprint[] }[] = [];
  for (const [tx, ty] of tiles) {
    const vt = readTile(Z, tx, ty);
    if (!vt) continue;
    onTile(vt, tx, ty);
    const layer = vt.layers.building;
    if (!layer) continue;
    const tileRect: Rect = [tx * EXT, ty * EXT, (tx + 1) * EXT, (ty + 1) * EXT];
    const tileId = tx * 100000 + ty;
    const fps: Footprint[] = [];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 3) continue;
      const p = f.properties;
      const h = Number(p.render_height ?? 0) || 5;
      const minH = Number(p.render_min_height ?? 0) || 0;
      for (const poly of featurePolygonsPx(f, tx, ty)) {
        const ring = poly[0];
        if (ring.length < 6) continue;
        fps.push({ id: f.id, ring, holes: poly.slice(1), h, minH, hide: p.hide_3d === true, bb: ringBBox(ring) });
      }
    }
    perTile.push({ tileRect, tileId, fps });
  }
  const restored = outlinesMissingParts(perTile.flatMap((t) => t.fps));

  for (const { tileRect, tileId, fps } of perTile) {
    // Grid index for the "does this raised part sit on something" test.
    const G = 32;
    const cell = (EXT + 256) / G;
    const grid: number[][] = Array.from({ length: G * G }, () => []);
    const ci = (v: number, o: number) => Math.max(0, Math.min(G - 1, Math.floor((v - o + 128) / cell)));
    fps.forEach((fp, i) => {
      if (fp.minH > 0) return;
      for (let gy = ci(fp.bb[1], tileRect[1]); gy <= ci(fp.bb[3], tileRect[1]); gy++)
        for (let gx = ci(fp.bb[0], tileRect[0]); gx <= ci(fp.bb[2], tileRect[0]); gx++) grid[gy * G + gx].push(i);
    });
    for (const fp of fps) {
      if (fp.hide && !restored.has(fp.id!)) {
        dropped.outlines++;
        continue;
      }
      if (fp.minH > 0 && !fp.hide) {
        // Keep raised parts (tower on a podium) as full-height boxes when their middle sits on another footprint.
        const cx = (fp.bb[0] + fp.bb[2]) / 2, cy = (fp.bb[1] + fp.bb[3]) / 2;
        const supported = grid[ci(cy, tileRect[1]) * G + ci(cx, tileRect[0])].some((j) => fps[j] !== fp && pointInRing(cx, cy, fps[j].ring));
        if (!supported) {
          dropped.parts++;
          continue;
        }
      }
      const c = clipRing(fp.ring, tileRect);
      if (c.length < 6) continue;
      const area = ringArea(c);
      if (area <= 0) continue;
      const holes = fp.holes.map((r) => clipRing(r, tileRect)).filter((r) => r.length >= 6);
      const idx = pieces.length;
      pieces.push({ pts: c, holes, area: Math.max(0, area + holes.reduce((s, r) => s + ringArea(r), 0)), h: fp.h, tile: tileId });
      const n = c.length / 2;
      for (let a = 0; a < n; a++) {
        const b = (a + 1) % n;
        const x0 = c[2 * a], y0 = c[2 * a + 1], x1 = c[2 * b], y1 = c[2 * b + 1];
        let key: string | null = null;
        let lo = 0, hi = 0;
        if (x0 === x1 && (x0 === tileRect[0] || x0 === tileRect[2])) {
          key = `v${x0}`;
          lo = Math.min(y0, y1);
          hi = Math.max(y0, y1);
        } else if (y0 === y1 && (y0 === tileRect[1] || y0 === tileRect[3])) {
          key = `h${y0}`;
          lo = Math.min(x0, x1);
          hi = Math.max(x0, x1);
        }
        if (!key || hi - lo < 0.5) continue;
        let l = edgeIndex.get(key);
        if (!l) edgeIndex.set(key, (l = []));
        l.push(idx, lo, hi);
      }
    }
  }

  // Union pieces of the same building across tile edges.
  const parent = pieces.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (const l of edgeIndex.values()) {
    const items: [number, number, number][] = [];
    for (let i = 0; i < l.length; i += 3) items.push([l[i], l[i + 1], l[i + 2]]);
    items.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < items.length; i++) {
      const [pa, lo, hi] = items[i];
      for (let j = i + 1; j < items.length && items[j][1] < hi; j++) {
        const [pb, lo2, hi2] = items[j];
        const overlap = Math.min(hi, hi2) - Math.max(lo, lo2);
        if (pieces[pa].tile === pieces[pb].tile || overlap < 0.5 * Math.min(hi - lo, hi2 - lo2)) continue;
        if (Math.abs(pieces[pa].h - pieces[pb].h) > 0.5) continue;
        parent[find(pa)] = find(pb);
      }
    }
  }
  const byRoot = new Map<number, number[]>();
  pieces.forEach((_, i) => {
    const r = find(i);
    let l = byRoot.get(r);
    if (!l) byRoot.set(r, (l = []));
    l.push(i);
  });

  const toLocal = (x: number, y: number) => project(pxToLon(x, Z), pxToLat(y, Z));
  const coreLocal = CORE[city].map(([w, s, e, n]) => [...project(w, s), ...project(e, n)]);
  const pxArea = (() => {
    // m^2 per px^2 around the core (Mercator scale is nearly constant across a city).
    const [x0, y0, x1, y1] = cores[0];
    const [ax, ay] = toLocal(x0, y0), [bx, by] = toLocal(x1, y1);
    return (Math.abs(bx - ax) / (x1 - x0)) * (Math.abs(by - ay) / (y1 - y0));
  })();

  type Box = { cx: number; cy: number; w: number; d: number; a: number; h: number; area: number };
  const boxes: Box[] = [];
  let tiny = 0, split = 0, splitBoxes = 0;
  for (const members of byRoot.values()) {
    const area = members.reduce((s, i) => s + pieces[i].area, 0) * pxArea;
    if (area < 40) {
      tiny++;
      continue;
    }
    const pts: number[] = [];
    for (const i of members) {
      const p = pieces[i].pts;
      for (let k = 0; k < p.length; k += 2) pts.push(...toLocal(p[k], p[k + 1]));
    }
    const obb = minAreaRect(convexHull(pts));
    if (!obb) continue;
    const inCoreArea = coreLocal.some(([x0, y0, x1, y1]) => obb.cx >= x0 && obb.cx <= x1 && obb.cy >= y0 && obb.cy <= y1);
    if (!inCoreArea) continue;
    if (obb.cx < bounds.minX || obb.cx > bounds.maxX || obb.cy < bounds.minY || obb.cy > bounds.maxY) continue;
    const h = Math.max(...members.map((i) => pieces[i].h));
    if (area >= SPLIT_FILL * obb.w * obb.d || obb.w * obb.d < SPLIT_MIN_BOX) {
      boxes.push({ ...obb, h, area });
      continue;
    }
    const local = (r: number[]) => {
      const out: number[] = [];
      for (let k = 0; k < r.length; k += 2) out.push(...toLocal(r[k], r[k + 1]));
      return out;
    };
    const parts = splitFootprint(members.map((i) => local(pieces[i].pts)), members.flatMap((i) => pieces[i].holes.map(local)));
    for (const b of parts) boxes.push({ ...b, h });
    split++;
    splitBoxes += parts.length;
  }

  // Budget: thin out the smallest buildings in the densest 200 m cells first.
  let kept = boxes;
  if (boxes.length > MAX_BUILDINGS) {
    const cellOf = (b: Box) => `${Math.floor(b.cx / 200)},${Math.floor(b.cy / 200)}`;
    const cells = new Map<string, Box[]>();
    for (const b of boxes) {
      const k = cellOf(b);
      let l = cells.get(k);
      if (!l) cells.set(k, (l = []));
      l.push(b);
    }
    const counts = [...cells.values()].map((l) => l.length);
    let lo = 1, hi = Math.max(...counts);
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const total = counts.reduce((s, c) => s + Math.min(c, mid), 0);
      if (total <= MAX_BUILDINGS) lo = mid;
      else hi = mid - 1;
    }
    kept = [];
    for (const l of cells.values()) {
      l.sort((a, b) => b.area * Math.sqrt(b.h) - a.area * Math.sqrt(a.h));
      kept.push(...l.slice(0, lo));
    }
    console.log(`  buildings: capped at ${lo} per 200 m cell (${boxes.length} -> ${kept.length})`);
  }

  const out = new Int16Array(kept.length * BUILDING_STRIDE);
  const q = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));
  kept.forEach((b, i) => {
    out.set([q(b.cx / 2), q(b.cy / 2), q(b.w * 2), q(b.d * 2), q(b.a * 10000), q(b.h * 2)], i * BUILDING_STRIDE);
  });
  console.log(
    `  buildings: ${pieces.length} pieces -> ${byRoot.size} footprints; dropped ${tiny} tiny, ${dropped.parts} floating parts, ${dropped.outlines} outlines ` +
      `(kept ${restored.size} whose parts are missing); ` +
      `split ${split} sprawling ones into ${splitBoxes} boxes; kept ${kept.length}`,
  );
  return out;
}

/**
 * Ids of outlines of buildings mapped in parts whose parts are missing from the tiles or reach less than half their
 * height (ICC's tower above its 110 m podium): those outlines stand in for the whole building.
 */
function outlinesMissingParts(fps: Footprint[]): Set<number> {
  const cell = 512;
  const parts = new Map<string, Footprint[]>();
  for (const p of fps) {
    if (p.hide) continue;
    const k = `${Math.floor((p.bb[0] + p.bb[2]) / 2 / cell)},${Math.floor((p.bb[1] + p.bb[3]) / 2 / cell)}`;
    let l = parts.get(k);
    if (!l) parts.set(k, (l = []));
    l.push(p);
  }
  const outlines = new Set<number>();
  const complete = new Set<number>();
  for (const o of fps) {
    if (!o.hide || o.id === undefined) continue;
    outlines.add(o.id);
    const tall = (p: Footprint) => {
      const cx = (p.bb[0] + p.bb[2]) / 2, cy = (p.bb[1] + p.bb[3]) / 2;
      return p.h >= 0.5 * o.h && inRect(cx, cy, o.bb) && pointInRing(cx, cy, o.ring);
    };
    for (let gx = Math.floor(o.bb[0] / cell); gx <= Math.floor(o.bb[2] / cell) && !complete.has(o.id); gx++)
      for (let gy = Math.floor(o.bb[1] / cell); gy <= Math.floor(o.bb[3] / cell); gy++)
        if (parts.get(`${gx},${gy}`)?.some(tall)) {
          complete.add(o.id);
          break;
        }
  }
  return new Set([...outlines].filter((id) => !complete.has(id)));
}

/** Footprints filling less than this share of their box (courtyards, wings, arcs) get split into several boxes. */
const SPLIT_FILL = 0.65;
const SPLIT_MIN_BOX = 1500; // m²

/**
 * Halves a sprawling footprint across its long side until every part fills its own box (or is small).
 * `outers` and `holes` are rings in local meters; parts that fall inside a courtyard vanish.
 */
function splitFootprint(outers: number[][], holes: number[][], depth = 0): { cx: number; cy: number; w: number; d: number; a: number; area: number }[] {
  const area = outers.reduce((s, r) => s + Math.abs(ringArea(r)), 0) - holes.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
  if (area < 20) return [];
  const obb = minAreaRect(convexHull(outers.flat()));
  if (!obb) return [];
  if (depth >= 6 || area >= SPLIT_FILL * obb.w * obb.d || obb.w * obb.d < 400) return [{ ...obb, area }];
  const [ux, uy] = obb.w >= obb.d ? [Math.cos(obb.a), Math.sin(obb.a)] : [-Math.sin(obb.a), Math.cos(obb.a)];
  const c = obb.cx * ux + obb.cy * uy;
  const half = (sign: number) => {
    const cut = (rings: number[][]) => rings.map((r) => clipHalfPlane(r, sign * ux, sign * uy, sign * c)).filter((r) => r.length >= 6);
    return splitFootprint(cut(outers), cut(holes), depth + 1);
  };
  return [...half(1), ...half(-1)];
}

/** Sutherland-Hodgman clip of a ring to the half-plane x * nx + y * ny <= c. */
function clipHalfPlane(r: number[], nx: number, ny: number, c: number): number[] {
  const out: number[] = [];
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + n - 1) % n;
    const di = r[2 * i] * nx + r[2 * i + 1] * ny - c, dj = r[2 * j] * nx + r[2 * j + 1] * ny - c;
    if (di <= 0 !== dj <= 0) {
      const t = dj / (dj - di);
      out.push(r[2 * j] + t * (r[2 * i] - r[2 * j]), r[2 * j + 1] + t * (r[2 * i + 1] - r[2 * j + 1]));
    }
    if (di <= 0) out.push(r[2 * i], r[2 * i + 1]);
  }
  return out;
}

function convexHull(flat: number[]): number[] {
  const pts: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return flat;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1)).flat();
}

/** Minimum-area oriented rectangle of a convex hull (rotating calipers over hull edges). */
function minAreaRect(h: number[]) {
  const n = h.length / 2;
  if (n < 3) return null;
  let best: { cx: number; cy: number; w: number; d: number; a: number } | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = h[2 * j] - h[2 * i], ey = h[2 * j + 1] - h[2 * i + 1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    const ux = ex / len, uy = ey / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let k = 0; k < n; k++) {
      const u = h[2 * k] * ux + h[2 * k + 1] * uy;
      const v = -h[2 * k] * uy + h[2 * k + 1] * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const mu = (minU + maxU) / 2, mv = (minV + maxV) / 2;
      let a = Math.atan2(uy, ux);
      if (a > Math.PI / 2) a -= Math.PI;
      if (a < -Math.PI / 2) a += Math.PI;
      best = { cx: mu * ux - mv * uy, cy: mu * uy + mv * ux, w: maxU - minU, d: maxV - minV, a };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Building density raster over the whole bbox: public/data/{city}/density.bin
// ---------------------------------------------------------------------------

const DENSITY_MAX_CELLS = 1.3e6;
const DENSITY_SUB = 8; // footprints are point-sampled on an 8x8 grid inside each cell

/**
 * density.bin, little-endian: Int32 w, Int32 h, Float32 minX, Float32 maxY, Float32 cell, then
 * Uint8 coverage[w*h] (footprint share x 255), Uint8 height[w*h] (area-weighted mean m),
 * Uint8 angle[w*h] (dominant footprint orientation mod 90°, 0..255 over [0, π/2)). Row 0 is north.
 */
async function buildDensity(city: CityId) {
  const t0 = Date.now();
  const b = cityBounds(city);
  const { project } = makeProjection(city);
  let cell = Math.max(40, Math.ceil(Math.sqrt(((b.maxX - b.minX) * (b.maxY - b.minY)) / DENSITY_MAX_CELLS)));
  while (Math.ceil((b.maxX - b.minX) / cell) * Math.ceil((b.maxY - b.minY) / cell) > DENSITY_MAX_CELLS) cell++;
  const w = Math.ceil((b.maxX - b.minX) / cell), h = Math.ceil((b.maxY - b.minY) / cell);
  const s = cell / DENSITY_SUB;
  const sw = w * DENSITY_SUB, sh = h * DENSITY_SUB;

  const cityRect = bboxToPx(CITIES[city].bbox, BUILDING_Z);
  const tiles = tilesInRect(cityRect);
  console.log(`  density: ${w}x${h} cells of ${cell} m from ${tiles.length} z${BUILDING_Z} tiles`);
  await ensureTiles(BUILDING_Z, tiles);

  const cover = new Uint32Array(w * h); // samples inside ground-level footprints
  const hW = new Float32Array(w * h), hS = new Float32Array(w * h); // height weight and weighted sum
  const c4 = new Float32Array(w * h), s4 = new Float32Array(w * h); // orientation, 4θ vector sum

  /** Scanline fill (even-odd over all rings) in sample space: u = (x - minX) / s, v = (maxY - y) / s. */
  const fill = (rings: number[][], fn: (i: number) => void) => {
    let v0 = Infinity, v1 = -Infinity;
    for (const r of rings) for (let i = 1; i < r.length; i += 2) {
      if (r[i] < v0) v0 = r[i];
      if (r[i] > v1) v1 = r[i];
    }
    const k0 = Math.max(0, Math.ceil(v0 - 0.5)), k1 = Math.min(sh - 1, Math.ceil(v1 - 0.5) - 1);
    const xs: number[] = [];
    for (let k = k0; k <= k1; k++) {
      const vc = k + 0.5;
      xs.length = 0;
      for (const r of rings)
        for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
          const va = r[j + 1], vb = r[i + 1];
          if (va > vc !== vb > vc) xs.push(r[j] + ((vc - va) / (vb - va)) * (r[i] - r[j]));
        }
      xs.sort((p, q) => p - q);
      const row = Math.floor(k / DENSITY_SUB) * w;
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const q0 = Math.max(0, Math.ceil(xs[i] - 0.5)), q1 = Math.min(sw - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
        for (let q = q0; q <= q1; q++) fn(row + Math.floor(q / DENSITY_SUB));
      }
    }
  };

  let n = 0;
  for (const [tx, ty] of tiles) {
    const layer = readTile(BUILDING_Z, tx, ty)?.layers.building;
    if (!layer) continue;
    const tileRect: Rect = [tx * EXT, ty * EXT, (tx + 1) * EXT, (ty + 1) * EXT];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      const p = f.properties;
      // Outlines of buildings mapped in parts would count twice; their parts stand in for them.
      if (f.type !== 3 || p.hide_3d === true) continue;
      const height = Number(p.render_height ?? 0) || 5;
      const raised = Number(p.render_min_height ?? 0) > 0;
      for (const poly of featurePolygonsPx(f, tx, ty)) {
        const rings: number[][] = [];
        for (const ring of poly) {
          const c = clipRing(ring, tileRect); // exact tile edges: neighbors never count a building twice
          if (c.length < 6) continue;
          const out: number[] = [];
          for (let k = 0; k < c.length; k += 2) {
            const [x, y] = project(pxToLon(c[k], BUILDING_Z), pxToLat(c[k + 1], BUILDING_Z));
            out.push((x - b.minX) / s, (b.maxY - y) / s);
          }
          rings.push(out);
        }
        if (!rings.length) continue;
        n++;
        if (raised) {
          // Towers on podiums: they raise the mean height but don't add ground coverage.
          fill(rings, (i) => {
            hW[i]++;
            hS[i] += height;
          });
          continue;
        }
        // Orientation of the footprint's min-area rectangle (sample space keeps angles; v points south).
        const obb = minAreaRect(convexHull(rings[0]));
        const a4 = obb ? -4 * obb.a : 0;
        const ca = Math.cos(a4), sa = Math.sin(a4);
        fill(rings, (i) => {
          cover[i]++;
          hW[i]++;
          hS[i] += height;
          c4[i] += ca;
          s4[i] += sa;
        });
      }
    }
  }

  const header = Buffer.alloc(20);
  header.writeInt32LE(w, 0);
  header.writeInt32LE(h, 4);
  header.writeFloatLE(b.minX, 8);
  header.writeFloatLE(b.maxY, 12);
  header.writeFloatLE(cell, 16);
  const coverage = new Uint8Array(w * h), height = new Uint8Array(w * h), angle = new Uint8Array(w * h);
  const full = DENSITY_SUB * DENSITY_SUB;
  for (let i = 0; i < w * h; i++) {
    coverage[i] = Math.min(255, Math.round((cover[i] / full) * 255));
    if (hW[i]) height[i] = Math.min(255, Math.round(hS[i] / hW[i]));
    if (cover[i]) {
      const a = Math.atan2(s4[i], c4[i]) / 4; // (-π/4, π/4]
      const m = (a + Math.PI / 2) % (Math.PI / 2); // [0, π/2)
      angle[i] = Math.round((m / (Math.PI / 2)) * 256) % 256;
    }
  }
  const path = `public/data/${city}/density.bin`;
  writeFileSync(path, Buffer.concat([header, coverage, height, angle]));
  const built = coverage.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
  console.log(
    `  density.bin ${(statSync(path).size / 1024).toFixed(0)} KB: ${n} footprints, ${((100 * built) / (w * h)).toFixed(0)}% of cells built on, ` +
      `${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}

// ---------------------------------------------------------------------------

const args = argv.filter((a) => !a.startsWith('--')) as CityId[];
const cities = args.length ? args : CITY_ORDER;
for (const c of cities) if (!CITIES[c]) throw new Error(`Unknown city ${c}`);
for (const c of cities) {
  await buildCity(c);
  if (!argv.includes('--no-density') && !GEO_ONLY) await buildDensity(c);
}
