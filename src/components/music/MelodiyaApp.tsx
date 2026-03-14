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
import { Menu, X, Download, Home, Music, Settings as SettingsIcon } from 'lucide-react';
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
  const [showInstallDialog, setShowInstallDialog] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { canInstall, installPWA, isInstalled } = usePWA();

  const handlePlayTrack = async (track: Track, newPlaylist?: Track[]) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
      const clickedIndex = newPlaylist.findIndex(t => t.id === track.id);
      setCurrentIndex(clickedIndex >= 0 ? clickedIndex : 0);
    } else {
      if (!playlist.find(t => t.id === track.id)) {
        const newIndex = playlist.length;
        setPlaylist(prev => [...prev, track]);
        setCurrentIndex(newIndex);
      } else {
        const index = playlist.findIndex(t => t.id === track.id);
        setCurrentIndex(index);
      }
    }

    try {
      await supabase
        .from('recently_played')
        .delete()
        .eq('user_id', user?.id)
        .eq('youtube_video_id', track.videoId);

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
      if (error) console.error('Error saving to recently played:', error);
    } catch (error) {
      console.error('Error saving to recently played:', error);
    }
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const fetchRelatedTracks = async (track: Track): Promise<Track[]> => {
    try {
      const query = `${track.artist} ${track.title} similar songs`;
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query }
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
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setCurrentTrack(playlist[nextIndex]);
      setIsPlaying(true);
    } else if (currentTrack) {
      const related = await fetchRelatedTracks(currentTrack);
      if (related.length > 0) {
        const nextTrack = related[0];
        setPlaylist(prev => [...prev, ...related]);
        setCurrentIndex(prev => prev + 1);
        setCurrentTrack(nextTrack);
        setIsPlaying(true);
      } else if (playlist.length > 0) {
        setCurrentIndex(0);
        setCurrentTrack(playlist[0]);
        setIsPlaying(true);
      }
    }
  };

  const handlePrevious = () => {
    if (playlist.length > 0) {
      const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
      setCurrentIndex(prevIndex);
      setCurrentTrack(playlist[prevIndex]);
      setIsPlaying(true);
    } else if (currentTrack) {
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

  /* Mobile bottom nav items */
  const mobileNavItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'library', label: 'Library', icon: Music },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <div className="relative w-64 flex-shrink-0">
            <Sidebar
              activeView={activeView}
              onViewChange={setActiveView}
              isMobile={false}
            />
          </div>
        )}

        {/* Mobile Sidebar drawer */}
        {isMobile && isMobileSidebarOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-72 animate-in slide-in-from-left duration-200">
              <Sidebar
                activeView={activeView}
                onViewChange={(view) => {
                  setActiveView(view);
                  setIsMobileSidebarOpen(false);
                }}
                onClose={() => setIsMobileSidebarOpen(false)}
                isMobile
              />
            </div>
          </>
        )}

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

      {/* ── Mobile floating bottom nav ── */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* Frosted pill bar */}
          <div className="flex items-center justify-around bg-card/70 backdrop-blur-2xl border border-white/[0.08] rounded-2xl py-2 px-2 shadow-xl shadow-black/30"
            style={{ marginBottom: currentTrack ? '72px' : '0' }}
          >
            {mobileNavItems.map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              // Center icon is the music/library button with accent
              const isCenter = item.id === 'library';
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all ${
                    isCenter
                      ? 'bg-primary text-primary-foreground rounded-full w-14 h-14 flex items-center justify-center shadow-lg shadow-primary/40 -mt-4'
                      : isActive
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  }`}
                >
                  <Icon className={isCenter ? 'w-6 h-6' : 'w-5 h-5'} />
                  {!isCenter && <span className="text-[10px] font-medium">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

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