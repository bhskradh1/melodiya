import React, { useEffect, useState } from 'react';
import { Heart, ListMusic, Share2, Clock, Play, HardDrive } from 'lucide-react';
import { getOfflineTracks, OFFLINE_UPDATED_EVENT, type OfflineTrack } from '@/lib/offlineLibrary';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface LibraryViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onViewChange: (view: string) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onPlayTrack, onViewChange }) => {
  const { user } = useAuth();
  const [counts, setCounts] = useState<{ liked: number | null; playlists: number | null; recent: number | null }>({
    liked: null,
    playlists: null,
    recent: null,
  });
  const [recent, setRecent] = useState<Track[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<OfflineTrack[]>(() => getOfflineTracks());

  useEffect(() => {
    const syncOffline = () => setOfflineTracks(getOfflineTracks());
    window.addEventListener(OFFLINE_UPDATED_EVENT, syncOffline);
    window.addEventListener('storage', syncOffline);
    return () => {
      window.removeEventListener(OFFLINE_UPDATED_EVENT, syncOffline);
      window.removeEventListener('storage', syncOffline);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const count = async (table: 'liked_songs' | 'playlists' | 'recently_played') => {
      const { count: n } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      return n ?? 0;
    };

    Promise.all([count('liked_songs'), count('playlists'), count('recently_played')])
      .then(([liked, playlists, recentCount]) => {
        if (!cancelled) setCounts({ liked, playlists, recent: recentCount });
      })
      .catch((e) => console.error('Library counts failed:', e));

    supabase
      .from('recently_played')
      .select('*')
      .eq('user_id', user.id)
      .order('played_at', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (cancelled) return;
        setRecent(
          (data ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            artist: item.artist || 'Unknown Artist',
            thumbnail: item.thumbnail_url || '/placeholder.svg',
            videoId: item.youtube_video_id,
          }))
        );
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const plural = (n: number | null, one: string, many: string) => (n === null ? '…' : `${n} ${n === 1 ? one : many}`);
  const offlineGroups = offlineTracks.reduce<Record<string, { name: string; tracks: Track[] }>>((groups, track) => {
    const key = track.playlistId || 'saved-tracks';
    if (!groups[key]) groups[key] = { name: track.playlistName || 'Saved tracks', tracks: [] };
    groups[key].tracks.push({ id: track.id, title: track.title, artist: track.artist, thumbnail: track.thumbnail, videoId: track.videoId });
    return groups;
  }, {});

  const tiles = [
    { view: 'liked', label: 'Liked Songs', meta: plural(counts.liked, 'track', 'tracks'), Icon: Heart },
    { view: 'playlists', label: 'Playlists', meta: plural(counts.playlists, 'collection', 'collections'), Icon: ListMusic },
    { view: 'shared-playlists', label: 'Shared with Me', meta: 'From your circle', Icon: Share2 },
    { view: 'recently-played', label: 'History', meta: plural(counts.recent, 'recent play', 'recent plays'), Icon: Clock },
  ];

  return (
    <div className="mx-auto max-w-[92rem] px-5 pb-32 pt-5 md:px-10 md:pt-8">
      <div className="mb-7">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-muted-foreground">Your collection</p>
        <h1 className="text-3xl md:text-4xl font-medium tracking-[-.045em] text-zinc-100">Library</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Everything you have saved, organized around the way you listen.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {tiles.map(({ view, label, meta, Icon }) => (
          <button
            key={view}
            type="button"
            onClick={() => onViewChange(view)}
            className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] p-5 text-left transition-colors hover:bg-foreground/[0.05]"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-foreground/5 text-zinc-300">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </span>
            <strong className="mt-6 block text-sm text-zinc-200">{label}</strong>
            <small className="mt-1 block text-xs text-zinc-600">{meta}</small>
          </button>
        ))}
      </div>

      {offlineTracks.length > 0 && (
        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground/70">Stored on this device</p>
              <h2 className="mt-1 text-xl font-medium text-zinc-200">Offline playlists</h2>
              <p className="mt-1 text-xs text-muted-foreground">These audio files can play without an internet connection.</p>
            </div>
            <span className="text-xs text-muted-foreground">{offlineTracks.length} tracks</span>
          </div>
          <div className="space-y-3">
            {Object.entries(offlineGroups).map(([groupId, group]) => (
              <div key={groupId} className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.025] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/5 text-zinc-300"><HardDrive className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-medium text-zinc-200">{group.name}</strong>
                    <small className="text-xs text-muted-foreground">{group.tracks.length} locally stored {group.tracks.length === 1 ? 'track' : 'tracks'}</small>
                  </div>
                  <button type="button" onClick={() => onPlayTrack(group.tracks[0], group.tracks)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition-opacity hover:opacity-85">
                    <Play className="h-3.5 w-3.5 fill-current" /> Play offline
                  </button>
                </div>
                <div className="mt-3 divide-y divide-foreground/[0.06]">
                  {group.tracks.map((track) => (
                    <button key={track.videoId} type="button" onClick={() => onPlayTrack(track, group.tracks)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-foreground/[0.03]">
                      <img src={track.thumbnail} alt="" loading="lazy" className="size-9 rounded-lg object-cover" />
                      <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium text-zinc-200">{track.title}</strong><small className="block truncate text-[11px] text-muted-foreground">{track.artist}</small></span>
                      <Play className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="mt-10">
          <p className="text-[10px] uppercase tracking-[.2em] text-muted-foreground/70">Jump back in</p>
          <h2 className="mb-5 mt-1 text-xl font-medium text-zinc-200">Recently played</h2>
          <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]">
            {recent.map((track, index) => (
              <button
                key={track.id}
                type="button"
                onClick={() => onPlayTrack(track, recent)}
                className="group grid w-full grid-cols-[1.75rem_3rem_minmax(0,1fr)_2rem] items-center gap-3 border-b border-foreground/[0.06] px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-foreground/[0.04] md:px-4"
              >
                <span className="text-[10px] text-zinc-600">{String(index + 1).padStart(2, '0')}</span>
                <img src={track.thumbnail} alt="" loading="lazy" className="size-11 rounded-lg border border-foreground/[0.09] object-cover grayscale-[.3]" />
                <span className="min-w-0">
                  <strong className="block truncate text-sm font-medium text-zinc-200">{track.title}</strong>
                  <small className="mt-0.5 block truncate text-xs text-muted-foreground">{track.artist}</small>
                </span>
                <Play className="h-4 w-4 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
