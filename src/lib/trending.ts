import { supabase } from '@/integrations/supabase/client';

export interface TrendingTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

/** ISO-style year + week number, e.g. "2026-W34". Rolls over every Monday. */
export const getWeekKey = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const WEEKLY_SEEDS = [
  'top trending songs this week',
  'billboard hot 100 this week',
  'viral hits this week',
  'most streamed songs this week',
  'new music releases this week',
  'youtube music charts this week',
];

const getWeeklyQuery = (offset = 0) => {
  const weekKey = getWeekKey();
  const weekNumber = parseInt(weekKey.split('W')[1], 10);
  const seed = WEEKLY_SEEDS[(weekNumber + offset) % WEEKLY_SEEDS.length];
  return `${seed} ${weekKey}`;
};

const CACHE_PREFIX = 'trending_week_';

const readCache = (key: string): TrendingTrack[] | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as TrendingTrack[]) : null;
  } catch {
    return null;
  }
};

const clearStaleCaches = (currentKey: string) => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX) && k !== currentKey)
      .forEach((k) => localStorage.removeItem(k));
    // legacy daily caches
    Object.keys(localStorage)
      .filter((k) => k.startsWith('trending_cache_'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage may be unavailable */
  }
};

/**
 * Trending tracks for the current calendar week. Results are cached per week so
 * everyone sees the same chart until the next Monday rollover.
 */
export const fetchWeeklyTrending = async (force = false): Promise<TrendingTrack[]> => {
  const cacheKey = `${CACHE_PREFIX}${getWeekKey()}`;

  if (!force) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }
  clearStaleCaches(cacheKey);

  // Query two seeds so the weekly chart is deeper and swipeable.
  const responses = await Promise.all(
    [0, 1].map((offset) =>
      supabase.functions
        .invoke('youtube-search', { body: { query: getWeeklyQuery(offset) } })
        .catch(() => ({ data: null, error: true as const }))
    )
  );

  const seen = new Set<string>();
  const tracks: TrendingTrack[] = [];
  for (const res of responses) {
    const list = (res as any)?.data?.tracks as TrendingTrack[] | undefined;
    if (!list) continue;
    for (const t of list) {
      if (t?.videoId && !seen.has(t.videoId)) {
        seen.add(t.videoId);
        tracks.push(t);
      }
    }
  }

  if (tracks.length) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(tracks));
    } catch {
      /* ignore quota errors */
    }
  }
  return tracks;
};
