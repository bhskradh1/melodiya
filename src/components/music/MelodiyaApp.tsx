import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MusicPlayer } from './MusicPlayer';
import { HomeView } from './HomeView';
import { SearchView } from './SearchView';
import { LikedSongsView } from './LikedSongsView';
import { PlaylistsView } from './PlaylistsView';
import { PlaylistDetailView } from './PlaylistDetailView';
import { RecentlyPlayedView } from './RecentlyPlayedView';
import { TrendingView } from './TrendingView';
import { AdminView } from '../admin/AdminView';
import { InstallDialog } from './InstallDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/components/auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Menu, X, Download } from 'lucide-react';
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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { canInstall, installPWA, isInstalled } = usePWA();
  
  // Debug PWA state
  console.log('PWA State:', { canInstall, isInstalled });

  // Accept optional playlist argument
  const handlePlayTrack = async (track: Track, newPlaylist?: Track[]) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
      // Set index to the clicked track's position in the playlist
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

  const handleNext = () => {
    if (playlist.length > 0) {
      if (currentIndex + 1 < playlist.length) {
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setCurrentTrack(playlist[nextIndex]);
        setIsPlaying(true);
        console.log(`Skipping to next track: ${playlist[nextIndex]?.title}`);
      } else {
        // End of playlist reached - loop back to start
        const nextIndex = 0;
        setCurrentIndex(nextIndex);
        setCurrentTrack(playlist[nextIndex]);
        setIsPlaying(true);
        console.log('End of playlist reached. Looping back to start.');
      }
    } else if (currentTrack) {
      // If no playlist, just restart current track
      console.log('No playlist available, restarting current track');
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 200);
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
      case 'settings':
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-4">Settings</h1>
            <p className="text-muted-foreground">App settings and preferences.</p>
          </div>
        );
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
            <div className="flex items-center gap-2 ml-4 flex-1">
              <div className="w-6 h-6 bg-gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-xs font-bold text-white">M</span>
              </div>
              <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                Melodiya
              </span>
            </div>
            
            {/* Install App Button - Mobile - Always show with fallback */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-primary hover:text-primary/80"
              onClick={() => {
                console.log('Install button clicked, canInstall:', canInstall, 'isInstalled:', isInstalled);
                if (canInstall && installPWA) {
                  installPWA();
                } else {
                  // Fallback: Show manual installation instructions
                  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                  const isChrome = /Chrome/.test(navigator.userAgent);
                  
                  let message = '';
                  if (isIOS) {
                    message = 'To install:\n1. Tap the Share button (box with arrow)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add" to install the app';
                  } else if (isChrome) {
                    message = 'To install:\n1. Click the 3-dot menu (⋮) in browser\n2. Select "Install Melodiya..."\n3. Click "Install" in the popup';
                  } else {
                    message = 'To install this app:\n1. Use Chrome or Edge browser\n2. Look for "Install" option in browser menu\n3. Or add this page to your home screen';
                  }
                  
                  alert(message);
                }
              }}
            >
              <Download className="w-4 h-4 mr-1" />
              Install
            </Button>
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
      
      {/* Music Player */}
      <MusicPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={handleNext}
        onPrevious={handlePrevious}
      />
    </div>
  );
};
