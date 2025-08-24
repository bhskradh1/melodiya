import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MusicPlayer } from './MusicPlayer';
import { HomeView } from './HomeView';
import { SearchView } from './SearchView';
import { LikedSongsView } from './LikedSongsView';
import { PlaylistsView } from './PlaylistsView';
import { RecentlyPlayedView } from './RecentlyPlayedView';
import { AdminView } from '../admin/AdminView';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

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
  const isMobile = useIsMobile();

  const handlePlayTrack = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    
    // Add to playlist if not already there
    if (!playlist.find(t => t.id === track.id)) {
      setPlaylist(prev => [...prev, track]);
      setCurrentIndex(playlist.length);
    } else {
      const index = playlist.findIndex(t => t.id === track.id);
      setCurrentIndex(index);
    }
  };

  const handlePlayPause = () => {
    console.log(`${isPlaying ? 'Pausing' : 'Playing'} track: ${currentTrack?.title}`);
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (playlist.length > 0) {
      const nextIndex = (currentIndex + 1) % playlist.length;
      setCurrentIndex(nextIndex);
      setCurrentTrack(playlist[nextIndex]);
      setIsPlaying(true);
      
      console.log(`Skipping to next track: ${playlist[nextIndex]?.title}`);
    } else if (currentTrack) {
      // If no playlist, just restart current track
      console.log('No playlist available, restarting current track');
      setIsPlaying(true);
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

  const renderView = () => {
    switch (activeView) {
      case 'home':
        return <HomeView onPlayTrack={handlePlayTrack} />;
      case 'search':
        return <SearchView onPlayTrack={handlePlayTrack} />;
      case 'liked':
        return <LikedSongsView onPlayTrack={handlePlayTrack} />;
      case 'playlists':
        return <PlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={(id) => console.log('View playlist:', id)} />;
      case 'recently-played':
        return <RecentlyPlayedView onPlayTrack={handlePlayTrack} />;
      case 'admin':
        return <AdminView />;
      case 'library':
        return <PlaylistsView onPlayTrack={handlePlayTrack} onViewPlaylist={(id) => console.log('View playlist:', id)} />;
      case 'settings':
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-4">Settings</h1>
            <p className="text-muted-foreground">App settings and preferences.</p>
          </div>
        );
      default:
        return <HomeView onPlayTrack={handlePlayTrack} />;
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
            <div className="flex items-center gap-2 ml-4">
              <div className="w-6 h-6 bg-gradient-primary rounded-lg flex items-center justify-center">
                <span className="text-xs font-bold text-white">M</span>
              </div>
              <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                Melodiya
              </span>
            </div>
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