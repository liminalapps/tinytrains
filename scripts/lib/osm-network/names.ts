// Station name matching and display names.

/** Key for matching a station name: case, spaces, parentheses and station suffixes ignored. */
export function nameKey(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '') // invisible format marks (OSM Cairo ends names with U+200E)
    .toLowerCase()
    .replace(/\(.*?\)|（.*?）|\[.*?\]/g, '')
    .replace(/\s+[-–—]\s+.*$/u, '') // 'Sengkang - East Loop Clockwise': platform details after a spaced dash
    .replace(/^(станция|ст\.|метро|м\.)\s+/u, '')
    .replace(/^(محط[ةه]\s+(مترو|مونوريل)|محط[ةه]|مترو|مونوريل)\s+/u, '') // 'محطة مترو …': (metro) station
    .replace(/\s+(station|mrt station|lrt station|mrt|lrt|станция|метро|stn)$/u, '')
    .replace(/(地铁站|站|駅)$/u, '')
    .replace(/ё/g, 'е')
    .replace(/[\s\-–—'’.·•,]/g, '');
}

/**
 * Whether a stop's name is its station's name plus platform details ('Sengkang - East Loop', 'Сокольники, путь 1',
 * 'Kovan Exit A') rather than a different station that extends it (惠南东 beside 惠南, Eastwood beside East): the text
 * after the station's name has to start with a separator, a digit or a platform word.
 */
export function extendsName(stop: string, stationKey: string): boolean {
  for (let i = 1; i <= stop.length; i++) {
    if (nameKey(stop.slice(0, i)) !== stationKey) continue;
    const rest = stop.slice(i).replace(/\p{Cf}/gu, '');
    return !rest || /^([\s\-–—(（\[/:：,，·_#]|\d|(站台|月台|站(?!前)|駅(?!前)|ホーム|のりば|乗り場|platform|track|перрон|платформа|путь))/iu.test(rest);
  }
  return false;
}

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Simple Russian-style romanization, used only when OSM has no English name. */
export function transliterateCyrillic(s: string): string {
  let out = '';
  for (const ch of s) {
    const lower = ch.toLowerCase();
    const t = CYR[lower];
    if (t === undefined) out += ch;
    else out += ch !== lower && t ? t[0].toUpperCase() + t.slice(1) : t;
  }
  return out;
}

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9Ѐ-ӿ一-鿿]+/g, '-')
    .replace(/^-|-$/g, '');

/** Display names drop OSM's bracketed extras and 'station' suffixes. */
export const cleanDisplay = (s: string) =>
  s
    .replace(/[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '') // bidi marks and zero-width spaces, but not the joiners some scripts need
    .replace(/\s*[(（][^)）]*[)）]\s*/g, ' ')
    .replace(/\s+[-–—]\s+.*$/u, '')
    .replace(/(?<!Railway)\s+(MRT|LRT)?\s*Station$/i, '') // but 'Shanghai Railway Station' keeps it
    .replace(/\s+/g, ' ')
    .trim();
