import { STYLE, type LookConfig } from './look.ts';

// Themes. Every theme draws the same live data and map; a theme is a look (the palette and treatment of
// every material, see look.ts), a sky and light, and at most one gentle post effect. The rules they all follow:
//   1. Trains and lines keep their true colors and stay the clearest things on screen.
//   2. Texture and linework fade to flat fills as you zoom out, so the far view stays calm.
//   3. The style lives in the materials, not in a filter over the finished frame.

export type ThemeId = 'toy' | 'clay' | 'blueprint' | 'subway' | 'neon' | 'pixel' | 'voxel';

/** A theme's own sky and light, in place of the real sun (see Atmosphere.style). */
export interface SkyStyle {
  /** Backdrop gradient, top to bottom. */
  top: string;
  bottom: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  shadows: boolean;
  stars?: boolean;
}

export interface Theme {
  id: ThemeId;
  name: string;
  blurb: string;
  /** Picker thumbnail: a CSS background. */
  swatch: string;
  /** Force the time of day (null = the city's real sky). */
  sky: null | 'day' | 'night';
  /** Replaces the sky gradient and lights (null = the real sky). */
  skyStyle: SkyStyle | null;
  clouds: boolean;
  /** Shadow-edge softness (PCF radius; the default is 3). */
  shadowRadius?: number;
  trees: 'blob' | 'cube';
  look: Partial<LookConfig>;
  /** Google Fonts families to load on first use. */
  fonts?: string;
  /** Post-processing: none (draw straight to the screen) or a named effect. */
  post: null | 'neon' | 'pixel';
}

export const THEMES: Theme[] = [
  {
    id: 'toy',
    name: 'Toy',
    blurb: 'Bright little dioramas floating in the clouds',
    swatch: 'linear-gradient(135deg, #7cc3f2 0 40%, #eef0cf 40% 70%, #ff5a5f 70% 80%, #ffd23f 80%)',
    sky: null,
    skyStyle: null,
    clouds: true,
    trees: 'blob',
    look: {},
    post: null,
  },
  {
    id: 'clay',
    name: 'Clay',
    blurb: 'An architect’s white model: only the trains and their lines in color',
    swatch: 'linear-gradient(135deg, #f3f0e9 0 52%, #e8474c 52% 56%, #f3f0e9 56% 70%, #2a7de1 70% 74%, #dcd6ca 74%)',
    sky: 'day',
    skyStyle: { top: '#dcd8cf', bottom: '#f6f4ef', sun: '#fff8ec', sunI: 1.9, hemiSky: '#ffffff', hemiGround: '#dcd6ca', hemiI: 2.15, shadows: true },
    clouds: false,
    trees: 'blob',
    look: {
      style: STYLE.clay,
      land: '#efebe2',
      land2: '#efebe2',
      park: '#e3e5d8',
      green: '#dfe2d3',
      sand: '#f2ede2',
      airport: '#ebe7de',
      runway: '#dbd6cb',
      waterDeep: '#c3cfd5',
      waterShallow: '#d0dade',
      foam: '#eef2f3',
      road: '#f8f6f1',
      motorway: '#fbfaf6',
      rail: '#dcd6ca',
      shore: '#e6ecee',
      detail: 0.08,
      nightK: 0,
      roadGlowK: 0,
      bTint: '#f5f2eb',
      bTintK: 1,
      bRoof: '#fbfaf6',
      bRoofK: 1,
      bWin: 0,
      bLit: 0,
      bLitK: 0,
      bEdge: '#cbc3b4',
      bEdgeK: 0.35,
      bEdgePx: 1,
      suburbWall: '#f2eee6',
      suburbRoof: '#e6e0d4',
      suburbK: 1,
      tree: '#e3e7d6',
      treeK: 1,
      landmark: '#f7f4ee',
      landmarkK: 1,
      slab: '#e4ded1',
      slabK: 1,
      lineDetail: 0.2,
    },
    fonts: 'DM+Sans:wght@400;500;700',
    post: null,
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    blurb: 'Drafted in white ink on engineer’s blue',
    swatch: 'linear-gradient(#ffffff26 1px, transparent 1px) 0 0 / 10px 10px, linear-gradient(90deg, #ffffff26 1px, transparent 1px) 0 0 / 10px 10px, #1f4f8a',
    sky: 'day',
    skyStyle: { top: '#133866', bottom: '#1b4a82', sun: '#ffffff', sunI: 0.9, hemiSky: '#ffffff', hemiGround: '#b4c6de', hemiI: 2.1, shadows: false },
    clouds: false,
    trees: 'blob',
    look: {
      style: STYLE.blueprint,
      land: '#1f4f8a',
      land2: '#1f4f8a',
      park: '#23548f',
      green: '#22538d',
      sand: '#24568f',
      airport: '#21528c',
      runway: '#2b5e97',
      waterDeep: '#17406f',
      waterShallow: '#1a4679',
      foam: '#7fa8d8',
      road: '#33639c',
      motorway: '#3f70a9',
      rail: '#31619a',
      shore: '#9dbfe6',
      detail: 0,
      nightK: 0,
      roadGlowK: 0,
      grid: '#6b97cc',
      gridK: 0.22,
      bTint: '#2a5c97',
      bTintK: 1,
      bRoof: '#2f64a0',
      bRoofK: 1,
      bWin: 0,
      bLit: 0,
      bLitK: 0,
      bEdge: '#e8f1ff',
      bEdgeK: 0.8,
      bEdgePx: 1,
      suburbWall: '#2a5c97',
      suburbRoof: '#2e619c',
      suburbK: 1,
      tree: '#2d629e',
      treeK: 1,
      landmark: '#d6e5fa',
      landmarkK: 1,
      slab: '#173e6c',
      slabK: 1,
      lineWhite: 0.25,
      lineDetail: 0,
    },
    fonts: 'IBM+Plex+Mono:wght@400;500;600;700',
    post: null,
  },
  {
    id: 'subway',
    name: 'NYC Subway',
    blurb: 'Black signs, Helvetica and route bullets, on a diagram-clean map',
    swatch:
      'radial-gradient(circle at 26% 64%, #ee352e 0 15%, transparent 16%), radial-gradient(circle at 50% 64%, #00933c 0 15%, transparent 16%), radial-gradient(circle at 74% 64%, #0039a6 0 15%, transparent 16%), linear-gradient(#000 0 13%, #fff 13% 16%, #000 16%)',
    sky: 'day',
    skyStyle: { top: '#e3e2de', bottom: '#f5f4f0', sun: '#ffffff', sunI: 2.0, hemiSky: '#ffffff', hemiGround: '#c9c6bd', hemiI: 1.8, shadows: true },
    clouds: false,
    trees: 'blob',
    look: {
      style: STYLE.subway,
      land: '#efeeea',
      land2: '#efeeea',
      park: '#c6dcb0',
      green: '#bdd6a7',
      sand: '#ebe5d2',
      airport: '#e6e5e0',
      runway: '#d2d1cc',
      waterDeep: '#8fc0de',
      waterShallow: '#a8d0e6',
      foam: '#dcebf3',
      road: '#ffffff',
      motorway: '#ffffff',
      rail: '#d9d7d0',
      shore: '#ffffff',
      detail: 0.05,
      nightK: 0,
      roadGlowK: 0,
      bTint: '#dcdad4',
      bTintK: 1,
      bRoof: '#e9e7e2',
      bRoofK: 1,
      bWin: 0,
      bLit: 0,
      bLitK: 0,
      bEdge: '#a09d95',
      bEdgeK: 0.3,
      bEdgePx: 1,
      suburbWall: '#e3e1db',
      suburbRoof: '#d5d2cb',
      suburbK: 1,
      tree: '#b5cd9e',
      treeK: 1,
      landmark: '#d9d7d0',
      landmarkK: 0.6,
      slab: '#d9d6cd',
      slabK: 1,
      lineDetail: 0,
      lineCase: '#ffffff',
      lineCaseK: 1,
    },
    fonts: 'Arimo:wght@400;700',
    post: null,
  },
  {
    id: 'neon',
    name: 'Neon',
    blurb: 'A synthwave city that never sleeps',
    swatch: 'linear-gradient(180deg, #12002b 0 55%, #ff2fb3 55% 58%, #12002b 58% 70%, #25e8ff 70% 73%, #12002b 73%)',
    sky: 'night',
    skyStyle: { top: '#05021a', bottom: '#2a0b46', sun: '#9a8cff', sunI: 0.75, hemiSky: '#6252b0', hemiGround: '#0b0719', hemiI: 1.0, shadows: false, stars: true },
    clouds: false,
    trees: 'blob',
    look: {
      style: STYLE.neon,
      land: '#0d0a24',
      land2: '#0d0a24',
      park: '#0b1b26',
      green: '#0a1823',
      sand: '#140f2a',
      airport: '#100c27',
      runway: '#1c1636',
      waterDeep: '#040310',
      waterShallow: '#07061a',
      foam: '#140a30',
      road: '#1f1940',
      motorway: '#2b2152',
      rail: '#1b1635',
      shore: '#ff2fb3',
      detail: 0,
      nightK: 0,
      roadGlow: '#6b45ff',
      roadGlowK: 0.25,
      grid: '#2de2ff',
      gridK: 0.1,
      coastGlow: '#ff2fb3',
      coastGlowK: 0.45,
      bTint: '#17122f',
      bTintK: 1,
      bRoof: '#1d173c',
      bRoofK: 1,
      bWin: 0.1,
      bLit: 0.1,
      bLitCol: '#2de2ff',
      bLitK: 0.6,
      bEdge: '#8a6cff',
      bEdgeK: 0.45,
      bEdgePx: 1,
      suburbWall: '#151032',
      suburbRoof: '#1c1641',
      suburbK: 1,
      tree: '#0d383b',
      treeK: 1,
      landmark: '#2d2458',
      landmarkK: 0.85,
      slab: '#110c29',
      slabK: 1,
      lineWhite: 0.08,
      lineGlow: 1,
      lineDetail: 0,
      trainGlow: 1,
    },
    fonts: 'Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700',
    post: 'neon',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    blurb: 'A crisp isometric pixel-art city, like a 90s tycoon game',
    swatch: 'conic-gradient(#63c1ec 0 25%, #8fd16a 0 50%, #e8e1c8 0 75%, #ff5a5f 0) 0 0 / 12px 12px',
    sky: null,
    skyStyle: null,
    clouds: true,
    shadowRadius: 0.5,
    trees: 'blob',
    look: {
      style: STYLE.pixel,
      land: '#e6dfc6',
      land2: '#e6dfc6',
      park: '#8ccf66',
      green: '#72c15a',
      sand: '#f2dc9a',
      airport: '#dad4bd',
      runway: '#9ca2ac',
      waterDeep: '#3b9ad8',
      waterShallow: '#62c0eb',
      foam: '#ffffff',
      road: '#f7f4ea',
      motorway: '#ffe7a6',
      rail: '#b3a896',
      shore: '#ffffff',
      detail: 0.25,
      bEdge: '#2b2440',
      bEdgeK: 0.8,
      bEdgePx: 1,
      lineDetail: 0,
    },
    fonts: 'Pixelify+Sans:wght@400;600;700&family=Press+Start+2P',
    post: 'pixel',
  },
  {
    id: 'voxel',
    name: 'Voxel',
    blurb: 'The whole city rebuilt in blocks',
    swatch: 'linear-gradient(135deg, #86c96a 0 33%, #e4dcc8 33% 66%, #5fc6ee 66%) 0 0 / 14px 14px',
    sky: null,
    skyStyle: null,
    clouds: true,
    shadowRadius: 1,
    trees: 'cube',
    look: {
      style: STYLE.voxel,
      voxel: 8,
      land: '#e3dbc6',
      land2: '#e3dbc6',
      park: '#86c96a',
      green: '#76bd5c',
      sand: '#eedca4',
      airport: '#dcd6c2',
      runway: '#a9adb5',
      waterDeep: '#3a9fd8',
      waterShallow: '#5fc6ee',
      foam: '#ffffff',
      road: '#f1ede3',
      motorway: '#fbe6ae',
      rail: '#b7ad9b',
      detail: 0,
      bWin: 0.8,
    },
    post: null,
  },
];

export const themeById = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? THEMES[0];

const KEY = 'tt-theme';

let current: Theme = THEMES[0];
export const activeTheme = () => current;
export function setActiveTheme(t: Theme) {
  current = t;
}
/** `?theme=…` for links, so a shared view opens in the same style (empty for the default). */
export const themeQuery = () => (current.id === 'toy' ? '' : `?theme=${current.id}`);

/** The theme to start with: ?theme= in the URL, else the last one picked on this device. */
export function initialTheme(): Theme {
  const q = new URLSearchParams(location.search).get('theme');
  if (q) return themeById(q);
  try {
    return themeById(localStorage.getItem(KEY));
  } catch {
    return THEMES[0];
  }
}

export function rememberTheme(id: ThemeId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode: fine */
  }
}

const loaded = new Set<string>();
export function loadFonts(t: Theme) {
  if (!t.fonts || loaded.has(t.fonts)) return;
  loaded.add(t.fonts);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${t.fonts}&display=swap`;
  document.head.appendChild(l);
}
