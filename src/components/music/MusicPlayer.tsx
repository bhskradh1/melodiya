import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Repeat,
  Shuffle,
  Heart,
  Share2,
  List,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Track } from '@/integrations/supabase/types';
import YouTubePlayer from './YouTubePlayer';
import { useToast } from '@/hooks/use-toast';
import { usePWA } from '@/hooks/use-pwa';

interface MusicPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  volume: number;
  currentTime: number;
  duration: number;
  playlist: Track[];
  currentIndex: number;
  onTrackSelect: (track: Track) => void;
  onToggleLike: (track: Track) => void;
  isLiked: boolean;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  repeatMode: 'none' | 'one' | 'all';
  shuffleMode: boolean;
}

export default function MusicPlayer({
  currentTrack,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  volume,
  currentTime,
  duration,
  playlist,
  currentIndex,
  onTrackSelect,
  onToggleLike,
  isLiked,
  onToggleRepeat,
  onToggleShuffle,
  repeatMode,
  shuffleMode
}: MusicPlayerProps) {
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const playerRef = useRef<any>(null);
  const { toast } = useToast();
  const { requestNotificationPermission, showNotification: showPWANotification } = usePWA();

  useEffect(() => {
    if (currentTrack && isPlaying && playerReady) {
      handleFirstPlay();
    }
  }, [currentTrack, isPlaying, playerReady]);

  const handleFirstPlay = async () => {
    try {
      // Request notification permission on first play
      const permission = await requestNotificationPermission();
      
      if (permission === 'granted') {
        // Show notification after a short delay
        setTimeout(() => {
          showPWANotification(
            'Now Playing',
            `${currentTrack?.title} - ${currentTrack?.artist}`,
            {
              icon: currentTrack?.thumbnail || '/icon-192x192.png',
              badge: '/icon-192x192.png',
              tag: 'music-player',
              requireInteraction: false,
              silent: true
            }
          );
        }, 500);

        // Request background sync for offline playback
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
          try {
            const registration = await navigator.serviceWorker.ready;
            await registration.sync.register('background-sync');
          } catch (error) {
            console.log('Background sync not supported');
          }
        }
      }
    } catch (error) {
      console.log('Notification permission denied or not supported');
    }
  };

  const handlePlayerReady = () => {
    setPlayerReady(true);
  };

  const handleStateChange = (event: any) => {
    if (event.data === window.YT.PlayerState.ENDED) {
      onNext();
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number[]) => {
    const newTime = value[0];
    onSeek(newTime);
    if (playerRef.current) {
      playerRef.current.seekTo(newTime, true);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    onVolumeChange(newVolume);
    if (playerRef.current) {
      playerRef.current.setVolume(newVolume);
    }
  };

  const toggleMute = () => {
    if (volume > 0) {
      onVolumeChange(0);
    } else {
      onVolumeChange(100);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (!currentTrack) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="text-center text-muted-foreground">
          <p>No track selected</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Hidden YouTube Player */}
      <div className="hidden">
        <YouTubePlayer
          videoId={currentTrack.youtube_id}
          isPlaying={isPlaying}
          onReady={handlePlayerReady}
          onStateChange={handleStateChange}
          onError={(error) => console.error('YouTube player error:', error)}
          ref={playerRef}
        />
      </div>

      {/* Music Player UI */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Track Info */}
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                <img
                  src={currentTrack.thumbnail || '/placeholder.svg'}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm truncate">{currentTrack.title}</h3>
                <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleShuffle}
                className={shuffleMode ? 'text-primary' : ''}
              >
                <Shuffle className="w-4 h-4" />
              </Button>
              
              <Button variant="ghost" size="sm" onClick={onPrevious}>
                <SkipBack className="w-5 h-5" />
              </Button>
              
              <Button
                variant="default"
                size="sm"
                onClick={onPlayPause}
                className="w-10 h-10 rounded-full"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>
              
              <Button variant="ghost" size="sm" onClick={onNext}>
                <SkipForward className="w-5 h-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleRepeat}
                className={repeatMode !== 'none' ? 'text-primary' : ''}
              >
                <Repeat className="w-4 h-4" />
                {repeatMode === 'one' && (
                  <Badge variant="secondary" className="ml-1 text-xs">1</Badge>
                )}
              </Button>
            </div>

            {/* Right Side Controls */}
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleLike(currentTrack)}
                className={isLiked ? 'text-red-500' : ''}
              >
                <Heart className="w-4 h-4" fill={isLiked ? 'currentColor' : 'none'} />
              </Button>
              
              <Button variant="ghost" size="sm">
                <Share2 className="w-4 h-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPlaylist(!showPlaylist)}
              >
                <List className="w-4 h-4" />
              </Button>
              
              <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 flex items-center space-x-3">
            <span className="text-xs text-muted-foreground w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              max={duration}
              step={1}
              onValueChange={handleSeek}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground w-12">
              {formatTime(duration)}
            </span>
          </div>

          {/* Volume Control */}
          <div className="mt-2 flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={toggleMute}>
              {volume > 0 ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </Button>
            <Slider
              value={[volume]}
              max={100}
              step={1}
              onValueChange={handleVolumeChange}
              className="w-24"
            />
          </div>
        </div>

        {/* Playlist Panel */}
        {showPlaylist && (
          <Card className="mx-4 mb-3 max-h-64 overflow-y-auto">
            <CardContent className="p-2">
              <div className="space-y-1">
                {playlist.map((track, index) => (
                  <div
                    key={track.id}
                    className={`flex items-center space-x-3 p-2 rounded cursor-pointer hover:bg-muted transition-colors ${
                      index === currentIndex ? 'bg-muted' : ''
                    }`}
                    onClick={() => onTrackSelect(track)}
                  >
                    <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0">
                      <img
                        src={track.thumbnail || '/placeholder.svg'}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm truncate ${
                        index === currentIndex ? 'font-medium' : ''
                      }`}>
                        {track.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {track.artist}
                      </p>
                    </div>
                    {index === currentIndex && (
                      <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}