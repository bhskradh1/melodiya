// Helpers for "next song of the same genre" (kept separate so they are easy to test)

export interface Candidate {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration: string;
}

const NOISE = /\b(official|video|audio|lyrics?|lyrical|hd|4k|mv|music|full|song|visualizer|ft|feat|featuring|remastered|live)\b/g;

/** "Shape of You (Official Video) [HD]" -> "shape of you" */
export const normalizeTitle = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Same song, different upload / cover / remix of it */
export const isSameSong = (a: string, b: string): boolean => {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 4 && long.includes(short);
};

const BAD_WORDS =
  /\b(cover|karaoke|instrumental|reaction|tutorial|lesson|nonstop|non-stop|jukebox|mashup|compilation|playlist|mix|hours?|slowed|reverb|8d|sped up|nightcore|status)\b/i;

/** "PT3M42S" -> seconds */
export const parseISODuration = (iso: string): number => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
};

export const formatDuration = (sec: number): string =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const GENERIC_TOPICS = new Set(['music', 'entertainment', 'lifestyle', 'hobby', 'knowledge']);

/** YouTube topicCategories (Wikipedia URLs) -> readable genre, e.g. "Hip hop" */
export const genreFromTopics = (topics: string[] = []): string | null => {
  for (const url of topics) {
    const name = decodeURIComponent(url.split('/').pop() || '').replace(/_/g, ' ').trim();
    const key = name.toLowerCase();
    if (!name || GENERIC_TOPICS.has(key) || key.startsWith('music of')) continue;
    return name.replace(/ music$/i, '');
  }
  return null;
};

const LANGS: Record<string, string> = {
  en: 'English', hi: 'Hindi', ne: 'Nepali', pa: 'Punjabi', bn: 'Bengali', ta: 'Tamil', te: 'Telugu',
  ur: 'Urdu', mr: 'Marathi', gu: 'Gujarati', es: 'Spanish', pt: 'Portuguese', ko: 'Korean',
  ja: 'Japanese', ar: 'Arabic', fr: 'French', de: 'German', ru: 'Russian', tr: 'Turkish',
};
export const langFromCode = (code?: string): string | null =>
  code ? LANGS[code.toLowerCase().split('-')[0]] ?? null : null;

/**
 * Keep real songs only, drop covers/remixes/mixes, drop the same song,
 * at most 2 songs per artist, no duplicate titles.
 */
export const pickRelated = (
  items: Candidate[],
  opts: { currentTitle: string; currentArtist: string; excludeTitles?: string[]; limit?: number }
): Candidate[] => {
  const seenTitles: string[] = [opts.currentTitle, ...(opts.excludeTitles || [])];
  const perArtist = new Map<string, number>();
  const out: Candidate[] = [];
  const curArtist = opts.currentArtist.toLowerCase();

  for (const c of items) {
    if (BAD_WORDS.test(c.title)) continue;
    if (seenTitles.some((t) => isSameSong(t, c.title))) continue;
    const a = c.artist.toLowerCase();
    const limit = a === curArtist ? 1 : 2; // other artists first, same artist at most once
    if ((perArtist.get(a) || 0) >= limit) continue;
    perArtist.set(a, (perArtist.get(a) || 0) + 1);
    seenTitles.push(c.title);
    out.push(c);
    if (out.length >= (opts.limit ?? 15)) break;
  }
  return out;
};
