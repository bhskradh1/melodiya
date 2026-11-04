/**
 * Device-local offline audio library.
 *
 * Audio bytes are stored in IndexedDB. Metadata remains in localStorage so the
 * library can render quickly. This deliberately stores files supplied by the
 * user or by a source that explicitly permits downloading; YouTube video IDs
 * alone are not downloadable audio assets.
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
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

type OfflineAudioRecord = {
  videoId: string;
  blob: Blob;
  fileName: string;
  fileSize: number;
  mimeType: string;
  savedAt: string;
};

const STORAGE_KEY = 'melodiya_offline_tracks';
const STORAGE_VERSION_KEY = 'melodiya_offline_library_version';
const LIBRARY_VERSION = '2';
const ART_CACHE = 'melodiya-offline-art-v2';
const DB_NAME = 'melodiya-offline-media';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio';

export const OFFLINE_UPDATED_EVENT = 'melodiya-offline-updated';

const objectUrls = new Map<string, string>();
let databasePromise: Promise<IDBDatabase> | null = null;

const emitUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_UPDATED_EVENT));
  }
};

const ensureLibraryVersion = () => {
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) !== LIBRARY_VERSION) {
      // The previous implementation saved metadata only and falsely labelled
      // tracks as offline. Clear those entries instead of showing broken files.
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_VERSION_KEY, LIBRARY_VERSION);
    }
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
};

const openAudioDatabase = (): Promise<IDBDatabase> => {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support offline audio storage.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'videoId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline audio storage.'));
    request.onblocked = () => reject(new Error('Offline audio storage is blocked by another app tab.'));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
};

const saveAudioRecord = async (record: OfflineAudioRecord): Promise<void> => {
  const db = await openAudioDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite');
    transaction.objectStore(AUDIO_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the audio file.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving the audio file was cancelled.'));
  });
};

const readAudioRecord = async (videoId: string): Promise<OfflineAudioRecord | null> => {
  const db = await openAudioDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(AUDIO_STORE, 'readonly').objectStore(AUDIO_STORE).get(videoId);
    request.onsuccess = () => resolve((request.result as OfflineAudioRecord | undefined) ?? null);
    request.onerror = () => reject(request.error || new Error('Could not read the offline audio file.'));
  });
};

const deleteAudioRecord = async (videoId: string): Promise<void> => {
  const db = await openAudioDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite');
    transaction.objectStore(AUDIO_STORE).delete(videoId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete the offline audio file.'));
  });
};

const clearAudioRecords = async (): Promise<void> => {
  const db = await openAudioDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, 'readwrite');
    transaction.objectStore(AUDIO_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear offline audio storage.'));
  });
};

export const getOfflineTracks = (): OfflineTrack[] => {
  try {
    ensureLibraryVersion();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineTrack[]) : [];
  } catch {
    return [];
  }
};

const writeTracks = (tracks: OfflineTrack[]) => {
  ensureLibraryVersion();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
  emitUpdate();
};

export const isTrackOffline = (videoId: string): boolean =>
  getOfflineTracks().some((track) => track.videoId === videoId);

const cacheArtwork = async (url?: string) => {
  if (!url || !url.startsWith('http') || typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(ART_CACHE);
    if (await cache.match(url)) return;
    const response = await fetch(url, { mode: 'no-cors' });
    if (response.type === 'opaque' || response.ok) await cache.put(url, response);
  } catch {
    // Artwork is optional; audio storage is the important part.
  }
};

const removeArtwork = async (url?: string) => {
  if (!url || typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(ART_CACHE);
    await cache.delete(url);
  } catch {
    // ignore
  }
};

const revokeObjectUrl = (videoId: string) => {
  const url = objectUrls.get(videoId);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(videoId);
};

const isSupportedAudioFile = (file: Blob): boolean => {
  if (file.type.startsWith('audio/')) return true;
  const name = (file as File).name || '';
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(name);
};

/** Save a user-owned or otherwise downloadable audio file for one track. */
export const saveTrackOffline = async (
  track: Omit<OfflineTrack, 'savedAt' | 'fileName' | 'fileSize' | 'mimeType'>,
  audioFile: Blob,
): Promise<void> => {
  if (!track.videoId) throw new Error('This track has no video ID to associate with the audio file.');
  if (!audioFile || audioFile.size === 0) throw new Error('The selected audio file is empty.');
  if (!isSupportedAudioFile(audioFile)) throw new Error('Choose a supported audio file such as MP3, M4A, WAV, OGG or FLAC.');

  const savedAt = new Date().toISOString();
  const fileName = (audioFile as File).name || track.title + '.audio';
  const mimeType = audioFile.type || 'application/octet-stream';

  await saveAudioRecord({
    videoId: track.videoId,
    blob: audioFile,
    fileName,
    fileSize: audioFile.size,
    mimeType,
    savedAt,
  });

  const existing = getOfflineTracks().filter((item) => item.videoId !== track.videoId);
  writeTracks([{
    ...track,
    savedAt,
    fileName,
    fileSize: audioFile.size,
    mimeType,
  }, ...existing]);

  revokeObjectUrl(track.videoId);
  await cacheArtwork(track.thumbnail);
};

export const savePlaylistOffline = async (
  entries: Array<{
    track: Omit<OfflineTrack, 'savedAt' | 'fileName' | 'fileSize' | 'mimeType'>;
    audioFile: Blob;
  }>,
): Promise<number> => {
  let saved = 0;
  for (const entry of entries) {
    await saveTrackOffline(entry.track, entry.audioFile);
    saved += 1;
  }
  return saved;
};

/** Return the stored bytes for in-app playback. */
export const getOfflineAudioBlob = async (videoId: string): Promise<Blob | null> => {
  const record = await readAudioRecord(videoId);
  return record?.blob ?? null;
};

/** Return a stable object URL for the current app session. */
export const getOfflineAudioObjectUrl = async (videoId: string): Promise<string | null> => {
  const existing = objectUrls.get(videoId);
  if (existing) return existing;

  const blob = await getOfflineAudioBlob(videoId);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  objectUrls.set(videoId, url);
  return url;
};

export const hasOfflineAudio = async (videoId: string): Promise<boolean> =>
  Boolean(await readAudioRecord(videoId));

export const removeTrackOffline = async (videoId: string): Promise<void> => {
  const tracks = getOfflineTracks();
  const target = tracks.find((track) => track.videoId === videoId);
  await deleteAudioRecord(videoId);
  revokeObjectUrl(videoId);
  if (target) await removeArtwork(target.thumbnail);
  writeTracks(tracks.filter((track) => track.videoId !== videoId));
};

export const removePlaylistOffline = async (playlistId: string): Promise<void> => {
  const tracks = getOfflineTracks();
  const remove = tracks.filter((track) => track.playlistId === playlistId);
  await Promise.all(remove.map(async (track) => {
    await deleteAudioRecord(track.videoId);
    revokeObjectUrl(track.videoId);
    await removeArtwork(track.thumbnail);
  }));
  writeTracks(tracks.filter((track) => track.playlistId !== playlistId));
};

export const clearOfflineLibrary = async (): Promise<void> => {
  await clearAudioRecords();
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls.clear();
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(ART_CACHE);
    } catch {
      // ignore
    }
  }
  writeTracks([]);
};
