// Japanese public holidays (Act on National Holidays, as amended through 2020) and service days.

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const nthMonday = (y: number, m: number, n: number) => 1 + ((8 - dow(y, m, 1)) % 7) + (n - 1) * 7;

const cache = new Map<number, Set<string>>();

export function holidays(y: number): Set<string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const base: [number, number][] = [
    [1, 1],
    [1, nthMonday(y, 1, 2)], // Coming of Age Day
    [2, 11],
    [2, 23], // Emperor's Birthday
    [3, Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))], // Vernal Equinox
    [4, 29],
    [5, 3],
    [5, 4],
    [5, 5],
    [7, nthMonday(y, 7, 3)], // Marine Day
    [8, 11], // Mountain Day
    [9, nthMonday(y, 9, 3)], // Respect for the Aged Day
    [9, Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))], // Autumnal Equinox
    [10, nthMonday(y, 10, 2)], // Sports Day
    [11, 3],
    [11, 23],
  ];
  const set = new Set(base.map(([m, d]) => ymd(y, m, d)));
  const isHol = (t: number) => {
    const dt = new Date(t);
    return set.has(ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
  };
  const DAY = 86400000;
  for (const [m, d] of base) {
    const t = Date.UTC(y, m - 1, d);
    // Substitute holiday: a holiday on Sunday moves to the next non-holiday day.
    if (dow(y, m, d) === 0) {
      let s = t + DAY;
      while (isHol(s)) s += DAY;
      const dt = new Date(s);
      set.add(ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
    }
    // Citizens' holiday: a weekday sandwiched between two holidays.
    const mid = new Date(t + DAY);
    if (isHol(t + 2 * DAY) && !isHol(t + DAY) && mid.getUTCDay() !== 0) {
      set.add(ymd(mid.getUTCFullYear(), mid.getUTCMonth() + 1, mid.getUTCDate()));
    }
  }
  cache.set(y, set);
  return set;
}

export type DayType = 'Weekday' | 'Saturday' | 'Holiday';

/** Timetable day type; Tokyo railways run the holiday timetable over the New Year break (Dec 30 - Jan 3). */
export function dayType(y: number, m: number, d: number): DayType {
  const w = dow(y, m, d);
  if (w === 0 || holidays(y).has(ymd(y, m, d)) || (m === 12 && d >= 30) || (m === 1 && d <= 3)) return 'Holiday';
  return w === 6 ? 'Saturday' : 'Weekday';
}

const JST = 9 * 3600;
/** Service day that is `back` days before the current JST date: its date, day type and midnight (epoch s). */
export function serviceDay(nowSec: number, back: number) {
  const dt = new Date((nowSec + JST) * 1000);
  const midnight = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() - back) / 1000;
  const day = new Date(midnight * 1000);
  const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
  return { date: ymd(y, m, d), type: dayType(y, m, d), base: midnight - JST };
}

/** Pick the timetable calendar for a line given the available calendars. */
export function pickCalendar(type: DayType, available: Set<string>): string | undefined {
  if (type === 'Weekday') return available.has('Weekday') ? 'Weekday' : undefined;
  if (available.has(type)) return type;
  return available.has('SaturdayHoliday') ? 'SaturdayHoliday' : undefined;
}
