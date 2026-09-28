import type { DayService } from './network.ts';

// Typical service used to simulate trains when no realtime key is configured (build time only; the build
// resolves it into server/data/seoul/network.json). Headways are for the whole line in one direction; each
// pattern runs `share` of those departures. Station names are Korean, as in OSM; terminals may lie outside the map.

export interface PatternConf {
  from: string;
  to: string;
  via?: string;
  share: number;
  express?: string[]; // stops of an express pattern (the passed stations are left out)
  oneWay?: boolean;
  loop?: boolean;
  ud?: 0 | 1; // which loop (0 inner, 1 outer)
  nonstop?: boolean; // express stops are only timing points (AREX express)
  group?: string; // patterns of a group share one evenly spaced departure sequence (default 'main')
}

export interface ServiceConf {
  wd: DayService;
  we: DayService;
  /** Groups that keep their own headways instead of the line's (a branch shuttle, an airport express). */
  groups?: Record<string, { wd: DayService; we: DayService }>;
  patterns: PatternConf[];
}

const time = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h < 4 ? h + 24 : h) * 3600 + m * 60;
};

/** Hourly headways from breakpoints: [[hour, minutes], ...], each holding until the next breakpoint. */
const hw = (...spec: [number, number][]) => {
  const out: number[] = [];
  for (let h = 0; h < 26; h++) {
    let v = spec[0][1];
    for (const [from, m] of spec) if (h >= from) v = m;
    out.push(v);
  }
  return out;
};

const day = (first: string, last: string, ...spec: [number, number][]): DayService => ({ first: time(first), last: time(last), hw: hw(...spec) });

/**
 * A typical day: headways (minutes) in the peaks (07–09 and 18–20), midday, evening and late, and on weekends and
 * holidays (daytime, late), with the first and last departures.
 */
const typical = (
  o: { peak: number; mid: number; eve: number; late: number; we: number; weLate: number },
  first = '05:30',
  last = '00:30',
  weLast = '00:00',
): Pick<ServiceConf, 'wd' | 'we'> => ({
  wd: day(first, last, [0, o.late], [5, o.mid + 1], [7, o.peak], [9, o.mid], [17, o.eve], [18, o.peak], [20, o.eve], [22, o.late]),
  we: day(first, weLast, [0, o.weLate], [5, o.we + 2], [8, o.we], [21, o.weLate]),
});

// Lines 1–9 run from Seoul Metro's official timetable; these are the lines it does not cover. Within a group,
// `share`s add up to the group's frequency in units of the line (or group) headway, and its patterns take turns in
// proportion to them. Frequencies are estimates from operator information and Wikipedia (Sept 2026).
export const SERVICE: Record<string, ServiceConf> = {
  'suin-bundang': {
    ...typical({ peak: 4.5, mid: 7.5, eve: 5, late: 9, we: 10, weLate: 12 }, '05:30', '00:20', '23:50'),
    patterns: [
      { from: '청량리', to: '인천', share: 0.2 },
      { from: '왕십리', to: '인천', share: 0.2 },
      { from: '청량리', to: '고색', share: 0.2 },
      { from: '청량리', to: '죽전', share: 0.2 },
      { from: '왕십리', to: '죽전', share: 0.2 },
    ],
  },
  shinbundang: {
    ...typical({ peak: 5, mid: 8, eve: 5.5, late: 9, we: 9, weLate: 10 }, '05:30', '00:26', '23:48'),
    patterns: [{ from: '신사', to: '광교', share: 1 }],
  },
  'gyeongui-jungang': {
    ...typical({ peak: 10, mid: 13, eve: 11, late: 15, we: 15, weLate: 20 }, '05:20', '00:10', '23:50'),
    groups: { 'seoul-station': typical({ peak: 30, mid: 60, eve: 30, late: 60, we: 60, weLate: 60 }, '06:00', '22:30', '22:00') },
    patterns: [
      { from: '문산', to: '용문', share: 0.6 },
      { from: '일산', to: '덕소', share: 0.4 },
      { from: '서울역', to: '문산', share: 1, group: 'seoul-station' },
    ],
  },
  arex: {
    ...typical({ peak: 6.5, mid: 11.5, eve: 8, late: 12, we: 11.5, weLate: 12 }, '05:20', '23:40', '23:40'),
    groups: { express: typical({ peak: 35, mid: 35, eve: 35, late: 40, we: 35, weLate: 40 }, '06:00', '23:00', '23:00') },
    patterns: [
      { from: '서울역', to: '인천공항2터미널', share: 1 },
      { from: '서울역', to: '인천공항2터미널', share: 1, group: 'express', express: ['서울역', '김포공항'], nonstop: true },
    ],
  },
  gyeongchun: {
    ...typical({ peak: 15, mid: 25, eve: 20, late: 30, we: 20, weLate: 30 }, '05:30', '23:40', '23:40'),
    patterns: [
      { from: '상봉', to: '춘천', share: 0.4 },
      { from: '상봉', to: '마석', share: 0.2 },
      { from: '청량리', to: '춘천', share: 0.2 },
      { from: '광운대', to: '평내호평', share: 0.2 },
    ],
  },
  ui: {
    ...typical({ peak: 3, mid: 6, eve: 4, late: 8, we: 6, weLate: 9 }),
    patterns: [{ from: '북한산우이', to: '신설동', share: 1 }],
  },
  sillim: {
    ...typical({ peak: 4, mid: 6, eve: 5, late: 8, we: 7, weLate: 9 }),
    patterns: [{ from: '샛강', to: '관악산', share: 1 }],
  },
};
