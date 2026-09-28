import type { StockSpec, StockStripe } from '../types.ts';

// Moscow rolling stock. The metro's current trains wear the Moscow Transport brand: white sides, blue doors,
// a red roof and red front corners around a black face.
const WHITE = '#EEF1F4';
const MOSCOW_BLUE = '#1C4A9A';
const MOSCOW_RED = '#D52B1E';
const FACE = '#141618';
const GLASS = '#1A1F26';
const ROOF = '#8C9399';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// Moscow metro cars: about 19.4 m long and 2.69 m wide, four doors a side, third-rail power (no pantograph).
const metroCar = { length: 19.4, width: 2.69, height: 3.68, doors: 4, profile: 'box' as const, pantograph: false };
const brand = {
  finish: 'paint' as const, body: WHITE, roof: MOSCOW_RED, doorColor: MOSCOW_BLUE, windowColor: GLASS, front: FACE,
  stripes: [band(MOSCOW_BLUE, 0.04, 0.07), band(MOSCOW_BLUE, 0.93, 0.96)],
  frontStripes: [band(MOSCOW_RED, 0, 0.18)],
};

export const stock: StockSpec[] = [
  {
    id: 'moscow-81-765', name: '81-765 Moskva', maker: 'Metrowagonmash (Transmashholding)', introduced: 2017,
    blurb: 'Dressed in the Moscow Transport brand: white sides with blue circle patterns, blue doors, a red roof and a black face.',
    ...metroCar, nose: 'slant', ...brand,
  },
  {
    id: 'moscow-81-775', name: '81-775 Moskva-2020', maker: 'Metrowagonmash (Transmashholding)', introduced: 2020,
    blurb: "A walk-through train; the ones on the Big Circle line carry giant 'БКЛ' letters the full height of their sides.",
    ...metroCar, nose: 'rounded', ...brand, doorColor: '#15306B',
  },
  {
    id: 'moscow-81-760', name: '81-760 Oka', maker: 'Metrowagonmash / Alstom', introduced: 2012,
    blurb: "Its white-and-violet paint earned one of its versions the nickname 'Baklazhan', the eggplant.",
    ...metroCar, length: 19.6, nose: 'slant', finish: 'paint', body: '#D9DBDE', roof: '#6A3E8C', doorColor: '#D9DBDE', windowColor: GLASS,
    front: FACE,
    stripes: [band('#6A3E8C', 0, 0.3), band('#B8BBC0', 0.45, 0.5)],
    frontStripes: [band('#6A3E8C', 0, 0.2)],
  },
  {
    id: 'moscow-81-740', name: '81-740 Rusich', maker: 'Metrowagonmash', introduced: 2003,
    blurb: 'Articulated: each car is two bodies on a shared bogie, half again as long as an ordinary Moscow metro car.',
    length: 28.15, width: 2.7, height: 3.57, doors: 6, profile: 'box', nose: 'slant', finish: 'paint', body: '#DCD4C0', roof: ROOF,
    doorColor: '#DCD4C0', windowColor: GLASS, front: '#2E4A86',
    stripes: [band('#2E4A86', 0, 0.3)],
    frontStripes: [band(FACE, 0.45, 0.9)],
    pantograph: false, sections: 2,
  },
  {
    id: 'moscow-es2g', name: 'ES2G Lastochka', maker: 'Ural Locomotives (Siemens Desiro RUS)', introduced: 2016,
    blurb: 'Siemens Desiro trains built in the Urals; on the MCC they circle the 54 km ring every 4 minutes at peak.',
    length: 26, width: 3.48, height: 4.3, doors: 2, profile: 'box', nose: 'rounded', finish: 'paint', body: '#E4E6E8', roof: ROOF,
    doorColor: '#B8BCC0', windowColor: GLASS, front: '#E42313',
    stripes: [band('#E42313', 0, 0.28)],
    frontStripes: [band(FACE, 0.5, 0.88)],
    pantograph: true,
  },
  {
    id: 'moscow-eg2tv', name: 'EG2Tv Ivolga', maker: 'Tver Carriage Works (Transmashholding)', introduced: 2017,
    blurb: "Ivolga means 'oriole': Tver-built trains that run the diameters straight through central Moscow.",
    length: 23.7, width: 3.48, height: 4.3, doors: 2, profile: 'box', nose: 'slant', finish: 'paint', body: '#E8EAEC', roof: ROOF,
    doorColor: '#C9CDD1', windowColor: GLASS, front: MOSCOW_RED,
    stripes: [band(MOSCOW_RED, 0, 0.12), band('line', 0.12, 0.2)],
    frontStripes: [band(FACE, 0.5, 0.88)],
    pantograph: true,
  },
];
