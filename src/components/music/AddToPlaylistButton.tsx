import React, { useEffect, useState } from 'react';
import { Check, ListMusic, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface TrackToSave {
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface PlaylistOption {
  id: string;
  name: string;
  song_count: number;
}

interface AddToPlaylistButtonProps {
  track: TrackToSave;
  compact?: boolean;
}

export const AddToPlaylistButton: React.FC<AddToPlaylistButtonProps> = ({ track, compact = true }) => {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    if (!user) {
      toast({ title: 'Sign in to save songs', description: 'Your playlists are linked to your account.' });
      setOpen(false);
      return;
    }

    let cancelled = false;
    const loadPlaylists = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('playlists')
        .select('id, name, playlist_songs(count)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) {
        toast({ title: 'Could not load playlists', description: error.message, variant: 'destructive' });
      } else {
        setPlaylists((data || []).map((playlist: any) => ({
          id: playlist.id,
          name: playlist.name,
          song_count: playlist.playlist_songs?.[0]?.count || 0,
        })));
        setSavedIds([]);
      }
      setLoading(false);
    };

    loadPlaylists();
    return () => { cancelled = true; };
  }, [open, user, toast]);

  const addToPlaylist = async (playlist: PlaylistOption) => {
    if (!user || savingId) return;
    setSavingId(playlist.id);
    try {
      const { data: existing, error: lookupError } = await supabase
        .from('playlist_songs')
        .select('id')
        .eq('playlist_id', playlist.id)
        .eq('youtube_video_id', track.videoId)
        .limit(1)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (existing) {
        setSavedIds(prev => [...prev, playlist.id]);
        toast({ title: 'Already in playlist', description: `“${track.title}” is already in ${playlist.name}.` });
        return;
      }

      const { error } = await supabase.from('playlist_songs').insert({
        playlist_id: playlist.id,
        youtube_video_id: track.videoId,
        title: track.title,
        artist: track.artist || 'Unknown Artist',
        thumbnail_url: track.thumbnail,
      });
      if (error) throw error;

      setSavedIds(prev => [...prev, playlist.id]);
      setPlaylists(prev => prev.map(item => item.id === playlist.id
        ? { ...item, song_count: item.song_count + 1 }
        : item));
      toast({ title: 'Added to playlist', description: `“${track.title}” added to ${playlist.name}.` });
    } catch (error) {
      console.error('Unable to add song to playlist:', error);
      toast({
        title: 'Could not add song',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Add song to playlist"
          title="Add to playlist"
          onClick={(event) => event.stopPropagation()}
          className={compact
            ? 'h-9 w-9 p-0 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/10'
            : 'h-10 gap-2 rounded-full border border-foreground/15 bg-foreground/[0.06] px-4 hover:bg-foreground/10'}
        >
          <Plus className="h-4 w-4" />
          {!compact && <span className="text-sm">Add to playlist</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-panel max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-foreground/80" />
            Add to playlist
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.04] p-3">
          <img src={track.thumbnail || '/placeholder.svg'} alt="" className="h-12 w-12 rounded-lg object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
          </div>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading playlists…
            </div>
          ) : playlists.length === 0 ? (
            <div className="py-8 text-center">
              <ListMusic className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">No playlists yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create a playlist first, then add this song.</p>
            </div>
          ) : playlists.map(playlist => (
            <button
              key={playlist.id}
              type="button"
              disabled={savingId !== null || savedIds.includes(playlist.id)}
              onClick={() => addToPlaylist(playlist)}
              className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-foreground/10 hover:bg-foreground/[0.06] disabled:cursor-default disabled:opacity-70"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.08] text-foreground/80">
                <ListMusic className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{playlist.name}</span>
                <span className="block text-xs text-muted-foreground">{playlist.song_count} songs</span>
              </span>
              {savingId === playlist.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : savedIds.includes(playlist.id)
                  ? <Check className="h-4 w-4 text-emerald-400" />
                  : <Plus className="h-4 w-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
