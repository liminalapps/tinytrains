import type { StockSpec, StockStripe } from '../types.ts';

// Dubai Metro, Dubai Tram and the Palm Monorail. The metro is driverless and takes 750 V from a third rail; the tram
// draws power from a ground-level rail (Alstom APS), so neither has a pantograph in service. Colors from photos.
const SILVER = '#C9CED3';
const SKY = '#4FA8DC';
const GLASS = '#1A2129';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

export const stock: StockSpec[] = [
  {
    id: 'dubai-kinki', name: 'Kinki Sharyo five-car train', maker: 'Kinki Sharyo / Mitsubishi', introduced: 2009,
    blurb: 'Opened the Gulf’s first metro in 2009. Each train keeps a Gold Class car up front and a section for women and children.',
    length: 18, width: 2.9, height: 3.7, doors: 3, profile: 'rounded', nose: 'bullet',
    finish: 'paint', body: SKY, roof: '#A9B0B6', front: SKY, doorColor: SKY, windowColor: GLASS,
    stripes: [band(SILVER, 0, 0.4)],
    frontStripes: [band(SILVER, 0, 0.3), band(GLASS, 0.45, 0.9)],
    pantograph: false,
  },
  {
    id: 'dubai-metropolis', name: 'Alstom Metropolis', maker: 'Alstom', introduced: 2021,
    blurb: 'Fifty trains bought for Route 2020, the Red Line branch built to carry visitors to the Expo 2020 world fair.',
    length: 18, width: 2.9, height: 3.7, doors: 3, profile: 'rounded', nose: 'rounded',
    finish: 'paint', body: '#3C8FD0', roof: '#A9B0B6', front: '#3C8FD0', doorColor: '#3C8FD0', windowColor: GLASS,
    stripes: [band('#D2D6DA', 0, 0.36), band('#1D5FA6', 0.36, 0.41)],
    frontStripes: [band('#D2D6DA', 0, 0.28), band(GLASS, 0.45, 0.9)],
    pantograph: false,
  },
  {
    id: 'dubai-citadis', name: 'Alstom Citadis 402', maker: 'Alstom', introduced: 2014,
    blurb: 'No overhead wires: these 44 m trams pick up power from a rail between the tracks that is live only under the tram.',
    length: 44, width: 2.65, height: 3.4, doors: 6, profile: 'tram', nose: 'slant',
    finish: 'paint', body: '#D9DCDF', roof: '#EDEFF1', front: '#23272C', doorColor: '#B9BEC3', windowColor: GLASS,
    skirt: '#6B7178', stripes: [band('#8E959C', 0.12, 0.2)],
    frontStripes: [band(GLASS, 0.4, 0.95)],
    pantograph: false, sections: 7,
  },
  {
    id: 'dubai-palm-monorail', name: 'Hitachi monorail', maker: 'Hitachi', introduced: 2009,
    blurb: 'The Middle East’s first monorail: driverless three-car trains ride a concrete beam down the trunk of the Palm to Atlantis.',
    length: 15, width: 2.9, height: 3.8, doors: 2, profile: 'monorail', nose: 'rounded',
    finish: 'paint', body: '#EEF0F2', roof: '#C9CDD1', front: '#EEF0F2', doorColor: '#EEF0F2', windowColor: GLASS,
    stripes: [band('#1D2F6B', 0.14, 0.26), band('#C8A24A', 0.26, 0.3)],
    frontStripes: [band('#1D2F6B', 0.14, 0.26), band(GLASS, 0.45, 0.9)],
    pantograph: false,
  },
];
