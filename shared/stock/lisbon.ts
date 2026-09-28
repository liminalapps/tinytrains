import type { StockSpec, StockStripe } from '../types.ts';

// Lisbon, fall 2026. The Metro runs six-car trains of look-alike stainless Sorefame/Siemens triple units (ML90, ML95,
// ML97, ML99) with red cab fronts and blue doors, joined by the Stadler ML20. Carris trams: the two-axle Remodelados
// on the hill lines, and Siemens and CAF Urbos articulated cars on the riverside 15E. CP suburban trains: Sorefame
// 2300/2400 EMUs (Sintra, Azambuja), the stainless 3150 triple units on the Cascais line, and Alstom/CAF double-deckers
// (Fertagus and CP 3500). Colors estimated from photos.

const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });
const GLASS = '#1C2126';
const STAINLESS = '#BCC0C3';
const ROOF = '#8F9397';
const ML_RED = '#D71920';
const ML_BLUE = '#1E5AA8';
const CARRIS_YELLOW = '#F2B705';
const WHITE = '#F2F2EE';
const CP_RED = '#C8102E';

const metro = (id: string, name: string, maker: string, introduced: number, blurb: string): StockSpec => ({
  id, name, maker, introduced, blurb,
  length: 16.2, width: 2.78, height: 3.6, doors: 3, profile: 'box', nose: 'flat', finish: 'stainless',
  body: STAINLESS, roof: ROOF, front: ML_RED, doorColor: ML_BLUE, windowColor: GLASS, skirt: '#5A5E63',
  frontStripes: [band(WHITE, 0.22, 0.27)], pantograph: false,
});

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------ Metro
  metro('lisbon-ml90', 'ML90', 'Sorefame / Siemens', 1993,
    'The first Lisbon trains built as motor-trailer-motor triple units. The two prototypes alone have a door in the cab front.'),
  metro('lisbon-ml95', 'ML95', 'Sorefame / Siemens', 1997,
    'Outwardly a twin of the ML90; inside everything is blue and red. They arrived for the Red Line and Expo 98.'),
  metro('lisbon-ml97', 'ML97', 'Sorefame / Siemens', 1999,
    'The first Lisbon Metro cars with open gangways: you can walk the whole triple unit from cab to cab.'),
  metro('lisbon-ml99', 'ML99', 'Sorefame / Siemens', 2000,
    'The largest series, 114 cars. Their arrival in 2000 let six-car trains run, retiring the original 1959 fleet.'),
  {
    ...metro('lisbon-ml20', 'ML20', 'Stadler / Siemens Mobility', 2025,
      'Built in Valencia, the first Lisbon Metro cars not made in Portugal, with longitudinal red and blue seats inside.'),
    finish: 'paint', body: '#D5D8DA', doorColor: ML_BLUE, stripes: [band(ML_RED, 0.08, 0.12)],
  },

  // ------------------------------------------------------------------ Trams and funiculars
  {
    id: 'lisbon-remodelado', name: 'Remodelado (541–585)', maker: 'Carris, rebuilt with Vossloh Kiepe', introduced: 1995,
    blurb: 'Brill-style four-wheelers of the 1930s, rebuilt in 1995–96 with modern motors: the yellow trams that climb the 28E.',
    length: 8.4, width: 2.3, height: 3.2, doors: 2, profile: 'streetcar', nose: 'flat', finish: 'paint',
    body: CARRIS_YELLOW, roof: '#E9E6DF', front: CARRIS_YELLOW, doorColor: '#C99A04', windowColor: '#2A2622', skirt: '#3A3A3A',
    stripes: [band(WHITE, 0.84, 1)], frontStripes: [band(WHITE, 0.84, 1)], pantograph: false, trolleyPole: true,
  },
  {
    id: 'lisbon-siemens', name: 'Articulated tram (501–510)', maker: 'Siemens / Duewag, CAF, Sorefame', introduced: 1995,
    blurb: 'Ten three-section cars from 1995 with floors just 30 cm above the street, too long for any line but the riverside 15E.',
    length: 24, width: 2.4, height: 3.4, doors: 4, profile: 'tram', nose: 'rounded', finish: 'paint', sections: 3,
    body: CARRIS_YELLOW, roof: '#E9E6DF', front: CARRIS_YELLOW, doorColor: '#C99A04', windowColor: GLASS, skirt: '#3A3A3A',
    stripes: [band(WHITE, 0.82, 1)], frontStripes: [band(GLASS, 0.5, 0.82)], pantograph: true,
  },
  {
    id: 'lisbon-urbos', name: 'CAF Urbos (601–615)', maker: 'CAF', introduced: 2023,
    blurb: "Five sections and 28 m long, carrying 220: Lisbon's first new trams in almost 30 years, built for the 15E to Belém.",
    length: 28, width: 2.4, height: 3.5, doors: 4, profile: 'tram', nose: 'rounded', finish: 'paint', sections: 5,
    body: CARRIS_YELLOW, roof: '#D9D9D6', front: CARRIS_YELLOW, doorColor: '#D9A504', windowColor: GLASS, skirt: '#2B2B2B',
    stripes: [band('#2B2B2B', 0, 0.12)], frontStripes: [band(GLASS, 0.45, 0.85)], pantograph: true,
  },
  {
    id: 'lisbon-bica', name: 'Bica funicular car', maker: 'Nova Companhia dos Ascensores Mecânicos de Lisboa', introduced: 1892,
    blurb: 'Two stepped cars climb 283 m of an ordinary street since 1892, starting from inside a building as if leaving a tunnel.',
    length: 8, width: 2.1, height: 3.2, doors: 3, profile: 'cablecar', nose: 'flat', finish: 'paint',
    body: CARRIS_YELLOW, roof: '#E9E6DF', front: CARRIS_YELLOW, doorColor: '#C99A04', windowColor: '#2A2622', skirt: '#3A3A3A',
    stripes: [band(WHITE, 0.84, 1)], frontStripes: [band(WHITE, 0.84, 1)], pantograph: false,
  },
  {
    id: 'lisbon-graca', name: 'Graça funicular car', maker: 'Carris', introduced: 2024,
    blurb: 'A short modern funicular up from Rua dos Lagares, reviving a Graça line that ran from 1893 to 1909.',
    length: 6, width: 2.2, height: 2.9, doors: 1, profile: 'cablecar', nose: 'flat', finish: 'paint',
    body: CARRIS_YELLOW, roof: '#D9D9D6', front: CARRIS_YELLOW, doorColor: CARRIS_YELLOW, windowColor: GLASS, skirt: '#3A3A3A',
    stripes: [band(GLASS, 0.4, 0.9)], frontStripes: [band(GLASS, 0.4, 0.9)], pantograph: false,
  },

  // ------------------------------------------------------------------ CP and Fertagus
  {
    id: 'lisbon-cp2300', name: 'CP 2300', maker: 'Sorefame / Siemens', introduced: 1992,
    blurb: 'Bought when the Sintra line was quadrupled around 1992; 42 four-car units, often coupled into eight-car trains.',
    length: 25, width: 2.95, height: 4.2, doors: 2, profile: 'box', nose: 'slant', finish: 'stainless',
    body: STAINLESS, roof: ROOF, front: CP_RED, doorColor: '#D8DADB', windowColor: GLASS, skirt: '#4A4E52',
    stripes: [band(CP_RED, 0.3, 0.36)], pantograph: true,
  },
  {
    id: 'lisbon-cp2400', name: 'CP 2400', maker: 'Sorefame / Siemens', introduced: 1997,
    blurb: 'Fourteen later cousins of the 2300s, with 316 seats and a top speed of 120 km/h, for Sintra and Azambuja trains.',
    length: 25, width: 2.95, height: 4.2, doors: 2, profile: 'box', nose: 'slant', finish: 'stainless',
    body: STAINLESS, roof: ROOF, front: CP_RED, doorColor: '#D8DADB', windowColor: GLASS, skirt: '#4A4E52',
    stripes: [band(CP_RED, 0.3, 0.36)], pantograph: true,
  },
  {
    id: 'lisbon-cp3150', name: 'CP 3150/3250', maker: 'Sorefame, rebuilt by CP', introduced: 1999,
    blurb: 'Stainless triple units rebuilt from the older 3200s. The Cascais line runs apart on 1500 V DC, so they never leave it.',
    length: 23.5, width: 2.9, height: 4.1, doors: 3, profile: 'box', nose: 'flat', finish: 'stainless',
    body: STAINLESS, roof: ROOF, front: '#F2C300', doorColor: '#C9CCCE', windowColor: GLASS, skirt: '#4A4E52',
    frontStripes: [band('#2B2B2B', 0, 0.12)], pantograph: true,
  },
  {
    id: 'lisbon-cp3500', name: 'CP 3500 (double-deck)', maker: 'Alstom / CAF', introduced: 1999,
    blurb: 'A Portuguese cousin of Renfe’s 450 double-deckers; CP keeps twelve of the thirty for its Sintra and Azambuja trains.',
    length: 26, width: 2.94, height: 4.3, doors: 2, profile: 'bilevel', nose: 'slant', finish: 'paint',
    body: WHITE, roof: '#C9CCCE', front: CP_RED, doorColor: CP_RED, windowColor: GLASS, skirt: '#4A4E52',
    stripes: [band(CP_RED, 0.05, 0.12)], pantograph: true,
  },
  {
    id: 'lisbon-fertagus', name: 'Fertagus 3500 (double-deck)', maker: 'Alstom / CAF', introduced: 1999,
    blurb: 'Eighteen double-deckers that cross the Tagus on the lower deck of the 25 de Abril bridge, high above the river.',
    length: 26, width: 2.94, height: 4.3, doors: 2, profile: 'bilevel', nose: 'slant', finish: 'paint',
    body: WHITE, roof: '#C9CCCE', front: WHITE, doorColor: '#1D4F9C', windowColor: GLASS, skirt: '#1D4F9C',
    stripes: [band('#1D4F9C', 0, 0.3), band('#6FB7E4', 0.3, 0.36)], frontStripes: [band('#1D4F9C', 0, 0.3)], pantograph: true,
  },
];
