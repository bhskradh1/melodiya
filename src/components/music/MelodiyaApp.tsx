import React, { useState } from 'react';
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
import { AdminView } from '../admin/AdminView';
import { InstallDialog } from './InstallDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Menu, X, Download, Home, Search, TrendingUp, Library } from 'lucide-react';

const bottomNavItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'library', label: 'Library', icon: Library },
];
import { usePWA } from '@/hooks/use-pwa';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

export const MelodiyaApp: React.FC = () => {
  const [activeView, setActiveView] = useState('home');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaylistMode, setIsPlaylistMode] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { canInstall, installPWA, isInstalled } = usePWA();

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
      const query = `${track.artist} ${track.title} similar songs`;
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query }
      });
      if (error || !data?.tracks) return [];
      // Filter out the current track and any already in playlist
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
        if (playlist.length > 0) {
          setCurrentIndex(0);
          setCurrentTrack(playlist[0]);
          setIsPlaying(true);
        }
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
    setSelectedPlaylistId(playlistId);
    setActiveView('playlist-detail');
  };

  const handleBackFromPlaylist = () => {
    setSelectedPlaylistId(null);
    setActiveView('playlists');
  };

  const renderView = () => {
    switch (activeView) {
      case 'home':
        return <HomeView onPlayTrack={handlePlayTrack} onViewChange={setActiveView} />;
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
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeView onPlayTrack={handlePlayTrack} onViewChange={setActiveView} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Header */}
        {isMobile && (
          <div className="absolute top-0 left-0 right-0 z-50 h-14 bg-background/80 backdrop-blur-lg border-b border-border/30 flex items-center px-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <button
              type="button"
              aria-label="Go to home"
              onClick={() => {
                setActiveView('home');
                setIsMobileSidebarOpen(false);
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
            
            {/* Install App Button - Mobile */}
            {!isInstalled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-primary hover:text-primary/80"
                onClick={() => setShowInstallDialog(true)}
              >
                <Download className="w-4 h-4 mr-1" />
                Install
              </Button>
            )}
          </div>
        )}

        {/* Sidebar */}
        <div className={`${isMobile ? (isMobileSidebarOpen ? 'fixed inset-y-0 left-0 z-50 w-64' : 'hidden') : 'relative w-64'}`}>
          <Sidebar 
            activeView={activeView} 
            onViewChange={(view) => {
              setActiveView(view);
              if (isMobile) setIsMobileSidebarOpen(false);
            }}
            onClose={() => setIsMobileSidebarOpen(false)}
            isMobile={isMobile}
          />
        </div>

        {/* Mobile Sidebar Overlay */}
        {isMobile && isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}
        
        {/* Main Content */}
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'pt-14' : ''}`}>
          {renderView()}
        </div>
      </div>
      
      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav className="md:hidden glass-player border-t border-border/30 flex items-stretch justify-around flex-shrink-0">
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
                onClick={() => setActiveView(item.id)}
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

      {/* Music Player */}
      <MusicPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
      />

      {/* Install Dialog */}
      <InstallDialog
        open={showInstallDialog}
        onOpenChange={setShowInstallDialog}
        onNativeInstall={installPWA}
        canNativeInstall={canInstall}
      />
    </div>
  );
};
