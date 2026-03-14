import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, ArrowLeft, Music, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface PlaylistSong {
  id: string;
  playlist_id: string;
  youtube_video_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  added_at: string;
}

interface Playlist {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  cover_image_url: string;
  created_at: string;
}

interface PlaylistDetailViewProps {
  playlistId: string;
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onBack: () => void;
}

export const PlaylistDetailView: React.FC<PlaylistDetailViewProps> = ({ 
  playlistId, 
  onPlayTrack, 
  onBack 
}) => {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (playlistId) {
      fetchPlaylistDetails();
    }
  }, [playlistId]);

  const fetchPlaylistDetails = async () => {
    try {
      // Fetch playlist info
      const { data: playlistData, error: playlistError } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .single();

      if (playlistError) throw playlistError;
      setPlaylist(playlistData);

      // Fetch playlist songs
      const { data: songsData, error: songsError } = await supabase
        .from('playlist_songs')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('added_at', { ascending: true });

      if (songsError) throw songsError;
      setSongs(songsData || []);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
      toast({
        title: "Error",
        description: "Failed to load playlist",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const playSong = (song: PlaylistSong) => {
    // Convert all songs to tracks and pass as playlist, starting from clicked song
    const tracks = songs.map(s => ({
      id: s.id,
      title: s.title,
      artist: s.artist || 'Unknown Artist',
      thumbnail: s.thumbnail_url || '/placeholder.svg',
      videoId: s.youtube_video_id
    }));
    const clickedTrack = tracks.find(t => t.id === song.id) || tracks[0];
    onPlayTrack(clickedTrack, tracks);
  };

  const removeSongFromPlaylist = async (songId: string, songTitle: string) => {
    try {
      const { error } = await supabase
        .from('playlist_songs')
        .delete()
        .eq('id', songId);

      if (error) throw error;

      setSongs(prev => prev.filter(song => song.id !== songId));
      toast({
        title: "Removed",
        description: `"${songTitle}" removed from playlist`
      });
    } catch (error) {
      console.error('Error removing song from playlist:', error);
      toast({
        title: "Error",
        description: "Failed to remove song",
        variant: "destructive"
      });
    }
  };

  const playAllSongs = () => {
    if (songs.length > 0) {
      // Convert PlaylistSong[] to Track[]
      const tracks = songs.map(song => ({
        id: song.id,
        title: song.title,
        artist: song.artist || 'Unknown Artist',
        thumbnail: song.thumbnail_url || '/placeholder.svg',
        videoId: song.youtube_video_id
      }));
      // Play all songs by passing the playlist and starting from the first
      onPlayTrack(tracks[0], tracks);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading playlist...</p>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Playlist not found</h2>
          <p className="text-muted-foreground">The playlist you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Playlist Info */}
      <div className="flex items-start gap-6">
        <div className="relative w-48 h-48 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg flex items-center justify-center">
          {playlist.cover_image_url ? (
            <img
              src={playlist.cover_image_url}
              alt={playlist.name}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            <Music className="w-16 h-16 text-muted-foreground" />
          )}
        </div>
        
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">{playlist.name}</h1>
            {playlist.description && (
              <p className="text-muted-foreground mb-4">{playlist.description}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {songs.length} song{songs.length !== 1 ? 's' : ''} • Created {new Date(playlist.created_at).toLocaleDateString()}
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button 
              onClick={playAllSongs}
              disabled={songs.length === 0}
              className="bg-gradient-primary hover:opacity-90"
            >
              <Play className="w-4 h-4 mr-2" />
              Play All
            </Button>
            <Button variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Add Songs
            </Button>
          </div>
        </div>
      </div>

      {/* Songs List */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Songs</h2>
        
        {songs.length > 0 ? (
          <div className="space-y-2">
            {songs.map((song, index) => (
              <Card key={song.id} className="glass-card hover-lift">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-8 text-center text-muted-foreground text-sm">
                      {index + 1}
                    </div>
                    
                    <div className="relative group">
                      <img
                        src={song.thumbnail_url || '/placeholder.svg'}
                        alt={song.title}
                        className="w-12 h-12 rounded object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          size="sm"
                          className="h-6 w-6 p-0 rounded-full bg-primary hover:bg-primary/90"
                          onClick={() => playSong(song)}
                        >
                          <Play className="w-3 h-3 text-primary-foreground ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm mb-1 truncate">{song.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-primary/20 hover:text-primary"
                        onClick={() => playSong(song)}
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => removeSongFromPlaylist(song.id, song.title)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Music className="w-16 h-16 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-medium">No songs in this playlist</h3>
              <p className="text-muted-foreground">Add some songs to get started</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
