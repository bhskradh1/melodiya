import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, Play, Plus, Clock, Loader2, Heart, MoreVertical, ListPlus, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { searchMelodiyaTracks } from '@/lib/musicSearch';
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
  initialQuery?: string;
}

export const SearchView: React.FC<SearchViewProps> = ({ onPlayTrack, initialQuery = '' }) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [visibleSearchResultsCount, setVisibleSearchResultsCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
  const [playlists, setPlaylists] = useState<Array<{id: string, name: string}>>([]);
  const [suggestions, setSuggestions] = useState<RecTrack[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const searchInFlightRef = React.useRef(false);
  const lastSubmittedRef = React.useRef<{ query: string; at: number } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { preferences, version } = usePreferences();
  const visibleSearchResults = searchResults.slice(0, visibleSearchResultsCount);

  const runSearch = React.useCallback(async (query: string, notify = false) => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setVisibleSearchResultsCount(5);
      return;
    }

    // Coalesce rapid duplicate submissions (including double taps) for the same query.
    const normalizedQuery = q.toLowerCase().replace(/\\s+/g, ' ');
    const last = lastSubmittedRef.current;
    if (searchInFlightRef.current) return;
    if (last?.query === normalizedQuery && Date.now() - last.at < 5000) return;
    lastSubmittedRef.current = { query: normalizedQuery, at: Date.now() };
    searchInFlightRef.current = true;
    setLoading(true);
    try {
      const tracks = await searchMelodiyaTracks(q);
      setSearchResults(tracks);
      setVisibleSearchResultsCount(5);

      if (notify && tracks.length === 0) {
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
      searchInFlightRef.current = false;
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const nextQuery = initialQuery.trim();
    if (!nextQuery) return;
    setSearchQuery(nextQuery);
    void runSearch(nextQuery);
  }, [initialQuery, runSearch]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runSearch(searchQuery, true);
  };

  // Typing only edits the query. YouTube is called only on form submission.

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
    // Recommendation cards may use results already cached on this device,
    // but opening Search must not spend YouTube API quota.
    fetchPreferenceSuggestions(preferences, false)
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

  const quickGenres = ['All', ...Array.from(new Set((preferences.favorite_genres || []).slice(0, 6)))];
  const visibleTracks = searchResults.slice(0, visibleSearchResultsCount);

  return (
    <div className="min-h-full space-y-8 pb-32">
      <div className="mb-7">
        <p className="sonora-eyebrow">Explore Sonora</p>
        <h1 className="mt-2 font-[Manrope] text-3xl font-medium tracking-[-.05em] text-zinc-100 md:text-4xl">Find your next frequency.</h1>
        <p className="mt-3 text-xs leading-5 text-zinc-500">Search the catalog, discover an artist, or return to a favorite.</p>
      </div>

      <form onSubmit={handleSearch} className="search-spotlight search-spotlight-large flex w-full max-w-3xl items-center lg:hidden">
        <span className="search-lens"><Search className="h-[18px] w-[18px]" /></span>
        <Input
          autoFocus={false}
          type="text"
          aria-label="Search music"
          placeholder="Artist, track or album…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="border-0 bg-transparent px-3 text-sm text-zinc-100 shadow-none placeholder:text-zinc-600 focus-visible:ring-0"
        />
        {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search" className="search-clear"><span className="text-sm">×</span></button>}
        <button type="submit" disabled={loading || !searchQuery.trim()} className="mr-1 rounded-full bg-zinc-100 px-4 py-2.5 text-[10px] font-semibold text-zinc-950 disabled:opacity-40">Find</button>
      </form>

      {!searchQuery && (
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div><p className="sonora-eyebrow">Start somewhere</p><h2 className="mt-1 font-[Manrope] text-xl font-medium text-zinc-200">Made for your taste</h2></div>
            <span className="text-[9px] uppercase tracking-[.16em] text-zinc-600">Your picks</span>
          </div>
          {suggestionsLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({length:4}).map((_,index)=><div key={index} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><div className="aspect-square animate-pulse rounded-xl bg-white/[.05]"/><div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-white/[.05]"/><div className="mt-2 h-2 w-1/2 animate-pulse rounded bg-white/[.035]"/></div>)}
            </div>
          ) : suggestions.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {suggestions.map((track) => (
                <Card key={track.videoId} className="group overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.025] shadow-none transition hover:-translate-y-0.5 hover:border-white/[.16] hover:bg-white/[.045]">
                  <CardContent className="p-3">
                    <button type="button" onClick={() => handlePlayTrack(track as unknown as Track)} className="cover relative block aspect-square w-full rounded-xl" aria-label={`Play ${track.title}`}>
                      <img src={track.thumbnail || '/placeholder.svg'} alt={track.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"/>
                      <span className="cover-shine"/>
                      <span className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-950 opacity-0 shadow-xl transition group-hover:opacity-100"><Play className="ml-0.5 h-4 w-4 fill-current"/></span>
                    </button>
                    <div className="mt-3 flex items-start gap-2">
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-zinc-200">{track.title}</p><p className="mt-1 truncate text-[10px] text-zinc-500">{track.artist}</p></div>
                      <Button type="button" variant="ghost" size="icon" aria-label={likedSongs.has(track.videoId) ? 'Unlike song' : 'Like song'} className={`h-7 w-7 shrink-0 rounded-full ${likedSongs.has(track.videoId) ? 'text-lime-200' : 'text-zinc-600'}`} onClick={() => toggleLike(track as unknown as Track)}><Heart className={`h-3.5 w-3.5 ${likedSongs.has(track.videoId) ? 'fill-current' : ''}`}/></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[.08] bg-white/[.025] px-5 py-8 text-center">
              <Sparkles className="mx-auto h-5 w-5 text-zinc-500"/>
              <p className="mt-3 text-xs font-medium text-zinc-300">Your discovery mix is warming up</p>
              <p className="mt-1 text-[10px] text-zinc-600">Choose favorite genres in Settings or search for an artist you love.</p>
            </div>
          )}
        </section>
      )}

      {searchResults.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div><p className="sonora-eyebrow">The catalogue</p><h2 className="mt-1 font-[Manrope] text-xl font-medium text-zinc-200">Search results</h2><p className="mt-1 text-[10px] text-zinc-600">Showing {visibleTracks.length} of {searchResults.length} tracks</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleTracks.map((track) => (
              <Card key={track.id} className="group overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.025] shadow-none transition hover:-translate-y-0.5 hover:border-white/[.16] hover:bg-white/[.045]">
                <CardContent className="p-3">
                  <button type="button" onClick={() => handlePlayTrack(track)} className="cover relative block aspect-square w-full rounded-xl" aria-label={`Play ${track.title}`}>
                    <img src={track.thumbnail || '/placeholder.svg'} alt={track.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"/>
                    <span className="cover-shine"/>
                    <span className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-zinc-100 text-zinc-950 opacity-0 shadow-xl transition group-hover:opacity-100"><Play className="ml-0.5 h-4 w-4 fill-current"/></span>
                  </button>
                  <div className="mt-3 flex items-start gap-2">
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-zinc-200">{track.title}</p><p className="mt-1 truncate text-[10px] text-zinc-500">{track.artist}</p><p className="mt-2 text-[9px] text-zinc-600">{track.duration}</p></div>
                    <div className="flex shrink-0 flex-col">
                      <Button type="button" variant="ghost" size="icon" aria-label={likedSongs.has(track.videoId) ? 'Unlike song' : 'Like song'} className={`h-7 w-7 rounded-full ${likedSongs.has(track.videoId) ? 'text-lime-200' : 'text-zinc-600'}`} onClick={() => toggleLike(track)}><Heart className={`h-3.5 w-3.5 ${likedSongs.has(track.videoId) ? 'fill-current' : ''}`}/></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Add to playlist" className="h-7 w-7 rounded-full text-zinc-600 hover:text-zinc-100"><MoreVertical className="h-3.5 w-3.5"/></Button></DropdownMenuTrigger>
                        <DropdownMenuContent className="border-white/10 bg-zinc-950 text-zinc-200">
                          {playlists.map((playlist) => <DropdownMenuItem key={playlist.id} onClick={() => addToPlaylist(track, playlist.id)} className="text-xs focus:bg-white/[.08] focus:text-white"><ListPlus className="mr-2 h-3.5 w-3.5"/>Add to {playlist.name}</DropdownMenuItem>)}
                          {playlists.length === 0 && <DropdownMenuItem disabled className="text-xs">No playlists found</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {visibleTracks.length < searchResults.length && (
            <div className="flex justify-center pt-2"><Button type="button" variant="outline" onClick={() => setVisibleSearchResultsCount((current) => Math.min(current + 5, searchResults.length))} className="rounded-full border-white/10 bg-white/[.025] text-xs text-zinc-300 hover:bg-white/[.08]">Show {Math.min(5, searchResults.length - visibleTracks.length)} more</Button></div>
          )}
        </section>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-10 text-xs text-zinc-500"><Loader2 className="h-4 w-4 animate-spin text-zinc-300"/> Finding your next track…</div>
      )}

      {!loading && searchQuery && searchResults.length === 0 && (
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] px-6 py-12 text-center">
          <Search className="mx-auto h-7 w-7 text-zinc-600"/>
          <h3 className="mt-4 font-[Manrope] text-lg text-zinc-200">No matching records</h3>
          <p className="mt-2 text-xs text-zinc-500">Try another artist, track or album.</p>
        </div>
      )}

      {!loading && !searchQuery && !user && (
        <div className="rounded-2xl border border-white/[.08] bg-white/[.025] px-6 py-12 text-center"><Search className="mx-auto h-7 w-7 text-zinc-600"/><p className="mt-3 text-xs text-zinc-300">Search the Sonora catalogue</p><p className="mt-1 text-[10px] text-zinc-600">Find songs, singers and albums.</p></div>
      )}
    </div>
  );
};