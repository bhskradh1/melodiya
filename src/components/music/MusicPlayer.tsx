import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { YouTubePlayer } from './YouTubePlayer';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Heart,
  Repeat,
  Shuffle
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
  const playerRef = useRef<any>(null);

  const handlePlayerReady = () => {
    console.log('Player is ready');
    setPlayerReady(true);
  };

  const handleStateChange = (state: number) => {
    // YouTube Player States: 1 = playing, 2 = paused, 0 = ended
    console.log('Player state:', state);
  };

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
      
    <div className="glass-player h-20 px-2 md:px-4 flex items-center justify-between">
        {/* Track Info */}
      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
        <img
          src={currentTrack.thumbnail}
          alt={currentTrack.title}
          className="w-10 h-10 md:w-12 md:h-12 rounded-lg object-cover shadow-md"
        />
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-xs md:text-sm truncate">{currentTrack.title}</h4>
          <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 md:h-8 md:w-8 p-0 ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
          onClick={() => setIsLiked(!isLiked)}
        >
          <Heart className={`w-3 h-3 md:w-4 md:h-4 ${isLiked ? 'fill-current' : ''}`} />
        </Button>
      </div>

      {/* Player Controls */}
      <div className="flex flex-col items-center gap-2 flex-1 max-w-md">
        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${isShuffle ? 'text-primary' : 'text-muted-foreground'} hidden md:flex`}
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
          >
            {isPlaying ? (
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
            className={`h-8 w-8 p-0 ${isRepeat ? 'text-primary' : 'text-muted-foreground'} hidden md:flex`}
            onClick={() => setIsRepeat(!isRepeat)}
          >
            <Repeat className="w-4 h-4" />
          </Button>
        </div>

        {/* Progress Bar */}
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

      {/* Volume Control - Hidden on mobile */}
      <div className="hidden md:flex items-center gap-2 flex-1 justify-end">
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