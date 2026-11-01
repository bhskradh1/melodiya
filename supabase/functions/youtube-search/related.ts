// Helpers for YouTube-style "Up next" recommendations.

export interface Candidate {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration: string;
  relevanceRank?: number;
  viewCount?: number;
  viewsPerDay?: number;
  likeRatio?: number;
  vibeMatch?: number;
  genreMatch?: number;
  /** Last.fm similarity score, normally between 0 and 1. */
  lastFmMatch?: number;
  /** MusicBrainz recording MBID supplied by Last.fm when known. */
  musicBrainzId?: string;
  /** Signals that this YouTube result is from an official artist/label upload. */
  officialSignal?: number;
}

const NOISE = /\b(official|video|audio|lyrics?|lyrical|hd|4k|mv|music|full|song|visualizer|ft|feat|featuring|remastered|live)\b/g;

export const normalizeTitle = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isSameSong = (first: string, second: string): boolean => {
  const a = normalizeTitle(first);
  const b = normalizeTitle(second);
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 4 && longer.includes(shorter);
};

const BAD_WORDS =
  /\b(cover|karaoke|instrumental|reaction|tutorial|lesson|nonstop|non-stop|jukebox|mashup|compilation|playlist|mix|hours?|slowed|reverb|8d|sped up|nightcore|status)\b/i;

const VIBE_RULES: Array<{ pattern: RegExp; query: string }> = [
  { pattern: /\b(romantic|love|lover|valentine|couple|affection)\b/i, query: 'romantic soulful love songs' },
  { pattern: /\b(sad|heartbreak|broken|emotional|tears|lonely|melancholy)\b/i, query: 'emotional sad melodic songs' },
  { pattern: /\b(chill|relax|relaxing|lofi|lo-fi|acoustic|soft|calm|peaceful)\b/i, query: 'chill mellow acoustic songs' },
  { pattern: /\b(party|dance|club|edm|electronic|dj|remix)\b/i, query: 'upbeat dance party hits' },
  { pattern: /\b(energetic|energy|workout|gym|anthem|hype|power)\b/i, query: 'energetic upbeat hits' },
  { pattern: /\b(rap|hip.?hop|trap|drill)\b/i, query: 'hip hop rap hits' },
  { pattern: /\b(devotional|bhajan|worship|spiritual|mantra)\b/i, query: 'devotional spiritual songs' },
  { pattern: /\b(folk|traditional|lok|lokgeet)\b/i, query: 'folk traditional songs' },
  { pattern: /\b(jazz|blues|soul|r.?&.?b)\b/i, query: 'soul r&b jazz songs' },
];

export const inferVibeTerms = (text: string): string[] =>
  VIBE_RULES.filter((rule) => rule.pattern.test(text)).slice(0, 2).map((rule) => rule.query);

export const parseISODuration = (iso: string): number => {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!match) return 0;
  return (Number(match[1] || 0) * 3600) +
    (Number(match[2] || 0) * 60) +
    Number(match[3] || 0);
};

export const formatDuration = (seconds: number): string =>
  String(Math.floor(seconds / 60)) + ':' + String(seconds % 60).padStart(2, '0');

const GENERIC_TOPICS = new Set(['music', 'entertainment', 'lifestyle', 'hobby', 'knowledge']);

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

const normalizeArtist = (artist: string): string =>
  artist
    .toLowerCase()
    .replace(/\s*[-|]\s*topic$/i, '')
    .replace(/\b(official|vevo)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Split collaborations so a featured singer is not recommended again either. */
export const artistKeys = (artist: string): string[] => {
  const value = artist.trim();
  if (!value) return [];
  if (/^r\s*&\s*b$/i.test(value)) return ['r&b'];
  return value
    .split(/\s+(?:feat(?:uring)?\.?|ft\.?|with)\s+|[,;/&]|\s+x\s+|\s+and\s+/i)
    .map(normalizeArtist)
    .filter((name) => name.length >= 2);
};

const normalizedLogValues = (values: number[]): number[] => {
  if (!values.length) return [];
  const logs = values.map((value) => Math.log1p(Math.max(0, value)));
  const minimum = Math.min(...logs);
  const maximum = Math.max(...logs);
  if (maximum - minimum < 0.000001) return values.map(() => 0.5);
  return logs.map((value) => (value - minimum) / (maximum - minimum));
};

/** Blend query similarity, fresh popularity and mood fit. */
export const rankRelated = (items: Candidate[]): Candidate[] => {
  if (items.length < 2) return items;

  const popularity = normalizedLogValues(items.map((item) => item.viewCount ?? 0));
  const momentum = normalizedLogValues(items.map((item) => item.viewsPerDay ?? 0));
  const engagement = normalizedLogValues(items.map((item) => item.likeRatio ?? 0));

  return items
    .map((item, index) => {
      const relevance = item.relevanceRank === undefined
        ? 1 - index / Math.max(1, items.length - 1)
        : 1 - item.relevanceRank / Math.max(1, items.length - 1);
      const score =
        relevance * 0.25 +
        (item.lastFmMatch ?? 0.25) * 0.30 +
        momentum[index] * 0.20 +
        popularity[index] * 0.12 +
        (item.vibeMatch ?? 0.5) * 0.06 +
        (item.genreMatch ?? 0.5) * 0.03 +
        (item.officialSignal ?? 0.2) * 0.03 +
        engagement[index] * 0.01;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
};

/**
 * Never reuse a song or singer already heard/queued in the current radio
 * session. Only one recommendation per singer is allowed in the new queue.
 */
export const pickRelated = (
  items: Candidate[],
  opts: {
    currentTitle: string;
    currentArtist: string;
    excludeTitles?: string[];
    excludeVideoIds?: string[];
    excludeArtists?: string[];
    excludeMusicBrainzIds?: string[];
    limit?: number;
  },
): Candidate[] => {
  const seenTitles = [opts.currentTitle, ...(opts.excludeTitles || [])];
  const seenIds = new Set([...(opts.excludeVideoIds || [])]);
  const seenMusicBrainzIds = new Set((opts.excludeMusicBrainzIds || []).filter(Boolean));
  const seenArtists = new Set(
    [opts.currentArtist, ...(opts.excludeArtists || [])].flatMap(artistKeys),
  );
  const out: Candidate[] = [];

  for (const candidate of rankRelated(items)) {
    if (!candidate.videoId || seenIds.has(candidate.videoId)) continue;
    if (candidate.musicBrainzId && seenMusicBrainzIds.has(candidate.musicBrainzId)) continue;
    if (BAD_WORDS.test(candidate.title)) continue;
    if (seenTitles.some((title) => isSameSong(title, candidate.title))) continue;

    const names = artistKeys(candidate.artist);
    if (names.length === 0 || names.some((name) => seenArtists.has(name))) continue;

    seenIds.add(candidate.videoId);
    if (candidate.musicBrainzId) seenMusicBrainzIds.add(candidate.musicBrainzId);
    seenTitles.push(candidate.title);
    names.forEach((name) => seenArtists.add(name));
    out.push(candidate);

    if (out.length >= (opts.limit ?? 15)) break;
  }

  return out;
};
