import React, { useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { MusicPlayer } from './MusicPlayer';
import { HomeView } from './HomeView';
import { SearchView } from './SearchView';
import { LikedSongsView } from './LikedSongsView';
import { PlaylistsView } from './PlaylistsView';
import { SharedPlaylistsView } from './SharedPlaylistsView';
import { PlaylistDetailView } from './PlaylistDetailView';
import { RecentlyPlayedView } from './RecentlyPlayedView';
import { TrendingView } from './TrendingView';
import { SettingsView } from './SettingsView';
import { FriendsView } from './FriendsView';
import { KaraokeView } from './KaraokeView';
import { AdminView } from '../admin/AdminView';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Menu, X, Home, Search, TrendingUp, Library } from 'lucide-react';
import { usePreferences, LANGUAGE_LABELS } from '@/contexts/PreferencesContext';
import { toast } from 'sonner';

const bottomNavItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'library', label: 'Library', icon: Library },
];


interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
  audioUrl?: string;
  audio_url?: string;
}

export const MelodiyaApp: React.FC = () => {
  const [activeView, setActiveView] = useState('home');
  const historyInitializedRef = useRef(false);
  const lastRootBackAtRef = useRef(0);
  const mobileSidebarOpenRef = useRef(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const mainRef = useRef<HTMLDivElement>(null);

  // Keep a real browser-history entry for each in-app screen. Installed
  // Android PWAs use this stack for the system Back gesture/button.
  const navigateToView = (view: string, playlistId: string | null = null) => {
    const currentState = window.history.state as {
      __melodiyaAppNavigation?: boolean;
      __melodiyaSidebarOverlay?: boolean;
      activeView?: string;
      selectedPlaylistId?: string | null;
      depth?: number;
    } | null;

    const isClosingSidebar = mobileSidebarOpenRef.current && currentState?.__melodiyaSidebarOverlay;
    if (!isClosingSidebar &&
        currentState?.__melodiyaAppNavigation &&
        currentState.activeView === view &&
        (currentState.selectedPlaylistId ?? null) === playlistId) {
      return;
    }

    const nextState = {
      __melodiyaAppNavigation: true,
      depth: Number(currentState?.depth ?? 0) + 1,
      activeView: view,
      selectedPlaylistId: playlistId,
    };

    // Choosing an item in the open drawer replaces its temporary overlay
    // entry, so Back returns to the screen that opened the drawer.
    if (isClosingSidebar) {
      window.history.replaceState(nextState, '', window.location.href);
      mobileSidebarOpenRef.current = false;
      setIsMobileSidebarOpen(false);
    } else {
      window.history.pushState(nextState, '', window.location.href);
    }

    lastRootBackAtRef.current = 0;
    setSelectedPlaylistId(playlistId);
    setActiveView(view);
  };

  const openMobileSidebar = () => {
    if (mobileSidebarOpenRef.current) return;

    const currentState = window.history.state as Record<string, unknown> | null;
    const baseState = currentState ?? {
      __melodiyaAppNavigation: true,
      depth: 0,
      activeView,
      selectedPlaylistId,
    };

    window.history.pushState(
      { ...baseState, __melodiyaSidebarOverlay: true },
      '',
      window.location.href,
    );
    mobileSidebarOpenRef.current = true;
    setIsMobileSidebarOpen(true);
  };

  const closeMobileSidebar = () => {
    const currentState = window.history.state as { __melodiyaSidebarOverlay?: boolean } | null;
    if (mobileSidebarOpenRef.current && currentState?.__melodiyaSidebarOverlay) {
      // The popstate handler closes the drawer without changing the screen.
      window.history.back();
      return;
    }

    mobileSidebarOpenRef.current = false;
    setIsMobileSidebarOpen(false);
  };

  useEffect(() => {
    const rootState = {
      __melodiyaAppNavigation: true,
      __melodiyaRoot: true,
      depth: 0,
      activeView: 'home',
      selectedPlaylistId: null,
    };
    const exitGuardState = {
      __melodiyaAppNavigation: true,
      __melodiyaExitGuard: true,
      depth: 0,
      activeView: 'home',
      selectedPlaylistId: null,
    };

    // React StrictMode may re-run effects in development; initialize the
    // history stack once but always attach the listener for the current mount.
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      window.history.replaceState(rootState, '', window.location.href);
      window.history.pushState(exitGuardState, '', window.location.href);
    }

    const handlePopState = (event: PopStateEvent) => {
      // Android Back should dismiss the mobile drawer before navigating away.
      if (mobileSidebarOpenRef.current) {
        mobileSidebarOpenRef.current = false;
        setIsMobileSidebarOpen(false);
        return;
      }

      const state = event.state as {
        __melodiyaAppNavigation?: boolean;
        __melodiyaRoot?: boolean;
        activeView?: string;
        selectedPlaylistId?: string | null;
      } | null;

      if (state?.__melodiyaAppNavigation && state.__melodiyaRoot) {
        const now = Date.now();
        if (now - lastRootBackAtRef.current <= 2000) {
          // We are already back on the root entry. Move back once more so
          // Android/the browser can close the standalone PWA when supported.
          lastRootBackAtRef.current = 0;
          window.history.back();
          return;
        }

        lastRootBackAtRef.current = now;
        toast('Press back again to exit Melodiya');
        window.history.pushState(exitGuardState, '', window.location.href);
        return;
      }

      if (state?.__melodiyaAppNavigation) {
        lastRootBackAtRef.current = 0;
        setSelectedPlaylistId(state.selectedPlaylistId ?? null);
        setActiveView(state.activeView ?? 'home');
        return;
      }

      // Recover safely if the browser reports an unexpected/null history state.
      const now = Date.now();
      if (now - lastRootBackAtRef.current <= 2000) {
        lastRootBackAtRef.current = 0;
        window.history.back();
        return;
      }

      lastRootBackAtRef.current = now;
      setSelectedPlaylistId(null);
      setActiveView('home');
      toast('Press back again to exit Melodiya');
      window.history.pushState(exitGuardState, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Always land at the top of a view when switching sections
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeView]);

  // Accept optional playlist argument
  const handlePlayTrack = async (track: Track, newPlaylist?: Track[]) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
      setIsPlaylistMode(true);
      const clickedIndex = newPlaylist.findIndex(t => t.id === track.id);
      setCurrentIndex(clickedIndex >= 0 ? clickedIndex : 0);
    } else {
      // Add to playlist if not already there
      if (!playlist.find(t => t.id === track.id)) {
        const newIndex = playlist.length;
        setPlaylist(prev => [...prev, track]);
        setCurrentIndex(newIndex);
      } else {
        const index = playlist.findIndex(t => t.id === track.id);
        setCurrentIndex(index);
      }
    }

    // Save to recently played
    try {
      // First, delete any existing entry for this song to avoid duplicates
      await supabase
        .from('recently_played')
        .delete()
        .eq('user_id', user?.id)
        .eq('youtube_video_id', track.videoId);

      // Then insert the new entry
      const { error } = await supabase
        .from('recently_played')
        .insert({
          user_id: user?.id,
          youtube_video_id: track.videoId,
          title: track.title,
          artist: track.artist,
          thumbnail_url: track.thumbnail,
          played_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving to recently played:', error);
      } else {
        console.log('Successfully saved to recently played:', track.title);
      }
    } catch (error) {
      console.error('Error saving to recently played:', error);
    }
  };

  const handlePlayPause = () => {
    console.log(`${isPlaying ? 'Pausing' : 'Playing'} track: ${currentTrack?.title}`);
    setIsPlaying(!isPlaying);
  };

  const fetchRelatedTracks = async (track: Track): Promise<Track[]> => {
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: {
          related: {
            videoId: track.videoId,
            title: track.title,
            artist: track.artist,
            language: LANGUAGE_LABELS[preferences.preferred_language] || '',
            genres: preferences.favorite_genres || [],
            // everything already queued/played, so no song repeats
            excludeTitles: playlist.map(t => t.title),
            excludeVideoIds: playlist.map(t => t.videoId),
            excludeArtists: [track.artist, ...playlist.map(t => t.artist)],
          },
        },
      });
      if (error || !data?.tracks) return [];
      const existingIds = new Set(playlist.map(t => t.videoId));
      existingIds.add(track.videoId);
      return (data.tracks as Track[]).filter(t => !existingIds.has(t.videoId));
    } catch (err) {
      console.error('Error fetching related tracks:', err);
      return [];
    }
  };

  const handleNext = async () => {
    if (playlist.length > 0 && currentIndex + 1 < playlist.length) {
      // Next track available in playlist
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setCurrentTrack(playlist[nextIndex]);
      setIsPlaying(true);
    } else if (isPlaylistMode && playlist.length > 0) {
      // Playlist mode: loop back to the start of the playlist
      setCurrentIndex(0);
      setCurrentTrack(playlist[0]);
      setIsPlaying(true);
      console.log('Playlist ended, looping back to start.');
    } else if (currentTrack) {
      // Non-playlist mode: auto-fetch related tracks and keep playing
      console.log('Song ended, fetching related tracks for:', currentTrack.title);
      const related = await fetchRelatedTracks(currentTrack);
      if (related.length > 0) {
        const nextTrack = related[0];
        setPlaylist(prev => [...prev, ...related]);
        setCurrentIndex(prev => prev + 1);
        setCurrentTrack(nextTrack);
        setIsPlaying(true);
        console.log('Auto-playing related track:', nextTrack.title);
      } else {
        console.info('No new eligible recommendations. Stopping instead of replaying previous songs.');
        setIsPlaying(false);
      }
    }
  };

  const handlePrevious = () => {
    if (playlist.length > 0) {
      const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
      setCurrentIndex(prevIndex);
      setCurrentTrack(playlist[prevIndex]);
      setIsPlaying(true);
      
      console.log(`Skipping to previous track: ${playlist[prevIndex]?.title}`);
    } else if (currentTrack) {
      // If no playlist, just restart current track
      console.log('No playlist available, restarting current track');
      setIsPlaying(true);
    }
  };

  const handleViewPlaylist = (playlistId: string) => {
    navigateToView('playlist-detail', playlistId);
  };

  const handleBackFromPlaylist = () => {
    const currentState = window.history.state as {
      __melodiyaAppNavigation?: boolean;
      depth?: number;
    } | null;

    if (currentState?.__melodiyaAppNavigation && Number(currentState.depth ?? 0) > 0) {
      window.history.back();
    } else {
      navigateToView('playlists');
    }
  };

  const renderView = () => {
    switch (activeView) {
      case 'home':
        return <HomeView onPlayTrack={handlePlayTrack} onViewChange={navigateToView} />;
      case 'search':
        return <SearchView onPlayTrack={handlePlayTrack} />;
      case 'trending':
        return <TrendingView onPlayTrack={handlePlayTrack} />;
      case 'liked':
        return <LikedSongsView onPlayTrack={handlePlayTrack} />;
      case 'playlists':
        return <PlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={handleViewPlaylist} />;
      case 'shared-playlists':
        return <SharedPlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={handleViewPlaylist} />;
      case 'playlist-detail':
        return selectedPlaylistId ? (
          <PlaylistDetailView 
            playlistId={selectedPlaylistId} 
            onPlayTrack={handlePlayTrack} 
            onBack={handleBackFromPlaylist} 
          />
        ) : <PlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={handleViewPlaylist} />;
      case 'recently-played':
        return <RecentlyPlayedView onPlayTrack={handlePlayTrack} />;
      case 'admin':
        return <AdminView />;
      case 'library':
        return <PlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={handleViewPlaylist} />;
      case 'friends':
        return <FriendsView />;
      case 'karaoke':
        return <KaraokeView onPlayTrack={handlePlayTrack} />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeView onPlayTrack={handlePlayTrack} onViewChange={setActiveView} />;
    }
  };

  return (
    <div className="h-[100dvh] min-h-0 w-full max-w-full overflow-hidden flex flex-col bg-background">
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {/* Mobile Header */}
        {isMobile && (
          <div className="absolute top-0 left-0 right-0 z-50 h-14 bg-background/80 backdrop-blur-lg border-b border-border/30 flex items-center px-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={openMobileSidebar}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <button
              type="button"
              aria-label="Go to home"
              onClick={() => {
                navigateToView('home');
                closeMobileSidebar();
              }}
              className="flex items-center gap-2 ml-4 flex-1 justify-start transition-opacity active:opacity-70"
            >
              <div className="w-6 h-6 bg-gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-xs font-bold text-white">M</span>
              </div>
              <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                Melodiya
              </span>
            </button>
            
          </div>
        )}

        {/* Sidebar */}
        <div className={`${isMobile ? (isMobileSidebarOpen ? 'fixed inset-y-0 left-0 z-50 w-64' : 'hidden') : 'relative w-64'}`}>
          <Sidebar 
            activeView={activeView} 
            onViewChange={navigateToView}
            onClose={closeMobileSidebar}
            isMobile={isMobile}
          />
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobile && isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={closeMobileSidebar}
          />
        )}
        
        {/* Main Content */}
        <div ref={mainRef} className={`flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain ${isMobile ? 'pt-14' : ''}`}>
          {renderView()}
        </div>
      </div>
      
      {/* Music Player (above mobile bottom nav) */}
      <MusicPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
      />

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav className="md:hidden glass-player border-t border-border/30 flex items-stretch justify-around flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeView === item.id ||
              (item.id === 'library' &&
                ['library', 'liked', 'playlists', 'shared-playlists', 'recently-played', 'playlist-detail'].includes(activeView));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToView(item.id)}
                className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};
