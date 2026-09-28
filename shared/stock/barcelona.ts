import type { StockSpec, StockStripe } from '../types.ts';

// Barcelona, fall 2026. TMB Metro runs five-car trains in white with red cab fronts: CAF's 5000/6000 and new
// 7000/8000, the older 2100 on L4, and Alstom Metropolis 9000s (driverless on L9/L10). L1 is broad (Iberian) gauge,
// with wider cars. FGC: white 112/113/114/115 units on the Barcelona–Vallès line, metre-gauge 213s on Llobregat–Anoia.
// TRAM: Alstom Citadis 302. Rodalies: Renfe 447s, Civia and 450/451 double-deckers in the Rodalies orange.
// Colors estimated from photos.

const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });
const GLASS = '#1C2126';
const WHITE = '#F2F2EF';
const ROOF = '#B9BDC0';
const TMB_RED = '#D52B1E';
const FGC_ORANGE = '#F28C00';
const FGC_RED = '#D7262C';
const TRAM_TEAL = '#00917C';
const RODALIES_ORANGE = '#F2641E';
const DARK = '#3A3E42';

const tmb = (o: Partial<StockSpec> & Pick<StockSpec, 'id' | 'name' | 'maker' | 'introduced' | 'blurb'>): StockSpec => ({
  length: 17.8, width: 2.7, height: 3.7, doors: 4, profile: 'box', nose: 'rounded', finish: 'paint',
  body: WHITE, roof: ROOF, front: TMB_RED, doorColor: '#D9DBDC', windowColor: GLASS, skirt: DARK,
  stripes: [band(TMB_RED, 0.08, 0.14)], frontStripes: [band(GLASS, 0.5, 0.85)], pantograph: true,
  ...o,
});

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------ Metro
  tmb({
    id: 'barcelona-6000', name: 'Series 6000', maker: 'CAF', introduced: 2007, width: 2.9, height: 3.8,
    blurb: 'The broad-gauge twin of the 5000, built for L1, whose 1926 tunnels were dug wide for Iberian-gauge trains.',
  }),
  tmb({
    id: 'barcelona-8000', name: 'Series 8000', maker: 'CAF', introduced: 2023, width: 2.9, height: 3.8, doorColor: TMB_RED,
    front: '#2A2D30', frontStripes: [band(TMB_RED, 0.1, 0.45)],
    blurb: 'Arrived on L1 from July 2023 at about two trains a month, retiring the 4000s found to contain asbestos.',
  }),
  tmb({
    id: 'barcelona-5000', name: 'Series 5000', maker: 'CAF', introduced: 2005,
    blurb: 'The first Barcelona trains with every door evenly spaced; by 2007 they had replaced every train on L5.',
  }),
  tmb({
    id: 'barcelona-7000', name: 'Series 7000', maker: 'CAF', introduced: 2023, doorColor: TMB_RED,
    front: '#2A2D30', frontStripes: [band(TMB_RED, 0.1, 0.45)],
    blurb: 'Standard-gauge sister of the 8000, in service on L3 since 13 March 2023, with LED lighting and USB ports.',
  }),
  tmb({
    id: 'barcelona-2100', name: 'Series 2100', maker: 'CAF / Alstom', introduced: 1995, doors: 4,
    blurb: 'Opened L2 in 1995 with walk-through gangways, then moved to L4 when the 9000s arrived; refurbished from 2019.',
  }),
  tmb({
    id: 'barcelona-9000', name: 'Series 9000 (Alstom Metropolis)', maker: 'Alstom', introduced: 2006, length: 18, width: 2.71, height: 3.86,
    nose: 'slant', blurb: 'Built for driverless L9, but its tunnels ran late, so the first 9000s got removable cabs and went to L2 in 2006.',
  }),
  tmb({
    id: 'barcelona-9000-auto', name: 'Series 9000 driverless', maker: 'Alstom', introduced: 2009, length: 18, width: 2.71, height: 3.86,
    nose: 'slant', front: WHITE, frontStripes: [band(GLASS, 0.35, 0.9), band(TMB_RED, 0.05, 0.12)],
    blurb: 'No cab at all on L9 and L10: the front is a big window with an evacuation door and fold-down ramp.',
  }),
  tmb({
    id: 'barcelona-500', name: 'Series 500', maker: 'CAF / Alstom', introduced: 2003,
    blurb: 'Two-car trains adapted from the 2100 for L11, a short hillside line of 2003 that runs mostly on autopilot.',
  }),
  {
    id: 'barcelona-fm', name: 'Montjuïc Funicular car', maker: 'TMB', introduced: 1992,
    blurb: 'Opened in 1928 for the 1929 Exhibition and rebuilt for the 1992 Olympics; its trains climb 758 m up Montjuïc.',
    length: 16, width: 2.8, height: 3.4, doors: 4, profile: 'box', nose: 'flat', finish: 'paint',
    body: WHITE, roof: ROOF, front: '#00795A', doorColor: WHITE, windowColor: GLASS, skirt: DARK,
    stripes: [band('#00795A', 0.05, 0.14)], frontStripes: [band(GLASS, 0.45, 0.9)], pantograph: false,
  },

  // ------------------------------------------------------------------ FGC
  {
    id: 'barcelona-fgc112', name: 'FGC 112', maker: 'CAF / GEC Alsthom', introduced: 1995,
    blurb: 'Built in two batches (CAF in 1995, Alstom later) to launch the frequent "Metro del Vallès" service.',
    length: 20, width: 2.76, height: 3.7, doors: 4, profile: 'box', nose: 'rounded', finish: 'paint',
    body: WHITE, roof: ROOF, front: FGC_RED, doorColor: FGC_RED, windowColor: GLASS, skirt: DARK,
    stripes: [band(DARK, 0.45, 0.8)], frontStripes: [band(GLASS, 0.5, 0.85)], pantograph: true,
  },
  {
    id: 'barcelona-fgc113', name: 'FGC 113', maker: 'Alstom / CAF', introduced: 2014,
    blurb: 'Four cars and 80.5 m long, replacing the troubled 111s on the Vallès line in 2014.',
    length: 20.1, width: 2.76, height: 3.8, doors: 4, profile: 'box', nose: 'slant', finish: 'paint',
    body: WHITE, roof: ROOF, front: WHITE, doorColor: FGC_ORANGE, windowColor: GLASS, skirt: DARK,
    stripes: [band(DARK, 0.45, 0.82)], frontStripes: [band(GLASS, 0.45, 0.85), band(FGC_ORANGE, 0, 0.12)], pantograph: true,
  },
  {
    id: 'barcelona-fgc114', name: 'FGC 114', maker: 'Alstom / CAF', introduced: 2014,
    blurb: 'A three-car 113, 60 m long, the only size that fits the short platforms of the L7 up to Tibidabo.',
    length: 20, width: 2.76, height: 3.8, doors: 4, profile: 'box', nose: 'slant', finish: 'paint',
    body: WHITE, roof: ROOF, front: WHITE, doorColor: FGC_ORANGE, windowColor: GLASS, skirt: DARK,
    stripes: [band(DARK, 0.45, 0.82)], frontStripes: [band(GLASS, 0.45, 0.85), band(FGC_ORANGE, 0, 0.12)], pantograph: true,
  },
  {
    id: 'barcelona-fgc115', name: 'FGC 115', maker: 'Stadler', introduced: 2022,
    blurb: "FGC's first Stadler trains: fifteen four-car units for 775 riders each, bought for 12 trains an hour to Terrassa and Sabadell.",
    length: 20, width: 2.76, height: 3.8, doors: 4, profile: 'box', nose: 'slant', finish: 'paint',
    body: WHITE, roof: ROOF, front: FGC_ORANGE, doorColor: FGC_ORANGE, windowColor: GLASS, skirt: DARK,
    stripes: [band(DARK, 0.45, 0.82)], frontStripes: [band(GLASS, 0.45, 0.85)], pantograph: true,
  },
  {
    id: 'barcelona-fgc213', name: 'FGC 213', maker: 'Alstom, CAF and ADtranz', introduced: 1999,
    blurb: 'Metre-gauge aluminum units of the Llobregat–Anoia line; part of the middle car sits low for step-free boarding.',
    length: 20, width: 2.55, height: 3.7, doors: 3, profile: 'box', nose: 'rounded', finish: 'paint',
    body: WHITE, roof: ROOF, front: FGC_RED, doorColor: FGC_RED, windowColor: GLASS, skirt: '#8A8E91',
    stripes: [band('#8A8E91', 0.08, 0.2), band(GLASS, 0.45, 0.8)], frontStripes: [band(GLASS, 0.5, 0.85)], pantograph: true,
  },
  {
    id: 'barcelona-fv', name: 'Vallvidrera Funicular car', maker: 'FGC', introduced: 1906,
    blurb: 'Built with Swiss firm Von Roll in 1905–06, it climbs 736 m to Vallvidrera, now fully automatic behind platform doors.',
    length: 12, width: 2.6, height: 3.3, doors: 3, profile: 'box', nose: 'flat', finish: 'paint',
    body: WHITE, roof: ROOF, front: '#0A57A3', doorColor: WHITE, windowColor: GLASS, skirt: DARK,
    stripes: [band('#0A57A3', 0.05, 0.16)], frontStripes: [band(GLASS, 0.45, 0.9)], pantograph: false,
  },

  // ------------------------------------------------------------------ TRAM
  {
    id: 'barcelona-citadis302', name: 'Alstom Citadis 302', maker: 'Alstom', introduced: 2004,
    blurb: 'Five low-floor sections, 32 m long and 2.65 m wide; the same 41-tram fleet runs both Trambaix and Trambesòs.',
    length: 32, width: 2.65, height: 3.27, doors: 4, profile: 'tram', nose: 'rounded', finish: 'paint', sections: 5,
    body: WHITE, roof: '#9EA3A6', front: TRAM_TEAL, doorColor: '#B8BDC0', windowColor: GLASS, skirt: '#6A6F73',
    stripes: [band(TRAM_TEAL, 0, 0.14)], frontStripes: [band(GLASS, 0.45, 0.85)], pantograph: true,
  },

  // ------------------------------------------------------------------ Rodalies
  {
    id: 'barcelona-447', name: 'Renfe 447', maker: 'CAF, Alstom, Siemens, ABB', introduced: 1993,
    blurb: "The backbone of Rodalies: 111 three-car units, 76 m each, often coupled in pairs on the busiest lines.",
    length: 25.3, width: 2.9, height: 4.19, doors: 3, profile: 'box', nose: 'slant', finish: 'paint',
    body: WHITE, roof: ROOF, front: RODALIES_ORANGE, doorColor: RODALIES_ORANGE, windowColor: GLASS, skirt: DARK,
    stripes: [band(RODALIES_ORANGE, 0.12, 0.2)], frontStripes: [band(GLASS, 0.5, 0.85)], pantograph: true,
  },
  {
    id: 'barcelona-civia', name: 'Renfe Civia (463–465)', maker: 'CAF / Alstom / Siemens', introduced: 2006,
    blurb: 'A modular low-floor train that can be built with 2 to 5 cars; the 98 m, five-car 465 is the Rodalies workhorse.',
    length: 19.6, width: 2.94, height: 4.27, doors: 2, profile: 'box', nose: 'rounded', finish: 'paint',
    body: WHITE, roof: ROOF, front: RODALIES_ORANGE, doorColor: RODALIES_ORANGE, windowColor: GLASS, skirt: '#8A8E91',
    stripes: [band('#8A8E91', 0.1, 0.18), band(GLASS, 0.45, 0.8)], frontStripes: [band(GLASS, 0.5, 0.85)], pantograph: true,
  },
  {
    id: 'barcelona-450', name: 'Renfe 450/451 (double-deck)', maker: 'Alstom / CAF', introduced: 1991,
    blurb: "Spain's first double-deck EMUs; a six-car 450 seats over 1,000 people, twice a single-deck train.",
    length: 26.6, width: 2.92, height: 4.3, doors: 2, profile: 'bilevel', nose: 'slant', finish: 'paint',
    body: WHITE, roof: ROOF, front: RODALIES_ORANGE, doorColor: RODALIES_ORANGE, windowColor: GLASS, skirt: DARK,
    stripes: [band(RODALIES_ORANGE, 0.05, 0.12)], frontStripes: [band(GLASS, 0.5, 0.85)], pantograph: true,
  },
];
