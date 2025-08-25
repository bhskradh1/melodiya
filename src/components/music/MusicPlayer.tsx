import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { YouTubePlayer } from './YouTubePlayer';
import { usePWA } from '@/hooks/use-pwa';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Heart,
  Repeat,
  Shuffle,
  Download
} from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface MusicPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  currentTrack,
  isPlaying,
  onPlayPause,
  onNext,
  onPrevious
}) => {
  const [volume, setVolume] = useState([75]);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const playerRef = useRef<any>(null);
  
  // PWA functionality
  const { 
    canInstall, 
    installPWA, 
    isInstalled, 
    isOnline, 
    requestNotificationPermission,
    showNotification,
    requestBackgroundSync 
  } = usePWA();

  const handlePlayerReady = () => {
    console.log('Player is ready');
    setPlayerReady(true);
    
    // If we have a track and should be playing, start playing
    if (currentTrack && isPlaying) {
      console.log('Player ready, starting playback for:', currentTrack.title);
      // Give more time for the player to fully initialize
      setTimeout(() => {
        if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
          console.log('Attempting to play video after player ready');
          playerRef.current.playVideo();
        }
      }, 500);
    }
  };

  const handleStateChange = (state: number) => {
    // YouTube Player States: 1 = playing, 2 = paused, 0 = ended, -1 = unstarted, 3 = buffering, 5 = cued
    console.log('Player state:', state);
    
    if (state === 1) { // playing
      setIsLoading(false);
    } else if (state === 3) { // buffering
      setIsLoading(true);
    } else if (state === -1 && currentTrack && isPlaying) { // unstarted but should be playing
      console.log('Player is unstarted but should be playing, retrying...');
      setTimeout(() => {
        if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
          playerRef.current.playVideo();
        }
      }, 1000);
    }
  };

  // Handle track changes and ensure proper playback
  useEffect(() => {
    console.log('MusicPlayer - Current track:', currentTrack);
    console.log('MusicPlayer - Is playing:', isPlaying);
    console.log('MusicPlayer - Player ready:', playerReady);
    
    if (currentTrack && isPlaying) {
      console.log('Track changed, ensuring playback for:', currentTrack.title);
      setIsLoading(true);
      
      if (playerReady) {
        // Player is ready, load and play immediately
        console.log('Player ready, loading and playing video for:', currentTrack.title);
        setTimeout(() => {
          if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
            playerRef.current.loadVideoById(currentTrack.videoId);
            setTimeout(() => {
              if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
                console.log('Playing video for:', currentTrack.title);
                playerRef.current.playVideo();
              }
            }, 1000);
          }
        }, 100);
      } else {
        // Player not ready yet, wait for it
        console.log('Player not ready yet, waiting for initialization');
      }
    }
  }, [currentTrack, isPlaying, playerReady]);

  const handleTimeUpdate = (current: number, total: number) => {
    setCurrentTime(current);
    setDuration(total);
  };

  const handleVideoEnd = () => {
    console.log('Video ended');
    if (isRepeat) {
      // Restart current track
      onPlayPause();
      setTimeout(() => onPlayPause(), 100);
    } else {
      // Go to next track
      onNext();
    }
  };

  // Handle music actions from service worker
  useEffect(() => {
    const handleMusicAction = (event: CustomEvent) => {
      const { action } = event.detail;
      switch (action) {
        case 'play':
          if (!isPlaying) onPlayPause();
          break;
        case 'pause':
          if (isPlaying) onPlayPause();
          break;
        case 'next':
          onNext();
          break;
        case 'previous':
          onPrevious();
          break;
      }
    };

    window.addEventListener('music-action', handleMusicAction as EventListener);
    return () => {
      window.removeEventListener('music-action', handleMusicAction as EventListener);
    };
  }, [isPlaying, onPlayPause, onNext, onPrevious]);

  // Handle background audio and notifications
  useEffect(() => {
    if (currentTrack && isPlaying) {
      // Request background sync for audio
      requestBackgroundSync('background-audio-sync');
      
      // Show notification for current track
      if (Notification.permission === 'granted') {
        showNotification(`Now Playing: ${currentTrack.title}`, {
          body: `by ${currentTrack.artist}`,
          icon: currentTrack.thumbnail,
          tag: 'music-player',
          requireInteraction: false,
          silent: true
        });
      }
    }
  }, [currentTrack, isPlaying, requestBackgroundSync, showNotification]);

  // Request notification permission on first play
  const handleFirstPlay = async () => {
    if (Notification.permission === 'default') {
      const granted = await requestNotificationPermission();
      if (granted) {
        console.log('Notification permission granted');
      }
    }
    onPlayPause();
  };

  const handleProgressChange = (value: number[]) => {
    if (playerRef.current && duration > 0) {
      const newTime = (value[0] / 100) * duration;
      console.log(`Seeking to: ${formatTime(newTime)}`);
      
      try {
        playerRef.current.seekTo(newTime, true);
        setCurrentTime(newTime);
      } catch (error) {
        console.error('Error seeking video:', error);
        // Fallback: just update visual progress
        setCurrentTime(newTime);
      }
    }
  };

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) {
    return (
      <div className="glass-player h-20 px-4 flex items-center justify-center">
        <p className="text-muted-foreground">No track selected</p>
      </div>
    );
  }

  return (
    <>
      {/* Hidden YouTube Player */}
      <YouTubePlayer
        ref={playerRef}
        videoId={currentTrack?.videoId || null}
        isPlaying={isPlaying}
        onReady={handlePlayerReady}
        onStateChange={handleStateChange}
        onEnd={handleVideoEnd}
        onTimeUpdate={handleTimeUpdate}
      />
      
      {/* Mobile Layout - Improved for better touch targets */}
      <div className="md:hidden glass-player min-h-[100px] px-4 py-3 flex flex-col gap-3">
        {/* Track Info - Mobile */}
        <div className="flex items-center gap-3">
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-12 h-12 rounded-lg object-cover shadow-md flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{currentTrack.title}</h4>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 w-10 p-0 ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
              onClick={() => setIsLiked(!isLiked)}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            </Button>
            
            {/* Install PWA Button */}
            {canInstall && !isInstalled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 p-0 text-primary hover:text-primary/80"
                onClick={installPWA}
                title="Install App"
              >
                <Download className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Controls - Larger touch targets */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-12 w-12 p-0 text-foreground hover:text-primary rounded-full"
            onClick={onPrevious}
          >
            <SkipBack className="w-6 h-6" />
          </Button>
          
                     <Button
             size="sm"
             className="h-14 w-14 p-0 bg-primary hover:bg-primary/90 rounded-full shadow-lg"
             onClick={handleFirstPlay}
             disabled={isLoading}
           >
             {isLoading ? (
               <div className="w-7 h-7 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
             ) : isPlaying ? (
               <Pause className="w-7 h-7 text-primary-foreground" />
             ) : (
               <Play className="w-7 h-7 text-primary-foreground ml-1" />
             )}
           </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-12 w-12 p-0 text-foreground hover:text-primary rounded-full"
            onClick={onNext}
          >
            <SkipForward className="w-6 h-6" />
          </Button>
        </div>

        {/* Mobile Progress Bar - Improved */}
        <div className="w-full">
          <div className="flex items-center gap-3 w-full">
            <span className="text-xs text-muted-foreground min-w-[40px] font-mono">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[progressPercentage]}
              onValueChange={handleProgressChange}
              max={100}
              step={0.1}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground min-w-[40px] font-mono">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Layout - Original horizontal layout */}
      <div className="hidden md:block glass-player h-20 px-4 flex items-center justify-between">
        {/* Track Info - Desktop */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-12 h-12 rounded-lg object-cover shadow-md"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{currentTrack.title}</h4>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
            onClick={() => setIsLiked(!isLiked)}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
          </Button>
        </div>

        {/* Player Controls - Desktop */}
        <div className="flex flex-col items-center gap-2 flex-1 max-w-md">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${isShuffle ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setIsShuffle(!isShuffle)}
            >
              <Shuffle className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-foreground hover:text-primary"
              onClick={onPrevious}
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            
                         <Button
               size="sm"
               className="h-10 w-10 p-0 bg-primary hover:bg-primary/90 rounded-full"
               onClick={onPlayPause}
               disabled={isLoading}
             >
               {isLoading ? (
                 <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
               ) : isPlaying ? (
                 <Pause className="w-5 h-5 text-primary-foreground" />
               ) : (
                 <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
               )}
             </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-foreground hover:text-primary"
              onClick={onNext}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${isRepeat ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setIsRepeat(!isRepeat)}
            >
              <Repeat className="w-4 h-4" />
            </Button>
          </div>

          {/* Progress Bar - Desktop */}
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-muted-foreground">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[progressPercentage]}
              onValueChange={handleProgressChange}
              max={100}
              step={0.1}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volume Control - Desktop */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted || volume[0] === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </Button>
          <Slider
            value={isMuted ? [0] : volume}
            onValueChange={setVolume}
            max={100}
            step={1}
            className="w-24"
          />
        </div>
      </div>
    </>
  );
};
