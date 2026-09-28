import type { StockSpec, StockStripe } from '../types.ts';

// Paris Métro, RER and Tramway rolling stock in service, fall 2026. Dimensions are per car (per whole vehicle
// for trams). Three liveries recur: RATP's 1990s jade green and white, the RATP–STIF look of the 2000s (silver,
// jade at the doors) and today's Île-de-France Mobilités scheme (white, gray skirt, sky-blue roofline and trim).
// Colors are estimates from photos. Métro lines 1, 4, 6, 11 and 14 run on rubber tyres, as do T5 and T6.

const WHITE = '#F1F2F0';
const OFF_WHITE = '#E6E8E6';
const SILVER = '#B3B8BD';
const GRAY = '#8C939A';
const ANTHRACITE = '#3A3F45';
const SLATE = '#56616B';
const JADE = '#21B39D';
const TURQUOISE = '#2CC1B0';
const SKY = '#3D9BDD';
const CARMILLON = '#C8246E';
const FACE = '#1B1E23';
const GLASS = '#1E252C';
const ROOF = '#A2A7AC';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

type Livery = Pick<StockSpec, 'body' | 'finish' | 'roof' | 'front' | 'doorColor' | 'windowColor' | 'skirt' | 'stripes' | 'frontStripes'>;

/** Île-de-France Mobilités: white, gray skirt, sky-blue roofline, black face outlined in blue. */
const idfm: Livery = {
  body: WHITE,
  finish: 'paint',
  roof: ROOF,
  front: FACE,
  doorColor: '#D9DEE2',
  windowColor: GLASS,
  skirt: GRAY,
  stripes: [band(SILVER, 0.1, 0.2), band(SKY, 0.93, 0.98)],
  frontStripes: [band(SKY, 0.9, 0.97)],
};

/** RATP 1990s: white, jade-green window band. */
const jade: Livery = {
  body: WHITE,
  finish: 'paint',
  roof: ROOF,
  front: JADE,
  doorColor: OFF_WHITE,
  windowColor: GLASS,
  stripes: [band(JADE, 0.46, 0.92)],
  frontStripes: [band(WHITE, 0.12, 0.3)],
};

/** RATP 1990s rubber-tyred stock: anthracite window band edged in jade. */
const anthracite: Livery = {
  body: '#DADDDF',
  finish: 'paint',
  roof: ROOF,
  front: ANTHRACITE,
  doorColor: '#DADDDF',
  windowColor: GLASS,
  stripes: [band(JADE, 0.4, 0.44), band(ANTHRACITE, 0.44, 0.88), band(JADE, 0.9, 0.93)],
  frontStripes: [band(JADE, 0.3, 0.36)],
};

/** Île-de-France Mobilités on double-deckers: pale gray, dark lower deck, blue doors and face outline. */
const idfmDouble: Livery = {
  body: '#E4E7E9',
  finish: 'paint',
  roof: ROOF,
  front: FACE,
  doorColor: SKY,
  windowColor: GLASS,
  skirt: ANTHRACITE,
  stripes: [band(ANTHRACITE, 0.08, 0.38), band(SKY, 0.38, 0.41)],
  frontStripes: [band(SKY, 0.88, 0.97)],
};

/** Transilien 'Carmillon' (2009): pale gray, dark window band, carmillon-red doors and face trim. */
const carmillon: Livery = {
  body: '#E4E6E6',
  finish: 'paint',
  roof: ROOF,
  front: FACE,
  doorColor: CARMILLON,
  windowColor: GLASS,
  skirt: ANTHRACITE,
  stripes: [band(CARMILLON, 0.4, 0.42), band(ANTHRACITE, 0.5, 0.82)],
  frontStripes: [band(CARMILLON, 0.88, 0.97)],
};

/** RATP trams: white, jade band below the dark window line. */
const ratpTram: Livery = {
  body: WHITE,
  finish: 'paint',
  roof: '#DADDDF',
  front: WHITE,
  doorColor: WHITE,
  windowColor: GLASS,
  skirt: SILVER,
  stripes: [band(JADE, 0.18, 0.3), band(ANTHRACITE, 0.38, 0.88)],
  frontStripes: [band(JADE, 0.18, 0.3)],
};

const idfmTram: Livery = {
  body: WHITE,
  finish: 'paint',
  roof: '#DADDDF',
  front: FACE,
  doorColor: WHITE,
  windowColor: GLASS,
  skirt: SILVER,
  stripes: [band(ANTHRACITE, 0.38, 0.88), band(SKY, 0.9, 0.97)],
  frontStripes: [band(SKY, 0.9, 0.97)],
};

// Métro: 2.4–2.47 m wide cars about 15 m long; rubber-tyred MP stock and steel-wheeled MF stock.
const metro = { width: 2.45, height: 3.47, doors: 3, profile: 'rounded' as const, pantograph: false };

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------ Métro
  {
    id: 'paris-mp05', name: 'MP 05', maker: 'Alstom', introduced: 2011,
    blurb: 'Rubber-tyred and driverless: line 1 was automated around these trains in 2011–12 without ever closing.',
    ...metro, length: 15.05, width: 2.45, height: 3.47, nose: 'rounded', ...idfm,
  },
  {
    id: 'paris-mp89ca', name: 'MP 89 CA', maker: 'GEC Alsthom', introduced: 1998,
    blurb: "Opened driverless line 14 in 1998. With no cab, riders at the front get the driver's view; they now run on line 4.",
    ...metro, length: 15.05, nose: 'rounded', ...anthracite,
  },
  {
    id: 'paris-mp89cc', name: 'MP 89 CC', maker: 'GEC Alsthom', introduced: 1997,
    blurb: "Line 1's trains from 1997, then line 4's; cut from six cars to five to fit line 6, whose last MP 73 retired in July 2026.",
    ...metro, length: 15.05, nose: 'slant',
    ...anthracite,
  },
  {
    id: 'paris-mp14', name: 'MP 14', maker: 'Alstom', introduced: 2020,
    blurb: "Line 14's eight-car MP 14s, 120 m long, are the Métro's longest trains, running driverless on rubber tyres to Orly.",
    ...metro, length: 15.0, width: 2.45, height: 3.47, nose: 'flat', ...idfm,
  },
  {
    id: 'paris-mf01', name: 'MF 01', maker: 'Alstom / Bombardier', introduced: 2008,
    blurb: 'Seat widths were set with 1.80 m mannequins, allowing for riders expected to grow bigger over the trains’ long life.',
    ...metro, length: 15.1, width: 2.4, height: 3.44, nose: 'slant',
    body: '#DCE0E2', finish: 'paint', roof: SILVER, front: ANTHRACITE, doorColor: '#DCE0E2', windowColor: GLASS,
    stripes: [band(JADE, 0.42, 0.95)], frontStripes: [band(WHITE, 0.12, 0.28), band(JADE, 0.28, 0.34)],
  },
  {
    id: 'paris-mf01-stif', name: 'MF 01 (vif-argent)', maker: 'Alstom / Bombardier', introduced: 2008,
    blurb: "Line 9's MF 01s wear the RATP–STIF 'vif-argent' quicksilver livery, with jade green marking every door.",
    ...metro, length: 15.1, width: 2.4, height: 3.44, nose: 'slant',
    body: WHITE, finish: 'paint', roof: SILVER, front: ANTHRACITE, doorColor: JADE, windowColor: GLASS,
    stripes: [band(SILVER, 0.44, 0.88)], frontStripes: [band(SILVER, 0.12, 0.3)],
  },
  {
    id: 'paris-mf67', name: 'MF 67', maker: 'Brissonneau et Lotz / CIMT', introduced: 1968,
    blurb: "The Métro's oldest trains, in service since 1968. Riders still open the doors themselves by lifting a latch.",
    ...metro, length: 15.08, width: 2.4, height: 3.46, doors: 4, nose: 'flat', ...jade,
  },
  {
    id: 'paris-mf77', name: 'MF 77', maker: 'Alsthom / Franco-Belge / ANF', introduced: 1978,
    blurb: "First ran on line 13 in 1978 and was nicknamed the 'white metro' for its cream-and-royal-blue paint.",
    ...metro, length: 15.49, width: 2.47, height: 3.46, nose: 'slant',
    ...idfm, front: WHITE, frontStripes: [band(SKY, 0.42, 0.92)],
  },
  {
    id: 'paris-mf77-jade', name: 'MF 77 (jade)', maker: 'Alsthom / Franco-Belge / ANF', introduced: 1978,
    blurb: "Line 13's MF 77s keep RATP's 1990s jade-and-white wrap; new MF 19s are due to replace them from summer 2027.",
    ...metro, length: 15.49, width: 2.47, height: 3.46, nose: 'slant', ...jade,
  },
  {
    id: 'paris-mf88', name: 'MF 88', maker: 'GEC Alsthom / ANF', introduced: 1993,
    blurb: 'Only nine were built: steerable axles meant to hush squealing curves proved too fragile. The last are due to retire in December 2026.',
    ...metro, length: 15.5, width: 2.44, height: 3.46, nose: 'slant',
    ...jade, front: FACE, frontStripes: [band(JADE, 0.3, 0.36), band(WHITE, 0.12, 0.3)],
  },
  {
    id: 'paris-mf19', name: 'MF 19', maker: 'Alstom', introduced: 2025,
    blurb: 'The newest Métro train, on line 10 since October 2025: open gangways let you walk from one end to the other.',
    ...metro, length: 15.2, nose: 'rounded', ...idfm,
  },

  // ------------------------------------------------------------------ RER
  {
    id: 'paris-mi09', name: 'MI 09', maker: 'Alstom / Bombardier', introduced: 2011,
    blurb: "Looks like a cousin of the MI 2N, but the two can't run coupled in service: they accelerate too differently.",
    length: 22.4, width: 2.9, height: 4.32, doors: 3, profile: 'bilevel', nose: 'slant', pantograph: true,
    body: WHITE, finish: 'paint', roof: ROOF, front: FACE, doorColor: TURQUOISE, windowColor: GLASS,
    stripes: [band(SILVER, 0.08, 0.46)], frontStripes: [band(SILVER, 0.12, 0.3)],
  },
  {
    id: 'paris-mi2n', name: 'MI 2N', maker: 'GEC Alsthom / Bombardier', introduced: 1997,
    blurb: 'The first double-deckers on RER A (Altéo), from 1997; a sister series opened RER E, then called Éole, in 1999.',
    length: 22.4, width: 2.9, height: 4.32, doors: 3, profile: 'bilevel', nose: 'slant', pantograph: true, ...idfmDouble,
  },
  {
    id: 'paris-mi79', name: 'MI 79', maker: 'ANF / Franco-Belge', introduced: 1980,
    blurb: 'Built for RER B to run straight through from RATP to SNCF tracks, switching from 1.5 kV DC to 25 kV AC north of Gare du Nord.',
    length: 26.26, width: 2.8, height: 4.18, doors: 4, profile: 'box', nose: 'flat', pantograph: true,
    body: '#E7EAEB', finish: 'paint', roof: ROOF, front: '#E7EAEB', doorColor: SLATE, windowColor: GLASS,
    stripes: [band(SLATE, 0, 0.56), band('#C8307F', 0.56, 0.58)], frontStripes: [band(SLATE, 0.12, 0.44)],
  },
  {
    id: 'paris-mi84', name: 'MI 84', maker: 'ANF / Franco-Belge', introduced: 1985,
    blurb: 'A simplified RER A cousin of the MI 79, with a 120 km/h top speed instead of 140; it now works RER B.',
    length: 26.26, width: 2.8, height: 4.18, doors: 4, profile: 'box', nose: 'flat', pantograph: true,
    body: '#E7EAEB', finish: 'paint', roof: ROOF, front: '#E7EAEB', doorColor: SLATE, windowColor: GLASS,
    stripes: [band(SLATE, 0, 0.56), band('#C8307F', 0.56, 0.58)], frontStripes: [band(SLATE, 0.12, 0.44)],
  },
  {
    id: 'paris-z5600', name: 'Z 5600', maker: 'ANF / CIMT', introduced: 1983,
    blurb: "The 1983 original of SNCF's Z 2N double-deck family, still working RER C alongside its younger siblings.",
    length: 24.3, width: 2.82, height: 4.32, doors: 2, profile: 'bilevel', nose: 'flat', pantograph: true, ...carmillon,
  },
  {
    id: 'paris-z8800', name: 'Z 8800', maker: 'ANF / CIMT', introduced: 1985,
    blurb: 'The dual-voltage member of the Z 2N double-deck family, at home under both 1.5 kV DC and 25 kV AC wires.',
    length: 24.3, width: 2.82, height: 4.32, doors: 2, profile: 'bilevel', nose: 'flat', pantograph: true, ...carmillon,
  },
  {
    id: 'paris-z20500', name: 'Z 20500', maker: 'ANF / Alsthom', introduced: 1988,
    blurb: "In 1989 SNCF lent two of these double-deckers to Denmark's DSB for three weeks of trials between Helsingør and Roskilde.",
    length: 25.4, width: 2.82, height: 4.32, doors: 2, profile: 'bilevel', nose: 'flat', pantograph: true, ...idfmDouble,
  },
  {
    id: 'paris-z20900', name: 'Z 20900', maker: 'Alstom / ANF', introduced: 2001,
    blurb: "The last and newest of the Z 2N double-deck family, delivered from 2001 for RER C.",
    length: 25.4, width: 2.82, height: 4.32, doors: 2, profile: 'bilevel', nose: 'flat', pantograph: true, ...idfmDouble,
  },
  {
    id: 'paris-rerng', name: 'RER NG (Z 58000)', maker: 'Alstom', introduced: 2023,
    blurb: "A walk-through 'boa' double-decker: 112 m and six cars on RER E, 130 m and seven cars on RER D.",
    length: 18.7, width: 3.0, height: 4.32, doors: 2, profile: 'bilevel', nose: 'rounded', pantograph: true, ...idfmDouble,
  },
  {
    id: 'paris-nat', name: 'Z 50000 Francilien', maker: 'Bombardier', introduced: 2009,
    blurb: "At 3.06 m, the widest train in SNCF's fleet: an articulated walk-through whose short cars share their bogies.",
    length: 14.06, width: 3.06, height: 4.28, doors: 1, profile: 'box', nose: 'rounded', pantograph: true,
    ...idfmDouble, stripes: [band(SKY, 0.36, 0.39), band(ANTHRACITE, 0.46, 0.86)],
  },

  // ------------------------------------------------------------------ Tramway
  {
    id: 'paris-citadis305', name: 'Citadis 305', maker: 'Alstom', introduced: 2024,
    blurb: 'Took over the T1 from its 1992 TFS trams, the last of which carried passengers on 6 March 2026.',
    length: 33, width: 2.65, height: 3.4, doors: 5, profile: 'tram', nose: 'rounded', pantograph: true, sections: 5, ...idfmTram,
  },
  {
    id: 'paris-citadis302', name: 'Citadis 302', maker: 'Alstom', introduced: 2002,
    blurb: 'Took over the T2 in 2002 and from 2005 ran coupled into 65 m pairs at rush hour; the T7 and T8 use them singly.',
    length: 32.2, width: 2.4, height: 3.3, doors: 4, profile: 'tram', nose: 'rounded', pantograph: true, sections: 5, ...ratpTram,
  },
  {
    id: 'paris-citadis402', name: 'Citadis 402', maker: 'Alstom', introduced: 2006,
    blurb: 'Circles Paris on the Boulevards des Maréchaux, the ring of avenues that runs just inside the old city walls.',
    length: 43.7, width: 2.65, height: 3.3, doors: 6, profile: 'tram', nose: 'rounded', pantograph: true, sections: 7, ...ratpTram,
  },
  {
    id: 'paris-dualis', name: 'Citadis Dualis', maker: 'Alstom', introduced: 2017,
    blurb: 'A tram-train: street tram in town, then up to 100 km/h on main-line tracks. It runs T4, T11, T12 and T13.',
    length: 42, width: 2.65, height: 3.6, doors: 4, profile: 'tram', nose: 'rounded', pantograph: true, sections: 4, ...idfmTram,
  },
  {
    id: 'paris-translohr-ste3', name: 'Translohr STE3', maker: 'Alstom NTL', introduced: 2013,
    blurb: 'A tram on rubber tyres, steered by guide rollers that grip a single rail in the middle of the road.',
    length: 25, width: 2.2, height: 2.89, doors: 2, profile: 'tram', nose: 'rounded', pantograph: true, sections: 3,
    ...ratpTram, body: '#E3E6E8', front: '#E3E6E8', stripes: [band(TURQUOISE, 0.3, 0.35), band(ANTHRACITE, 0.38, 0.9)],
  },
  {
    id: 'paris-translohr-ste6', name: 'Translohr STE6', maker: 'Alstom NTL', introduced: 2014,
    blurb: "Rubber-tyred like the T5's, but six modules long; the T6 dives through a tunnel under Viroflay to reach its terminus.",
    length: 46, width: 2.2, height: 2.89, doors: 4, profile: 'tram', nose: 'rounded', pantograph: true, sections: 6,
    ...ratpTram, body: '#E3E6E8', front: '#E3E6E8', stripes: [band(TURQUOISE, 0.3, 0.35), band(ANTHRACITE, 0.38, 0.9)],
  },
  {
    id: 'paris-citadis405', name: 'Citadis 405', maker: 'Alstom', introduced: 2021,
    blurb: 'Runs the T9 from Porte de Choisy to Orly, opened in 2021, and the T10 through Clamart, opened in 2023.',
    length: 45, width: 2.65, height: 3.3, doors: 6, profile: 'tram', nose: 'rounded', pantograph: true, sections: 7, ...idfmTram,
  },
];
