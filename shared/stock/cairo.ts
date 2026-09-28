import type { StockSpec, StockStripe } from '../types.ts';

// Cairo Metro and the East Nile monorail. Line 1 runs on 1.5 kV overhead wires; Lines 2 and 3 take 750 V from a
// third rail. Dimensions from the builders' figures where published (Line 1 units: 63.4 m for three cars, 2.88 m wide),
// colors from photos; the Line 1 and Line 3 Hyundai Rotem liveries are estimates.
const STAINLESS = '#C6CACE';
const WHITE = '#EEF0F2';
const ROOF = '#8D9399';
const GLASS = '#1A1F26';
const FACE = '#1B1F26';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

const metroCar = { length: 21.1, width: 2.88, height: 3.8, doors: 4, profile: 'box' as const };

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- Line 1
  {
    id: 'cairo-l1-classic', name: 'Line 1 three-car units', maker: 'Alstom / Semaf; Mitsubishi / Kinki Sharyo / Toshiba', introduced: 1987,
    blurb: "Ran Africa's first metro in 1987. South of downtown, Line 1 runs in the open on the old Helwan suburban railway.",
    ...metroCar, nose: 'flat', finish: 'paint', body: '#5FB4E0', roof: '#9AA1A7', front: '#5FB4E0', doorColor: '#5FB4E0', windowColor: GLASS,
    skirt: '#1D5FA8', stripes: [band('#F4F6F7', 0.06, 0.3), band('#1D5FA8', 0.14, 0.18)],
    frontStripes: [band('#F4F6F7', 0.06, 0.3), band(FACE, 0.5, 0.86)],
    pantograph: true,
  },
  {
    id: 'cairo-l1-rotem', name: 'Line 1 Hyundai Rotem train', maker: 'Hyundai Rotem', introduced: 2015,
    blurb: "Line 1's first air-conditioned trains: twenty nine-car sets ordered in 2012 for $360 million to replace its oldest stock.",
    ...metroCar, nose: 'rounded', finish: 'stainless', body: STAINLESS, roof: ROOF, front: STAINLESS, doorColor: STAINLESS, windowColor: GLASS,
    stripes: [band('line', 0.3, 0.36)],
    frontStripes: [band('line', 0.28, 0.36), band(FACE, 0.5, 0.9)],
    pantograph: true,
  },
  {
    id: 'cairo-l1-metropolis', name: 'Alstom Metropolis (Line 1)', maker: 'Alstom', introduced: 2025,
    blurb: 'One of 55 air-conditioned nine-car trains ordered in 2021 to renew Line 1. The first began trial runs in May 2025.',
    ...metroCar, nose: 'rounded', finish: 'paint', body: WHITE, roof: '#A3A9AE', front: WHITE, doorColor: WHITE, windowColor: GLASS,
    stripes: [band('#2E86D0', 0.12, 0.2), band('#2E86D0', 0.86, 0.9)],
    frontStripes: [band(FACE, 0.2, 0.9), band('#2E86D0', 0.9, 0.96)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Line 2
  {
    id: 'cairo-l2-japan', name: 'Line 2 train', maker: 'Mitsubishi / Kinki Sharyo / Toshiba', introduced: 1996,
    blurb: 'Line 2 was the first metro to tunnel under the Nile. As on every Cairo train, the two middle cars are reserved for women.',
    length: 20, width: 2.9, height: 3.7, doors: 4, profile: 'box', nose: 'flat',
    finish: 'paint', body: '#E4E6E8', roof: '#A0A6AB', front: '#E4E6E8', doorColor: '#E4E6E8', windowColor: GLASS,
    stripes: [band('#8A6BB8', 0.04, 0.2), band('#F08A3C', 0.2, 0.32)],
    frontStripes: [band('#8A6BB8', 0.04, 0.2), band('#F08A3C', 0.2, 0.32), band(FACE, 0.45, 0.9)],
    pantograph: false,
  },
  // ---------------------------------------------------------------- Line 3
  {
    id: 'cairo-l3-japan', name: 'Line 3 train', maker: 'Mitsubishi / Kinki Sharyo / Toshiba', introduced: 2012,
    blurb: "Line 3 dives under both branches of the Nile, either side of Zamalek island, between Kit Kat and downtown.",
    length: 20, width: 2.9, height: 3.7, doors: 4, profile: 'box', nose: 'rounded',
    finish: 'paint', body: '#2DB0C8', roof: '#8F969C', front: '#2DB0C8', doorColor: STAINLESS, windowColor: GLASS,
    skirt: '#B9BEC3', stripes: [band('#B9BEC3', 0, 0.38), band('#F2C300', 0.38, 0.44)],
    frontStripes: [band('#B9BEC3', 0, 0.38), band(FACE, 0.5, 0.9)],
    pantograph: false,
  },
  {
    id: 'cairo-l3-rotem', name: 'Line 3 Hyundai Rotem train', maker: 'Hyundai Rotem / NERIC', introduced: 2022,
    blurb: '256 cars from a Korean–Egyptian joint venture, ordered in 2017 for the Line 3 extensions west to Imbaba and Cairo University.',
    length: 20, width: 2.9, height: 3.7, doors: 4, profile: 'box', nose: 'rounded',
    finish: 'stainless', body: STAINLESS, roof: ROOF, front: FACE, doorColor: STAINLESS, windowColor: GLASS,
    stripes: [band('line', 0.3, 0.37)],
    frontStripes: [band('line', 0.24, 0.34)],
    pantograph: false,
  },
  // ---------------------------------------------------------------- East Nile monorail
  {
    id: 'cairo-innovia', name: 'Alstom Innovia Monorail 300', maker: 'Alstom', introduced: 2026,
    blurb: 'Driverless trains ride a single concrete beam 56 km from Nasr City out to the New Administrative Capital.',
    length: 13, width: 3.1, height: 3.5, doors: 2, profile: 'monorail', nose: 'rounded',
    finish: 'paint', body: WHITE, roof: '#B6BBC0', front: FACE, doorColor: WHITE, windowColor: GLASS,
    stripes: [band('line', 0.1, 0.2)],
    frontStripes: [band('line', 0.1, 0.25)],
    pantograph: false,
  },
];
