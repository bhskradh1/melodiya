import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, Play, Plus, Clock, Loader2, Heart, MoreVertical, ListPlus, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePreferences } from '@/contexts/PreferencesContext';
import { fetchPreferenceSuggestions, type RecTrack } from '@/lib/recommendations';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration: string;
}

interface SearchViewProps {
  onPlayTrack: (track: Track) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({ onPlayTrack }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
  const [playlists, setPlaylists] = useState<Array<{id: string, name: string}>>([]);
  const [suggestions, setSuggestions] = useState<RecTrack[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const { preferences, version } = usePreferences();

  const runSearch = React.useCallback(async (query: string, notify = false) => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: q }
      });

      if (error) throw error;

      setSearchResults(data.tracks || []);

      if (notify && data.tracks?.length === 0) {
        toast({
          title: "No results found",
          description: "Try searching with different keywords"
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      if (notify) {
        toast({
          title: "Search failed",
          description: "Unable to search for music. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchQuery, true);
  };

  // Live recommendations as you type (debounced)
  React.useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      runSearch(q);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [searchQuery, runSearch]);

  const handlePlayTrack = (track: Track) => {
    onPlayTrack(track);
    addToRecentlyPlayed(track);
  };

  const toggleLike = async (track: Track) => {
    if (!user) return;

    try {
      const isLiked = likedSongs.has(track.videoId);
      
      if (isLiked) {
        // Remove from liked songs
        const { error } = await supabase
          .from('liked_songs')
          .delete()
          .eq('user_id', user.id)
          .eq('youtube_video_id', track.videoId);

        if (error) throw error;

        setLikedSongs(prev => {
          const newSet = new Set(prev);
          newSet.delete(track.videoId);
          return newSet;
        });

        toast({
          title: "Removed from liked songs",
          description: `"${track.title}" removed from your liked songs`
        });
      } else {
        // Add to liked songs
        const { error } = await supabase
          .from('liked_songs')
          .insert({
            user_id: user.id,
            youtube_video_id: track.videoId,
            title: track.title,
            artist: track.artist,
            thumbnail_url: track.thumbnail
          });

        if (error) throw error;

        setLikedSongs(prev => new Set([...prev, track.videoId]));

        toast({
          title: "Added to liked songs",
          description: `"${track.title}" added to your liked songs`
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update liked songs",
        variant: "destructive"
      });
    }
  };

  const addToPlaylist = async (track: Track, playlistId: string) => {
    try {
      const { error } = await supabase
        .from('playlist_songs')
        .insert({
          playlist_id: playlistId,
          youtube_video_id: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail_url: track.thumbnail
        });

      if (error) throw error;

      toast({
        title: "Added to playlist",
        description: `"${track.title}" added to playlist`
      });
    } catch (error) {
      console.error('Error adding to playlist:', error);
      toast({
        title: "Error",
        description: "Failed to add song to playlist",
        variant: "destructive"
      });
    }
  };

  const addToRecentlyPlayed = async (track: Track) => {
    if (!user) return;
    
    try {
      await supabase
        .from('recently_played')
        .insert({
          user_id: user.id,
          youtube_video_id: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail_url: track.thumbnail
        });
    } catch (error) {
      console.error('Error adding to recently played:', error);
    }
  };

  const loadUserData = async () => {
    try {
      // Load liked songs
      const { data: likedData } = await supabase
        .from('liked_songs')
        .select('youtube_video_id')
        .eq('user_id', user?.id);

      if (likedData) {
        setLikedSongs(new Set(likedData.map(item => item.youtube_video_id)));
      }

      // Load playlists
      const { data: playlistData } = await supabase
        .from('playlists')
        .select('id, name')
        .eq('user_id', user?.id);

      if (playlistData) {
        setPlaylists(playlistData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  // Load user's liked songs and playlists on mount
  React.useEffect(() => {
    if (user) {
      loadUserData();
    }
  }, [user]);

  // Load personalized recommendations when the query box is empty.
  // Re-fetches whenever preferences change (version increments).
  useEffect(() => {
    if (!user) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSuggestionsLoading(true);
    fetchPreferenceSuggestions(preferences)
      .then((tracks) => {
        if (!cancelled) setSuggestions(tracks);
      })
      .catch((e) => console.error('Failed to load recommendations:', e))
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, preferences, version]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Search Header */}
      <div className="space-y-4">
        <h1 className="text-2xl md:text-3xl font-bold">Search</h1>
        
        <form onSubmit={handleSearch} className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <Input
            type="text"
            placeholder="Search for songs, artists, or albums..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-20 py-3 text-base md:text-lg bg-muted/50 border-border/50 focus:border-primary"
          />
          <Button
            type="submit"
            size="sm"
            className="absolute right-2 top-1/2 transform -translate-y-1/2"
            disabled={loading || !searchQuery.trim()}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </Button>
        </form>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg md:text-xl font-semibold">Search Results</h2>
          <div className="space-y-2">
            {searchResults.map((track, index) => (
              <Card key={track.id} className="glass-card hover-lift">
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="relative group">
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          size="sm"
                          className="h-6 w-6 md:h-8 md:w-8 p-0 rounded-full bg-primary hover:bg-primary/90"
                          onClick={() => handlePlayTrack(track)}
                        >
                          <Play className="w-3 h-3 md:w-4 md:h-4 text-primary-foreground ml-0.5" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm mb-1 truncate">{track.title}</h3>
                      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                      <div className="flex items-center gap-2 mt-1 md:mt-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{track.duration}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 md:gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 w-8 p-0 ${likedSongs.has(track.videoId) ? 'text-red-500' : 'text-muted-foreground'}`}
                        onClick={() => toggleLike(track)}
                      >
                        <Heart className={`w-3 h-3 md:w-4 md:h-4 ${likedSongs.has(track.videoId) ? 'fill-current' : ''}`} />
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {playlists.map(playlist => (
                            <DropdownMenuItem
                              key={playlist.id}
                              onClick={() => addToPlaylist(track, playlist.id)}
                            >
                              <ListPlus className="w-4 h-4 mr-2" />
                              Add to {playlist.name}
                            </DropdownMenuItem>
                          ))}
                          {playlists.length === 0 && (
                            <DropdownMenuItem disabled>
                              No playlists found
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 md:py-12">
          <div className="flex items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-muted-foreground text-sm md:text-base">Searching for music...</span>
          </div>
        </div>
      )}

      {!loading && searchResults.length === 0 && searchQuery && (
        <div className="flex flex-col items-center justify-center py-8 md:py-12 space-y-4">
          <Search className="w-12 h-12 md:w-16 md:h-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-base md:text-lg font-medium">No results found</h3>
            <p className="text-sm md:text-base text-muted-foreground">Try searching with different keywords</p>
          </div>
        </div>
      )}

      {!loading && !searchQuery && (
        <div className="flex flex-col items-center justify-center py-8 md:py-12 space-y-4">
          <Search className="w-12 h-12 md:w-16 md:h-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="text-base md:text-lg font-medium">Search for music</h3>
            <p className="text-sm md:text-base text-muted-foreground">Find songs, artists, and albums</p>
          </div>
        </div>
      )}
    </div>
  );
};