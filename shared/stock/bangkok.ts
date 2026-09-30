import type { StockSpec, StockStripe } from '../types.ts';

// Bangkok: BTS and MRT metros take 750 V DC from a third rail; the Airport Rail Link and the SRT Red Lines run under
// 25 kV overhead wire. The Yellow and Pink monorails and the Gold Line people mover are rubber-tired. Colors from photos.
const WHITE = '#EEF0F2';
const SILVER = '#C9CED3';
const GLASS = '#1A2129';
const BTS_BLUE = '#1C4C9C';
const BTS_RED = '#D7262E';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

/** BTS's house livery: white above, blue below, a red pinstripe between. */
const btsWhite: Pick<StockSpec, 'finish' | 'body' | 'roof' | 'front' | 'doorColor' | 'windowColor' | 'stripes' | 'frontStripes' | 'pantograph'> = {
  finish: 'paint', body: WHITE, roof: '#C4CAD0', front: WHITE, doorColor: WHITE, windowColor: GLASS,
  stripes: [band(BTS_BLUE, 0, 0.36), band(BTS_RED, 0.36, 0.4)],
  frontStripes: [band(BTS_BLUE, 0, 0.3), band(BTS_RED, 0.3, 0.34), band(GLASS, 0.48, 0.9)],
  pantograph: false,
};

/** The Innovia Monorail 300 cars: white sides, a black window band and line-colored ends. */
const monorail = (id: string, color: string, introduced: number, blurb: string): StockSpec => ({
  id, name: 'Innovia Monorail 300', maker: 'Alstom (Bombardier) / CRRC Puzhen', introduced, blurb,
  length: 13, width: 3.1, height: 3.8, doors: 2, profile: 'monorail', nose: 'rounded',
  finish: 'paint', body: WHITE, roof: '#D5D9DD', front: color, doorColor: WHITE, windowColor: GLASS,
  stripes: [band(GLASS, 0.42, 0.8), band(color, 0.06, 0.14)],
  frontStripes: [band(GLASS, 0.5, 0.88)],
  endBand: { color, width: 1.4 },
  pantograph: false,
});

export const stock: StockSpec[] = [
  {
    id: 'bangkok-bts-a1', name: 'EMU-A1 (Siemens Modular Metro)', maker: 'Siemens', introduced: 1999,
    blurb: 'Opened the Skytrain in 1999 as three-car sets; each of the 35 trains got a fourth car in 2012–13.',
    length: 21.8, width: 3.12, height: 3.9, doors: 4, profile: 'rounded', nose: 'flat', ...btsWhite,
  },
  {
    id: 'bangkok-bts-a2', name: 'EMU-A2 (Siemens Inspiro)', maker: 'Siemens / Bozankaya', introduced: 2019,
    blurb: 'Bought for the Kheha extension; until enough arrived, the new stations got a shuttle every 10 minutes.',
    length: 22, width: 3.12, height: 3.9, doors: 4, profile: 'rounded', nose: 'rounded',
    finish: 'paint', body: BTS_BLUE, roof: '#C4CAD0', front: WHITE, doorColor: BTS_BLUE, windowColor: GLASS,
    stripes: [band(WHITE, 0.8, 0.86), band(BTS_RED, 0.76, 0.8)],
    frontStripes: [band(BTS_BLUE, 0, 0.22), band(BTS_RED, 0.22, 0.28), band(GLASS, 0.48, 0.9)],
    pantograph: false,
  },
  {
    id: 'bangkok-bts-b1', name: 'EMU-B1/B2', maker: 'CNR Changchun', introduced: 2010,
    blurb: 'Built for the Silom Line’s river crossing to Wongwian Yai, but delivered 18 months after it opened.',
    length: 22, width: 3.12, height: 3.9, doors: 4, profile: 'rounded', nose: 'flat', ...btsWhite,
  },
  {
    id: 'bangkok-bts-b3', name: 'EMU-B3', maker: 'CRRC Changchun', introduced: 2019,
    blurb: '24 four-car trains ordered for the northern extension to Khu Khot, which runs up Phahonyothin Road.',
    length: 22, width: 3.12, height: 3.9, doors: 4, profile: 'rounded', nose: 'rounded', ...btsWhite,
  },
  {
    id: 'bangkok-mrt-siemens', name: 'Siemens Modular Metro', maker: 'Siemens', introduced: 2004,
    blurb: 'Opened Bangkok’s first subway in 2004: 19 three-car trains running under Rama IV and Ratchadaphisek.',
    length: 21.7, width: 3.12, height: 3.7, doors: 4, profile: 'rounded', nose: 'flat',
    finish: 'stainless', body: SILVER, roof: '#B4BAC0', front: SILVER, doorColor: SILVER, windowColor: GLASS,
    stripes: [band('#1964B7', 0.22, 0.3), band('#0F2F66', 0.3, 0.33)],
    frontStripes: [band('#1964B7', 0.18, 0.28), band(GLASS, 0.46, 0.9)],
    pantograph: false,
  },
  {
    id: 'bangkok-mrt-inspiro', name: 'Siemens Inspiro', maker: 'Siemens / Bozankaya', introduced: 2019,
    blurb: '35 trains for the extensions that closed the Blue Line’s loop: it tunnels under the Chao Phraya and bridges over it.',
    length: 22, width: 3.12, height: 3.7, doors: 4, profile: 'rounded', nose: 'rounded',
    finish: 'paint', body: '#1F6ED4', roof: '#B4BAC0', front: '#16345F', doorColor: '#1F6ED4', windowColor: GLASS,
    stripes: [band('#16345F', 0, 0.1)],
    frontStripes: [band(GLASS, 0.44, 0.9)],
    pantograph: false,
  },
  {
    id: 'bangkok-mrt-sustina', name: 'J-TREC Sustina', maker: 'J-TREC', introduced: 2016,
    blurb: 'The first Sustina built for export: Japanese stainless-steel cars that cross the Chao Phraya into Nonthaburi.',
    length: 20, width: 3.2, height: 3.7, doors: 4, profile: 'box', nose: 'slant',
    finish: 'stainless', body: SILVER, roof: '#B4BAC0', front: '#2A2230', doorColor: SILVER, windowColor: GLASS,
    stripes: [band('line', 0.84, 0.92), band('line', 0.2, 0.26)],
    frontStripes: [band('line', 0.1, 0.2), band(GLASS, 0.44, 0.9)],
    pantograph: false,
  },
  monorail('bangkok-innovia-yellow', '#F4C400', 2023,
    'Thailand’s first monorail line: 30 four-car trains straddle a single concrete beam above Srinagarindra Road.'),
  monorail('bangkok-innovia-pink', '#E0407E', 2023,
    'At 34.5 km, one of the world’s longest monorails; a spur runs into the IMPACT Muang Thong Thani expo grounds.'),
  {
    id: 'bangkok-gold-apm', name: 'Innovia APM 300', maker: 'Bombardier', introduced: 2020,
    blurb: 'A rubber-tired people mover, largely funded by the ICONSIAM mall, that links it to the Skytrain in six minutes.',
    length: 12.75, width: 2.85, height: 3.4, doors: 2, profile: 'agt', nose: 'rounded',
    finish: 'paint', body: WHITE, roof: '#5B3A24', front: '#5B3A24', doorColor: WHITE, windowColor: GLASS,
    stripes: [band('#5B3A24', 0.52, 1), band('#C9A227', 0.46, 0.52)],
    frontStripes: [band('#C9A227', 0.3, 0.36), band(GLASS, 0.46, 0.9)],
    pantograph: false,
  },
  {
    id: 'bangkok-arl-desiro', name: 'Siemens Desiro', maker: 'Siemens', introduced: 2010,
    blurb: 'Built on Britain’s Desiro design; the nonstop Express to Suvarnabhumi ended in 2014, so all now stop everywhere.',
    length: 20.3, width: 2.8, height: 3.8, doors: 2, profile: 'rounded', nose: 'rounded',
    finish: 'paint', body: WHITE, roof: '#AEB4BA', front: WHITE, doorColor: '#1D2F6B', windowColor: GLASS,
    stripes: [band('#1D2F6B', 0.06, 0.18), band('#C8102E', 0.18, 0.24)],
    frontStripes: [band('#C8102E', 0.14, 0.22), band(GLASS, 0.46, 0.9)],
    pantograph: true,
  },
  {
    id: 'bangkok-at100', name: 'Hitachi AT100', maker: 'Hitachi', introduced: 2021,
    blurb: 'Built in Kasado, Japan: 15 six-car trains for the Dark Red Line and 10 four-car trains for the Light Red.',
    length: 20, width: 3.0, height: 3.8, doors: 4, profile: 'box', nose: 'slant',
    finish: 'paint', body: WHITE, roof: '#AEB4BA', front: '#D8262C', doorColor: WHITE, windowColor: GLASS,
    stripes: [band('#D8262C', 0.78, 0.86), band('#D8262C', 0.08, 0.16)],
    frontStripes: [band('#4A4F55', 0, 0.2), band(GLASS, 0.46, 0.9)],
    pantograph: true,
  },
];
