import { supabase } from '@/integrations/supabase/client';

export interface MelodiyaSearchTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration: string;
}

interface YtMusicSearchResponse {
  tracks?: unknown[];
  error?: string;
}

const SEARCH_CACHE_PREFIX = 'melodiya_verified_artist_songs_v3:';
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SEARCH_RESULTS = 20;
const inFlightSearches = new Map<string, Promise<MelodiyaSearchTrack[]>>();

const PRODUCTION_SEARCH_API =
  'https://melodiya-your-sound.vercel.app/api/ytmusic-search';

const getSearchApiUrl = (): string => {
  const configured = import.meta.env.VITE_YTMUSIC_SEARCH_API_URL?.trim();
  if (configured) return configured;

  const isLocalAppOrigin =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.protocol === 'capacitor:');

  return isLocalAppOrigin
    ? PRODUCTION_SEARCH_API
    : `${window.location.origin}/api/ytmusic-search`;
};

const normalizeTrack = (value: unknown): MelodiyaSearchTrack | null => {
  if (!value || typeof value !== 'object') return null;
  const track = value as Record<string, unknown>;
  const videoId = String(track.videoId || track.id || '').trim();
  const title = String(track.title || '').trim();
  if (!videoId || !title) return null;

  return {
    id: videoId,
    videoId,
    title,
    artist: String(track.artist || 'Unknown Artist').trim(),
    thumbnail: String(track.thumbnail || ''),
    duration: String(track.duration || 'Unknown'),
  };
};

const searchYouTubeMusic = async (query: string): Promise<MelodiyaSearchTrack[]> => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sign in to search YouTube Music');

  const response = await fetch(getSearchApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, limit: MAX_SEARCH_RESULTS }),
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as YtMusicSearchResponse;
    throw new Error(payload.error || `YouTube Music search failed (${response.status})`);
  }

  const payload = (await response.json()) as YtMusicSearchResponse;
  return Array.isArray(payload.tracks)
    ? payload.tracks.map(normalizeTrack).filter((track): track is MelodiyaSearchTrack => !!track)
    : [];
};

/**
 * Use only the YouTube Music artist/catalogue Songs feed. No fallback to
 * general YouTube video search is allowed because that can return uploads
 * from arbitrary channels, mixes and user-generated videos.
 */
const readSearchCache = (key: string): MelodiyaSearchTrack[] | null => {
  try {
    const raw = localStorage.getItem(SEARCH_CACHE_PREFIX + key);
    if (!raw) return null;
    const cached = JSON.parse(raw) as {
      savedAt?: number;
      tracks?: MelodiyaSearchTrack[];
    };
    if (!cached.savedAt || Date.now() - cached.savedAt > SEARCH_CACHE_TTL_MS) {
      localStorage.removeItem(SEARCH_CACHE_PREFIX + key);
      return null;
    }
    return Array.isArray(cached.tracks) ? cached.tracks : null;
  } catch {
    return null;
  }
};

const writeSearchCache = (key: string, tracks: MelodiyaSearchTrack[]) => {
  try {
    localStorage.setItem(
      SEARCH_CACHE_PREFIX + key,
      JSON.stringify({ savedAt: Date.now(), tracks }),
    );
  } catch {
    // Search must still work when browser storage is full or unavailable.
  }
};

/**
 * Search only the YouTube Music artist/catalogue Songs feed.
 * Results are cached locally for 15 minutes to reduce repeat API requests.
 */
export const searchMelodiyaTracks = async (
  query: string,
): Promise<MelodiyaSearchTrack[]> => {
  const normalized = query.trim().replace(/\\s+/g, ' ');
  if (!normalized) return [];

  const cacheKey = normalized.toLocaleLowerCase();
  const cached = readSearchCache(cacheKey);
  if (cached) return cached;

  const pending = inFlightSearches.get(cacheKey);
  if (pending) return pending;

  const request = searchYouTubeMusic(normalized)
    .then((tracks) => {
      writeSearchCache(cacheKey, tracks);
      return tracks;
    })
    .finally(() => {
      if (inFlightSearches.get(cacheKey) === request) {
        inFlightSearches.delete(cacheKey);
      }
    });

  inFlightSearches.set(cacheKey, request);
  return request;
};
