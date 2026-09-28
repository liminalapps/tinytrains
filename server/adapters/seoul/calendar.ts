// Service days in Korea Standard Time. Trains after midnight belong to the previous day until 03:00.
// Seoul Metro publishes weekday, Saturday and Sunday/holiday timetables; the headway model only tells weekdays
// from weekends.

const KST = 9 * 3600;
const DAY_START = 3 * 3600;

/** Public holidays (incl. substitute days) that run the holiday timetable. */
const HOLIDAYS = new Set([
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-02', '2026-05-05', '2026-05-25', '2026-06-03',
  '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-05', '2026-10-09', '2026-12-25',
  '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-08-16', '2027-09-14',
  '2027-09-15', '2027-09-16', '2027-10-04', '2027-10-11', '2027-12-27',
]);

export type DayType = 'wd' | 'we';

export interface ServiceDay {
  date: string; // YYYY-MM-DD
  base: number; // epoch seconds of that day's midnight in KST
  type: DayType;
  timetable: 0 | 1 | 2; // 0 weekday, 1 Saturday, 2 Sunday or holiday
}

/** The service day running at `nowSec`, or `back` days before it. */
export function serviceDay(nowSec: number, back = 0): ServiceDay {
  const day = Math.floor((nowSec + KST - DAY_START) / 86400) - back;
  const date = new Date(day * 86400_000);
  const iso = date.toISOString().slice(0, 10);
  const dow = date.getUTCDay();
  const timetable = dow === 0 || HOLIDAYS.has(iso) ? 2 : dow === 6 ? 1 : 0;
  return { date: iso, base: day * 86400 - KST, type: timetable ? 'we' : 'wd', timetable };
}

/** '2026-09-25 07:05:39' (KST) as epoch seconds. */
export function parseKst(s: string | undefined): number {
  const m = s && /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d):(\d\d)/.exec(s);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 - KST;
}
