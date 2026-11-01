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
    body: JSON.stringify({ query, limit: 25 }),
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
export const searchMelodiyaTracks = async (
  query: string,
): Promise<MelodiyaSearchTrack[]> => {
  const normalized = query.trim();
  if (!normalized) return [];
  return searchYouTubeMusic(normalized);
};
