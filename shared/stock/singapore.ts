import type { StockSpec, StockStripe } from '../types.ts';

// Singapore rolling stock. Bodies are silver or white with line-colored accents ('line' takes the line color).
const SILVER = '#C9CDD1';
const WHITE = '#EEF0F2';
const ROOF = '#8E959B';
const GLASS = '#1A1F26';
const FACE = '#16191C';
const band = (color: StockStripe['color'], from: number, to: number): StockStripe => ({ color, from, to });

// MRT cars: about 23 m long and 3.2 m wide.
const mrt = { length: 23, width: 3.2, height: 3.7, doors: 5, profile: 'box' as const, pantograph: false };
const steel = { finish: 'stainless' as const, body: SILVER, roof: ROOF, doorColor: SILVER, windowColor: GLASS };
const white = { finish: 'paint' as const, body: WHITE, roof: ROOF, doorColor: WHITE, windowColor: GLASS };

export const stock: StockSpec[] = [
  // ---------------------------------------------------------------- North–South and East–West lines (SMRT)
  {
    id: 'singapore-r151', name: 'R151', maker: 'Bombardier / Alstom (Movia)', introduced: 2023,
    blurb: 'Replacing the lines\' oldest trains; the first R151 entered service on the East–West Line on 4 June 2023.',
    ...mrt, nose: 'rounded', ...white, front: FACE,
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band('line', 0.24, 0.32)],
  },
  {
    id: 'singapore-c151a', name: 'C151A', maker: 'Kawasaki / CSR Sifang', introduced: 2011,
    blurb: 'Built by Kawasaki with CSR Sifang in Qingdao to add capacity on Singapore\'s two oldest MRT lines.',
    ...mrt, nose: 'slant', ...steel, front: FACE,
    stripes: [band('#D42E12', 0.36, 0.4), band('#1A1A1A', 0.4, 0.42)],
    frontStripes: [band('#D42E12', 0.26, 0.32)],
  },
  {
    id: 'singapore-c151b', name: 'C151B / C151C', maker: 'Kawasaki / CRRC Sifang', introduced: 2017,
    blurb: 'Later Kawasaki and CRRC Sifang batches for the North–South and East–West lines, delivered from 2017.',
    ...mrt, nose: 'slant', ...steel, front: FACE,
    stripes: [band('line', 0.36, 0.4), band('#1A1A1A', 0.4, 0.42)],
    frontStripes: [band('line', 0.26, 0.32)],
  },
  // ---------------------------------------------------------------- North East Line (SBS Transit), overhead wire
  {
    id: 'singapore-c751a', name: 'C751A', maker: 'Alstom (Metropolis)', introduced: 2003,
    blurb: 'Opened the North East Line in 2003, billed as the world\'s first fully automated underground heavy metro.',
    ...mrt, doors: 4, nose: 'rounded', ...steel, front: '#E6E6E6',
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.86), band('line', 0.24, 0.3)],
    pantograph: true,
  },
  {
    id: 'singapore-c751c', name: 'C751C', maker: 'Alstom (Metropolis)', introduced: 2015,
    blurb: 'A second Metropolis batch for the North East Line, Singapore\'s only MRT line powered from overhead wires.',
    ...mrt, doors: 4, nose: 'rounded', ...white, front: WHITE,
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.86), band('line', 0.24, 0.3)],
    pantograph: true,
  },
  // ---------------------------------------------------------------- Circle, Downtown and Thomson–East Coast lines
  {
    id: 'singapore-c830', name: 'C830 / C830C', maker: 'Alstom (Metropolis)', introduced: 2009,
    blurb: 'Driverless three-car trains; since Stage 6 opened on 12 July 2026 they can run right round the closed Circle Line.',
    ...mrt, doors: 4, nose: 'rounded', ...white, front: WHITE,
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band(FACE, 0.46, 0.86), band('line', 0.24, 0.3)],
  },
  {
    id: 'singapore-c951', name: 'C951', maker: 'Bombardier (Movia)', introduced: 2013,
    blurb: 'Driverless three-car Movia trains that have run the Downtown Line since its first stage opened in 2013.',
    ...mrt, length: 22.8, doors: 4, nose: 'rounded', ...white, front: FACE,
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band('line', 0.24, 0.32)],
  },
  {
    id: 'singapore-t251', name: 'T251', maker: 'Kawasaki / CRRC Sifang', introduced: 2020,
    blurb: 'Four-car driverless trains built by Kawasaki and CRRC Sifang for the Thomson–East Coast Line, opened in 2020.',
    ...mrt, nose: 'rounded', ...white, front: FACE,
    stripes: [band('line', 0.34, 0.42)],
    frontStripes: [band('line', 0.24, 0.32)],
  },
  // ---------------------------------------------------------------- LRT
  {
    id: 'singapore-c801', name: 'C801 / C801B', maker: 'Bombardier (Innovia APM)', introduced: 1999,
    blurb: "Rubber-tired people movers on Singapore's first LRT, which loops through Bukit Panjang from Choa Chu Kang.",
    length: 11.8, width: 2.7, height: 3.3, doors: 2, profile: 'agt', nose: 'rounded', ...white, front: WHITE,
    stripes: [band('line', 0.3, 0.38)],
    frontStripes: [band(FACE, 0.46, 0.86)],
    pantograph: false,
  },
  {
    id: 'singapore-c810', name: 'C810 Crystal Mover', maker: 'Mitsubishi Heavy Industries', introduced: 2003,
    blurb: 'Driverless rubber-tired Crystal Movers that run both ways around the Sengkang and Punggol loops.',
    length: 11.8, width: 2.69, height: 3.4, doors: 2, profile: 'agt', nose: 'rounded', ...white, front: WHITE,
    stripes: [band('line', 0.3, 0.38)],
    frontStripes: [band(FACE, 0.46, 0.86)],
    pantograph: false,
  },
];
