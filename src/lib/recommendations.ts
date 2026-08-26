import { supabase } from '@/integrations/supabase/client';
import { LANGUAGE_LABELS, type UserPreferences } from '@/contexts/PreferencesContext';

export interface RecTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

export interface RecommendationRow {
  key: string;
  title: string;
  subtitle: string;
  tracks: RecTrack[];
}

const CACHE_PREFIX = 'melodiya_recs_';
const TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

const cacheKey = (q: string) => `${CACHE_PREFIX}${q.toLowerCase().replace(/\s+/g, '_')}`;

const readCache = (q: string): RecTrack[] | null => {
  try {
    const raw = localStorage.getItem(cacheKey(q));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null;
    return Array.isArray(parsed.tracks) && parsed.tracks.length ? parsed.tracks : null;
  } catch {
    return null;
  }
};

const writeCache = (q: string, tracks: RecTrack[]) => {
  try {
    localStorage.setItem(cacheKey(q), JSON.stringify({ at: Date.now(), tracks }));
  } catch {
    /* quota */
  }
};

export const searchTracks = async (query: string, useCache = true): Promise<RecTrack[]> => {
  if (useCache) {
    const cached = readCache(query);
    if (cached) return cached;
  }
  try {
    const { data, error } = await supabase.functions.invoke('youtube-search', { body: { query } });
    if (error) throw error;
    const tracks = (data?.tracks || []) as RecTrack[];
    if (tracks.length) writeCache(query, tracks);
    return tracks;
  } catch (e) {
    console.error('Recommendation fetch failed:', query, e);
    return [];
  }
};

/** Builds the personalized row definitions from the user's saved preferences. */
export const buildRecommendationQueries = (prefs: UserPreferences) => {
  const lang = LANGUAGE_LABELS[prefs.preferred_language] || '';
  const genres = (prefs.favorite_genres || []).slice(0, 4);

  const rows: { key: string; title: string; subtitle: string; query: string }[] = [];

  if (genres.length) {
    rows.push({
      key: 'mixed',
      title: 'Made for you',
      subtitle: `Based on ${genres.slice(0, 3).join(', ')}`,
      query: `best ${genres.slice(0, 2).join(' and ')} songs ${lang} 2026`,
    });
    genres.forEach((g) =>
      rows.push({
        key: `genre-${g}`,
        title: `${g} picks`,
        subtitle: `Because you like ${g}`,
        query: `top ${g} songs ${lang}`,
      })
    );
  } else {
    rows.push({
      key: 'starter',
      title: 'Made for you',
      subtitle: 'Pick your favourite genres in Settings to sharpen this',
      query: `popular ${lang} songs right now`,
    });
  }

  if (lang) {
    rows.push({
      key: `lang-${prefs.preferred_language}`,
      title: `${lang} hits`,
      subtitle: 'In your preferred language',
      query: `top ${lang} songs 2026`,
    });
  }

  return rows;
};

export const fetchPersonalizedRows = async (
  prefs: UserPreferences,
  force = false
): Promise<RecommendationRow[]> => {
  const defs = buildRecommendationQueries(prefs);
  const results = await Promise.all(defs.map((d) => searchTracks(d.query, !force)));
  return defs
    .map((d, i) => ({ key: d.key, title: d.title, subtitle: d.subtitle, tracks: results[i].slice(0, 14) }))
    .filter((r) => r.tracks.length > 0);
};

/** Flat suggestion list used by Search when the query box is empty. */
export const fetchPreferenceSuggestions = async (prefs: UserPreferences): Promise<RecTrack[]> => {
  const rows = await fetchPersonalizedRows(prefs);
  const seen = new Set<string>();
  const out: RecTrack[] = [];
  const maxLen = Math.max(...rows.map((r) => r.tracks.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const row of rows) {
      const t = row.tracks[i];
      if (t?.videoId && !seen.has(t.videoId)) {
        seen.add(t.videoId);
        out.push(t);
      }
    }
  }
  return out.slice(0, 20);
};
