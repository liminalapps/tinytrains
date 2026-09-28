import type { StockSpec, StockStripe } from '../types.ts';

// Wuhan Metro rolling stock, fall 2026. Dimensions follow the Chinese car-type standards (B: 19 m x 2.8 m, 4 doors;
// A: 22 m x 3.0 m, 5 doors). Wuhan's house style: white aluminum bodies, a black cab mask and a band in the line
// color, from photos on Wikimedia Commons.
const WHITE = '#F2F3F3';
const ROOF = '#9AA1A7';
const GLASS = '#1A1F26';
const MASK = '#17191C';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const bType = { length: 19, width: 2.8, height: 3.8, doors: 4, profile: 'box' as const, pantograph: true };
const aType = { length: 22, width: 3.0, height: 3.8, doors: 5, profile: 'box' as const, pantograph: true };
const white = { finish: 'paint' as const, body: WHITE, roof: ROOF, doorColor: WHITE, windowColor: GLASS };
/** White body, line-color band under the windows, black mask with a line-color trim. */
const house = { ...white, front: MASK, stripes: [band('line', 0.36, 0.42)], frontStripes: [band('line', 0.3, 0.38)] };

export const stock: StockSpec[] = [
  {
    id: 'wuhan-l1', name: 'Line 1 B-type', maker: 'CRRC Changchun / CRRC Zhuzhou', introduced: 2004,
    blurb: "Central China's first urban railway runs on a viaduct the whole way across Hankou; locals still call it the light rail.",
    ...bType, nose: 'rounded', ...white, front: '#2E86C8',
    stripes: [band('line', 0.36, 0.41)],
    frontStripes: [band(MASK, 0.5, 0.88), band(WHITE, 0.28, 0.36)],
  },
  {
    id: 'wuhan-l2', name: 'Line 2 B-type', maker: 'CRRC Zhuzhou / CRRC Changchun', introduced: 2012,
    blurb: "China's first metro line under the Yangtze, it links the airport in Hankou with Optics Valley in Wuchang.",
    ...bType, nose: 'rounded', ...house,
  },
  {
    id: 'wuhan-l3', name: 'Line 3 B-type', maker: 'CRRC Changchun', introduced: 2015,
    blurb: "China's first metro line under the Han River; its livery is the line's 'Guiyuan gold', after Guiyuan Temple.",
    ...bType, nose: 'flat', ...white, front: WHITE,
    stripes: [band('line', 0.36, 0.41)],
    frontStripes: [band(MASK, 0.5, 0.88), band('line', 0.4, 0.46), band('line', 0.88, 0.94)],
  },
  {
    id: 'wuhan-l4', name: 'Line 4 B-type', maker: 'CRRC Zhuzhou / CRRC Changchun', introduced: 2013,
    blurb: "Wuhan's second line under the Yangtze, linking Hanyang with Wuchang and the Wuchang and Wuhan railway stations.",
    ...bType, nose: 'rounded', ...house,
  },
  {
    id: 'wuhan-l5', name: 'Line 5 A-type', maker: 'CRRC Changchun', introduced: 2021,
    blurb: "Wuhan's first driverless line draws power from a third rail and stops at the foot of the Yellow Crane Tower.",
    ...aType, nose: 'rounded', ...house, pantograph: false,
    stripes: [band('line', 0.36, 0.4)],
  },
  {
    id: 'wuhan-l6', name: 'Line 6 A-type', maker: 'CRRC Zhuzhou', introduced: 2016,
    blurb: 'Crosses the Han River between Hankou and Hanyang; its trains are painted in the line\'s "parrot green".',
    ...aType, nose: 'rounded', ...house,
  },
  {
    id: 'wuhan-l7', name: 'Line 7 A-type', maker: 'CRRC Changchun / CRRC Zhuzhou', introduced: 2018,
    blurb: 'At 83 km from Huangpi to Zhifang it is Wuhan\'s longest line, crossing the Yangtze in a shared road-and-rail tunnel.',
    ...aType, nose: 'rounded', ...house,
    frontStripes: [band('line', 0.34, 0.4)],
  },
  {
    id: 'wuhan-l8', name: 'Line 8 A-type', maker: 'CRRC Changchun', introduced: 2017,
    blurb: 'Its platforms were built for 8-car trains, so 10 platform doors on each side stay shut for the 6-car sets.',
    ...aType, nose: 'rounded', ...house,
    stripes: [band('#5E9A96', 0.36, 0.41)],
    frontStripes: [band('#5E9A96', 0.3, 0.38)],
  },
  {
    id: 'wuhan-l11', name: 'Line 11 A-type', maker: 'CRRC Changchun', introduced: 2018,
    blurb: 'Streamlined for 100 km/h to Optics Valley, with "blue sky and white clouds" lighting in the ceiling.',
    ...aType, nose: 'slant', ...house,
  },
  {
    id: 'wuhan-l12', name: 'Line 12 A-type', maker: 'CRRC', introduced: 2026,
    blurb: "Wuhan's driverless ring line opened in May 2026; complete, it will pass under the Yangtze twice and the Han once.",
    ...aType, nose: 'rounded', ...house,
  },
  {
    id: 'wuhan-l16', name: 'Line 16 suburban A-type', maker: 'CRRC Zhuzhou', introduced: 2021,
    blurb: 'Four-car trains at up to 120 km/h, south through Hannan to the general-aviation airfield.',
    ...aType, doors: 4, nose: 'rounded', ...house,
  },
  {
    id: 'wuhan-l19', name: 'Line 19 suburban A-type', maker: 'CRRC', introduced: 2023,
    blurb: 'Just seven stops in 22.7 km: an express from Wuhan Railway Station to Huashan and eastern Optics Valley.',
    ...aType, doors: 4, nose: 'slant', ...house,
  },
  {
    id: 'wuhan-yangluo', name: 'Yangluo Line A-type', maker: 'CRRC Zhuzhou', introduced: 2017,
    blurb: "Four-car trains run 34.6 km out to Yangluo port; the ceilings copy Hanzheng Street station's painted sky.",
    ...aType, nose: 'rounded', ...house,
  },
];
