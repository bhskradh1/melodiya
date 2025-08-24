import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { MusicPlayer } from './MusicPlayer';
import { HomeView } from './HomeView';
import { SearchView } from './SearchView';
import { AdminView } from '../admin/AdminView';

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
    setIsPlaying(!isPlaying);
  };

  const handleNext = () => {
    if (playlist.length > 0) {
      const nextIndex = (currentIndex + 1) % playlist.length;
      setCurrentIndex(nextIndex);
      setCurrentTrack(playlist[nextIndex]);
      setIsPlaying(true);
    }
  };

  const handlePrevious = () => {
    if (playlist.length > 0) {
      const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
      setCurrentIndex(prevIndex);
      setCurrentTrack(playlist[prevIndex]);
      setIsPlaying(true);
    }
  };

  const renderView = () => {
    switch (activeView) {
      case 'home':
        return <HomeView onPlayTrack={handlePlayTrack} />;
      case 'search':
        return <SearchView onPlayTrack={handlePlayTrack} />;
      case 'admin':
        return <AdminView />;
      case 'library':
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-4">Your Library</h1>
            <p className="text-muted-foreground">Your saved music and playlists will appear here.</p>
          </div>
        );
      case 'liked':
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-4">Liked Songs</h1>
            <p className="text-muted-foreground">Songs you've liked will appear here.</p>
          </div>
        );
      case 'playlists':
        return (
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-4">Recently Played</h1>
            <p className="text-muted-foreground">Your recently played songs will appear here.</p>
          </div>
        );
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
        {/* Sidebar */}
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
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