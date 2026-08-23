import { useCallback, useEffect, useState } from 'react';
import {
  OFFLINE_UPDATED_EVENT,
  OfflineTrack,
  clearOfflineLibrary,
  getOfflineTracks,
  removePlaylistOffline,
  removeTrackOffline,
  savePlaylistOffline,
  saveTrackOffline,
} from '@/lib/offlineLibrary';

export const useOfflineLibrary = () => {
  const [tracks, setTracks] = useState<OfflineTrack[]>(() => getOfflineTracks());

  useEffect(() => {
    const sync = () => setTracks(getOfflineTracks());
    window.addEventListener(OFFLINE_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(OFFLINE_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const isSaved = useCallback(
    (videoId: string) => tracks.some((t) => t.videoId === videoId),
    [tracks]
  );

  return {
    tracks,
    isSaved,
    saveTrack: saveTrackOffline,
    removeTrack: removeTrackOffline,
    savePlaylist: savePlaylistOffline,
    removePlaylist: removePlaylistOffline,
    clearAll: clearOfflineLibrary,
  };
};
