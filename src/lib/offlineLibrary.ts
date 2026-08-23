/**
 * Offline library
 *
 * Songs stream from YouTube, so the audio file itself can never be stored.
 * What we can do is make the *library* work offline: track metadata is kept in
 * localStorage and the artwork is stored in the Cache Storage API, so saved
 * songs and playlists browse fine with no connection (playback still needs one).
 */

export interface OfflineTrack {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
  savedAt: string;
  playlistId?: string;
  playlistName?: string;
}

const STORAGE_KEY = 'melodiya_offline_tracks';
const ART_CACHE = 'melodiya-offline-art';

export const OFFLINE_UPDATED_EVENT = 'melodiya-offline-updated';

const emitUpdate = () => {
  window.dispatchEvent(new CustomEvent(OFFLINE_UPDATED_EVENT));
};

export const getOfflineTracks = (): OfflineTrack[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineTrack[]) : [];
  } catch {
    return [];
  }
};

const writeTracks = (tracks: OfflineTrack[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
  emitUpdate();
};

export const isTrackOffline = (videoId: string): boolean =>
  getOfflineTracks().some((t) => t.videoId === videoId);

const cacheArtwork = async (url?: string) => {
  if (!url || !url.startsWith('http') || !('caches' in window)) return;
  try {
    const cache = await caches.open(ART_CACHE);
    const existing = await cache.match(url);
    if (existing) return;
    const response = await fetch(url, { mode: 'no-cors' });
    await cache.put(url, response);
  } catch {
    // Artwork caching is best-effort only.
  }
};

const removeArtwork = async (url?: string) => {
  if (!url || !('caches' in window)) return;
  try {
    const cache = await caches.open(ART_CACHE);
    await cache.delete(url);
  } catch {
    // ignore
  }
};

export const saveTrackOffline = async (
  track: Omit<OfflineTrack, 'savedAt'>
): Promise<void> => {
  const tracks = getOfflineTracks();
  if (tracks.some((t) => t.videoId === track.videoId)) return;
  await cacheArtwork(track.thumbnail);
  writeTracks([{ ...track, savedAt: new Date().toISOString() }, ...tracks]);
};

export const removeTrackOffline = async (videoId: string): Promise<void> => {
  const tracks = getOfflineTracks();
  const target = tracks.find((t) => t.videoId === videoId);
  if (target) await removeArtwork(target.thumbnail);
  writeTracks(tracks.filter((t) => t.videoId !== videoId));
};

export const savePlaylistOffline = async (
  tracks: Omit<OfflineTrack, 'savedAt'>[]
): Promise<number> => {
  let added = 0;
  for (const track of tracks) {
    if (!isTrackOffline(track.videoId)) {
      await saveTrackOffline(track);
      added += 1;
    }
  }
  return added;
};

export const removePlaylistOffline = async (playlistId: string): Promise<void> => {
  const tracks = getOfflineTracks();
  const remove = tracks.filter((t) => t.playlistId === playlistId);
  await Promise.all(remove.map((t) => removeArtwork(t.thumbnail)));
  writeTracks(tracks.filter((t) => t.playlistId !== playlistId));
};

export const clearOfflineLibrary = async (): Promise<void> => {
  if ('caches' in window) {
    try {
      await caches.delete(ART_CACHE);
    } catch {
      // ignore
    }
  }
  writeTracks([]);
};
