import type { StockSpec, StockStripe } from '../types.ts';

// Milan, fall 2026. M1–M3 run six-car trains: revamped 1970s–80s cars (M1), the 1990 M3 originals, and
// AnsaldoBreda's Meneghino (2009) and Leonardo (2014). M4 and M5 run four-car driverless Hitachi (ex-AnsaldoBreda)
// trains. M1 takes power from a side third rail, M2 and M3 from overhead wires. Trams: the 1928 Peter Witt
// "Ventotto", orange Jumbotrams, Eurotrams, AnsaldoBreda Sirio and the new Stadler Tramlink. Trenord runs TSR
// double-deckers, Hitachi Caravaggio double-deckers, Alstom Donizetti and CSA sets and Stadler GTW diesels on S7.
// Colors estimated from photos.

const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });
const GLASS = '#1C2126';
const SILVER = '#BFC3C6';
const ROOF = '#9A9EA2';
const WHITE = '#F1F1ED';
const BLACK = '#1A1B1D';
const GIALLO = '#F2B01E'; // ATM's "Giallo Milano"
const CREAM = '#F7EED6';
const ORANGE = '#EE8A1D'; // the 1970s "arancio ministeriale"
const RL_GREEN = '#8DC63F'; // Regione Lombardia regional livery
const RL_BLUE = '#1D4F9C';

const metro = { width: 2.85, height: 3.5, profile: 'box' as const, finish: 'paint' as const, roof: ROOF, windowColor: GLASS, skirt: '#3A3D40' };

// Meneghino: silver sides, doors and cab frame in the line color.
const meneghino = (line: string, color: string, pantograph: boolean): StockSpec => ({
  id: `milan-meneghino-${line}`, name: 'Meneghino', maker: 'AnsaldoBreda / Firema', introduced: 2009,
  blurb: 'Named after the Milanese dialect mask: the first Milan trains with one open walk-through from end to end, built for all three old lines.',
  length: 17.6, doors: 4, nose: 'slant', ...metro,
  body: SILVER, front: '#2A2C2F', doorColor: SILVER, stripes: [band(color, 0.08, 0.14)], frontStripes: [band(color, 0.55, 0.62)],
  endBand: { color, width: 0.5 }, pantograph,
});

export const stock: StockSpec[] = [
  // ------------------------------------------------------------------ Metro
  {
    id: 'milan-m1-classic', name: 'Revamped 1970s–80s cars', maker: 'Breda, Fiat and others', introduced: 1973,
    blurb: 'The 1964 red line design, rebuilt from 2005 with air conditioning, gangways and LED lights; the oldest trains on the Milan Metro.',
    length: 17.54, doors: 4, nose: 'flat', ...metro, height: 3.51,
    body: '#D6D8D9', front: '#D6D8D9', doorColor: '#B8BBBE', stripes: [band('#D2232A', 0.4, 0.58)], frontStripes: [band('#D2232A', 0.3, 0.46)], pantograph: false,
  },
  {
    id: 'milan-leonardo-m1', name: 'Leonardo', maker: 'AnsaldoBreda / Hitachi Rail', introduced: 2014,
    blurb: 'Six walk-through cars that can run on both 750 V third rail and 1500 V wires, so the same design serves M1 and M2.',
    length: 17.8, doors: 4, nose: 'slant', ...metro,
    body: SILVER, front: BLACK, doorColor: '#D2232A', stripes: [band('#D2232A', 0.06, 0.12)], frontStripes: [band('#D2232A', 0.2, 0.26), band('#D2232A', 0.9, 0.96)], pantograph: false,
  },
  meneghino('m1', '#D2232A', false),
  {
    id: 'milan-leonardo-m2', name: 'Leonardo', maker: 'AnsaldoBreda / Hitachi Rail', introduced: 2014,
    blurb: "M2's Leonardos are painted green all over. Out past Cascina Gobba they run in the open, under wires, beside the Martesana canal.",
    length: 17.8, doors: 4, nose: 'slant', ...metro,
    body: '#3F8A3A', front: BLACK, doorColor: '#2F6E2C', stripes: [band('#8FC45A', 0.06, 0.1)], frontStripes: [band('#6FB33F', 0.2, 0.26), band('#6FB33F', 0.9, 0.96)], pantograph: true,
  },
  meneghino('m2', '#5E9632', true),
  {
    id: 'milan-m3-classic', name: 'M3 original trains', maker: 'Fiat / Stanga / Breda / Socimi', introduced: 1990,
    blurb: 'Opened with the yellow line for the 1990 World Cup. The trains drive themselves between stations; the driver just works the doors.',
    length: 17.5, doors: 4, nose: 'flat', ...metro,
    body: WHITE, front: WHITE, doorColor: WHITE, stripes: [band('#F39200', 0.38, 0.44), band(BLACK, 0.48, 0.84)], frontStripes: [band(BLACK, 0.48, 0.84)], pantograph: true,
  },
  meneghino('m3', '#F2B01E', true),
  {
    id: 'milan-m4', name: 'Hitachi driverless (Series 4400)', maker: 'Hitachi Rail', introduced: 2022,
    blurb: 'A cousin of the Copenhagen Metro train, styled by Giugiaro. No driver: platform screen doors open only when the train is exactly aligned.',
    length: 12.7, width: 2.65, height: 3.5, doors: 2, profile: 'rounded', nose: 'rounded', finish: 'paint',
    body: WHITE, roof: '#C9CCCE', front: '#1E2B55', doorColor: WHITE, windowColor: GLASS, skirt: '#1E2B55',
    stripes: [band('#1E2B55', 0, 0.16), band('#1E2B55', 0.45, 0.8)], frontStripes: [band('#2A4DB0', 0.12, 0.2)], pantograph: false,
  },
  {
    id: 'milan-m5', name: 'Driverless metro (Series 5500)', maker: 'AnsaldoBreda', introduced: 2013,
    blurb: "Italy's first driverless metro line. Platforms are only 50 m long, half the old lines', so short trains simply come more often.",
    length: 12.6, width: 2.65, height: 3.5, doors: 2, profile: 'rounded', nose: 'rounded', finish: 'paint',
    body: '#D8DADC', roof: '#B4B7BA', front: '#D8DADC', doorColor: '#D8DADC', windowColor: GLASS, skirt: '#5A5E63',
    stripes: [band('#9A6FB0', 0.1, 0.18), band(GLASS, 0.46, 0.82)], frontStripes: [band('#9A6FB0', 0.12, 0.2)], pantograph: false,
  },

  // ------------------------------------------------------------------ Trams
  {
    id: 'milan-ventotto', name: 'Series 1500 "Ventotto"', maker: 'Carminati & Toselli, Breda and others', introduced: 1928,
    blurb: 'An American Peter Witt design of 1928. About 150 of the 502 built still work lines 1, 5, 10, 19 and 33, the oldest trams in city service.',
    length: 13.89, width: 2.35, height: 3.23, doors: 3, profile: 'streetcar', nose: 'rounded', finish: 'paint',
    body: GIALLO, roof: '#8E8B84', front: GIALLO, doorColor: '#6E4524', windowColor: '#2A2622', skirt: '#5B3A20',
    stripes: [band(CREAM, 0.5, 1)], frontStripes: [band(CREAM, 0.5, 1)], pantograph: true,
  },
  {
    id: 'milan-jumbotram', name: 'Series 4900 "Jumbotram"', maker: 'Fiat Ferroviaria / Stanga', introduced: 1976,
    blurb: "A hundred three-section 'Jumbos' from 1976, still in the 1970s ministerial orange that once covered every Italian city bus and tram.",
    length: 29.21, width: 2.38, height: 3.4, doors: 4, profile: 'tram', nose: 'flat', sections: 3, finish: 'paint',
    body: ORANGE, roof: '#A6A29A', front: ORANGE, doorColor: '#D8761A', windowColor: GLASS, skirt: '#3B3A38',
    stripes: [band('#F6E7C8', 0.9, 0.96)], pantograph: true,
  },
  {
    id: 'milan-eurotram', name: 'Series 7000 "Eurotram"', maker: 'Adtranz / Bombardier', introduced: 1999,
    blurb: 'The same design as Strasbourg\'s famous glassy trams: 26 long, low-floor cars, all kept together on line 15 to Rozzano.',
    length: 34.1, width: 2.47, height: 3.19, doors: 6, profile: 'tram', nose: 'slant', sections: 7, finish: 'paint',
    body: SILVER, roof: '#8F9498', front: '#2B2E31', doorColor: SILVER, windowColor: GLASS, skirt: '#3E6F3A',
    stripes: [band('#5E9632', 0.12, 0.2), band(GLASS, 0.4, 0.86)], frontStripes: [band('#5E9632', 0.14, 0.22)], pantograph: true,
  },
  {
    id: 'milan-sirio-long', name: 'Series 7100 Sirio', maker: 'AnsaldoBreda', introduced: 2002,
    blurb: 'Seven sections and 35 m long, with every other section riding on a bogie; the long Sirio runs out to Cinisello Balsamo on line 31.',
    length: 35.35, width: 2.4, height: 3.41, doors: 6, profile: 'tram', nose: 'rounded', sections: 7, finish: 'paint',
    body: SILVER, roof: '#8F9498', front: '#3C8B3A', doorColor: '#3C8B3A', windowColor: GLASS, skirt: '#3C8B3A',
    stripes: [band('#3C8B3A', 0, 0.18)], frontStripes: [band(SILVER, 0.3, 0.4)], pantograph: true,
  },
  {
    id: 'milan-sirio-short', name: 'Series 7500/7600 Sirio', maker: 'AnsaldoBreda', introduced: 2003,
    blurb: 'The short Sirio wears the yellow and white of the modern "Giallo Milano" look, a nod to the Ventotto it works beside.',
    length: 26.45, width: 2.4, height: 3.41, doors: 4, profile: 'tram', nose: 'rounded', sections: 5, finish: 'paint',
    body: WHITE, roof: '#C9CBCC', front: WHITE, doorColor: '#6E7275', windowColor: GLASS, skirt: '#4A4D50',
    stripes: [band(GIALLO, 0, 0.36), band('#6E7275', 0.42, 0.84)], frontStripes: [band(GIALLO, 0, 0.36)], pantograph: true,
  },
  {
    id: 'milan-tramlink', name: 'Series 7700 Tramlink', maker: 'Stadler', introduced: 2025,
    blurb: "Milan's first two-way tram since the 1960s: cabs at both ends and doors on both sides, built by Stadler in Valencia.",
    length: 25.4, width: 2.4, height: 3.69, doors: 3, profile: 'tram', nose: 'slant', sections: 3, finish: 'paint',
    body: WHITE, roof: '#C9CBCC', front: BLACK, doorColor: GIALLO, windowColor: GLASS, skirt: '#3A3B3D',
    stripes: [band(GIALLO, 0, 0.38)], frontStripes: [band(GIALLO, 0, 0.3)], pantograph: true,
  },

  // ------------------------------------------------------------------ Trenord
  {
    id: 'milan-tsr', name: 'TSR (Treno Servizio Regionale)', maker: 'AnsaldoBreda / Firema', introduced: 2006,
    blurb: 'The workhorse of the Passante: double-deck cars on three levels, 104 of them built for Lombardy from 2006.',
    length: 26.4, width: 2.82, height: 4.3, doors: 2, profile: 'bilevel', nose: 'slant', finish: 'paint',
    body: WHITE, roof: '#A7ABAE', front: RL_GREEN, doorColor: RL_GREEN, windowColor: GLASS, skirt: RL_BLUE,
    stripes: [band(RL_BLUE, 0, 0.14), band(RL_GREEN, 0.14, 0.3)], frontStripes: [band(RL_BLUE, 0, 0.22), band('#F0F0F0', 0.24, 0.3)], pantograph: true,
  },
  {
    id: 'milan-caravaggio', name: 'Caravaggio (ETR 421/521)', maker: 'Hitachi Rail', introduced: 2020,
    blurb: "Hitachi's double-deck Rock, named after the Lombard painter. Trenord's 105 sets have run since 2020, with all doors level with the platform.",
    length: 27.4, width: 2.8, height: 4.3, doors: 2, profile: 'bilevel', nose: 'bullet', finish: 'paint',
    body: WHITE, roof: '#BFC2C4', front: RL_GREEN, doorColor: RL_GREEN, windowColor: GLASS, skirt: RL_BLUE,
    stripes: [band(RL_BLUE, 0, 0.12), band(RL_GREEN, 0.12, 0.18)], frontStripes: [band(RL_BLUE, 0, 0.16)], pantograph: true,
  },
  {
    id: 'milan-caravaggio-mxp', name: 'Caravaggio Malpensa Express', maker: 'Hitachi Rail', introduced: 2025,
    blurb: 'Airport-fitted Caravaggio sets with luggage space took over the Malpensa Express in 2025, from Cadorna and Centrale to the terminals.',
    length: 27.4, width: 2.8, height: 4.3, doors: 2, profile: 'bilevel', nose: 'bullet', finish: 'paint',
    body: WHITE, roof: '#BFC2C4', front: '#C8102E', doorColor: '#C8102E', windowColor: GLASS, skirt: '#7A1020',
    stripes: [band('#C8102E', 0, 0.2)], frontStripes: [band('#7A1020', 0, 0.18)], pantograph: true,
  },
  {
    id: 'milan-donizetti', name: 'Donizetti (ETR 104/204)', maker: 'Alstom', introduced: 2020,
    blurb: "Alstom's single-deck Coradia Stream, named after Bergamo's opera composer Gaetano Donizetti, on the lighter-used lines.",
    length: 21, width: 2.8, height: 4.0, doors: 2, profile: 'rounded', nose: 'bullet', finish: 'paint',
    body: WHITE, roof: '#BFC2C4', front: RL_GREEN, doorColor: RL_GREEN, windowColor: GLASS, skirt: RL_BLUE,
    stripes: [band(RL_BLUE, 0, 0.12), band(RL_GREEN, 0.12, 0.2)], frontStripes: [band(RL_BLUE, 0, 0.16)], pantograph: true,
  },
  {
    id: 'milan-csa', name: 'CSA (ETR 245)', maker: 'Alstom', introduced: 2010,
    blurb: 'Built as the Malpensa Express airport train; since 2025 the fourteen sets run suburban S3, S4, S12 and S19 trips instead.',
    length: 17.5, width: 2.95, height: 4.0, doors: 1, profile: 'rounded', nose: 'slant', finish: 'paint',
    body: WHITE, roof: '#BFC2C4', front: '#C8102E', doorColor: '#9E1B32', windowColor: GLASS, skirt: '#7C8084',
    stripes: [band('#7C8084', 0, 0.16), band('#C8102E', 0.16, 0.22)], frontStripes: [band('#7A1020', 0, 0.2)], pantograph: true,
  },
  {
    id: 'milan-atr115', name: 'ATR 115 (Stadler GTW)', maker: 'Stadler', introduced: 2006,
    blurb: 'S7 leaves the wires in Brianza, so it runs diesel Stadler GTW railcars, with a little engine module riding between the two halves.',
    length: 19.3, width: 2.82, height: 3.9, doors: 1, profile: 'rounded', nose: 'slant', finish: 'paint',
    body: WHITE, roof: '#BFC2C4', front: RL_GREEN, doorColor: RL_GREEN, windowColor: GLASS, skirt: RL_BLUE,
    stripes: [band(RL_BLUE, 0, 0.12), band(RL_GREEN, 0.12, 0.2)], frontStripes: [band(RL_BLUE, 0, 0.16)], pantograph: false,
  },
];
