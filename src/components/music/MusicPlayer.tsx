import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { YouTubePlayer } from './YouTubePlayer';
import { NowPlayingView } from './NowPlayingView';
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
  Download,
  Music2,
  ChevronUp
} from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  audioUrl?: string;
  audio_url?: string;
}

declare global {
  interface Window {
    MelodiyaNativeAudio?: { postMessage: (message: string) => void };
    MelodiyaNativeMedia?: { postMessage: (message: string) => void };
  }
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
  const volumeInitRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [nativeCurrentTime, setNativeCurrentTime] = useState(0);
  const [nativeDuration, setNativeDuration] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const prevTrackIdRef = useRef<string | null>(null);
  const previousNativeAudioUrlRef = useRef<string | null>(null);
  const lastNativeExternalPlayingRef = useRef<boolean | null>(null);
  const playerRef = useRef<any>(null);
  const playerLoadTimeoutRef = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const { notifications: notificationsEnabled, normalizeVolume, autoOpenNowPlaying, defaultVolume } = useSettings();
  const nativeAudioUrl = currentTrack?.audioUrl ?? currentTrack?.audio_url ?? null;
  const useNativeAudio = Boolean(nativeAudioUrl && typeof window !== 'undefined' && window.MelodiyaNativeAudio);
  const sendNativeAudioCommand = useCallback((payload: Record<string, unknown>) => {
    try {
      if (!window.MelodiyaNativeAudio) return false;
      window.MelodiyaNativeAudio.postMessage(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }, []);

  // Apply the saved default volume once on mount
  useEffect(() => {
    if (!volumeInitRef.current) {
      volumeInitRef.current = true;
      setVolume([defaultVolume]);
    }
  }, [defaultVolume]);
  
  const { 
    canInstall, 
    installPWA, 
    isInstalled, 
    requestNotificationPermission,
    showNotification,
    requestBackgroundSync 
  } = usePWA();

  // Check if current track is liked
  useEffect(() => {
    const checkLiked = async () => {
      if (!currentTrack || !user) { setIsLiked(false); return; }
      const { data } = await supabase
        .from('liked_songs')
        .select('id')
        .eq('user_id', user.id)
        .eq('youtube_video_id', currentTrack.videoId)
        .maybeSingle();
      setIsLiked(!!data);
    };
    checkLiked();
  }, [currentTrack?.videoId, user]);

  const handleToggleLike = useCallback(async () => {
    if (!currentTrack || !user) return;
    if (isLiked) {
      await supabase
        .from('liked_songs')
        .delete()
        .eq('user_id', user.id)
        .eq('youtube_video_id', currentTrack.videoId);
      setIsLiked(false);
      toast({ title: 'Removed from Liked Songs' });
    } else {
      await supabase
        .from('liked_songs')
        .insert({
          user_id: user.id,
          youtube_video_id: currentTrack.videoId,
          title: currentTrack.title,
          artist: currentTrack.artist,
          thumbnail_url: currentTrack.thumbnail,
        });
      setIsLiked(true);
      toast({ title: 'Added to Liked Songs' });
    }
  }, [currentTrack, user, isLiked, toast]);

  // Auto-open Now Playing on mobile when a new track starts
  useEffect(() => {
    if (currentTrack && currentTrack.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = currentTrack.id;
      if (isMobile && autoOpenNowPlaying) {
        setShowNowPlaying(true);
      }
    }
  }, [currentTrack, isMobile, autoOpenNowPlaying]);

  const handlePlayerReady = () => {
    setPlayerReady(true);
  };

  const handleStateChange = (state: number) => {
    if (state === 1) {
      setIsLoading(false);
      if (playerLoadTimeoutRef.current !== null) window.clearTimeout(playerLoadTimeoutRef.current);
      playerLoadTimeoutRef.current = null;
    } else if (state === 3) {
      setIsLoading(true);
    } else if (state === 2 || state === 0) {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (useNativeAudio) return;
    if (currentTrack && playerReady) {
      setIsLoading(true);
      if (isPlaying && playerRef.current && typeof playerRef.current.getVideoData === 'function') {
        const videoData = playerRef.current.getVideoData?.();
        const loadedVideoId = videoData?.video_id;
        if (loadedVideoId !== currentTrack.videoId) {
          playerRef.current.loadVideoById(currentTrack.videoId);
          setTimeout(() => {
            playerRef.current.seekTo(0, true);
            playerRef.current.playVideo();
          }, 1000);
        } else {
          setTimeout(() => {
            playerRef.current.seekTo(currentTime, true);
            playerRef.current.playVideo();
          }, 100);
        }
      }
    }
  }, [currentTrack, isPlaying, playerReady, useNativeAudio]);

  useEffect(() => {
    if (playerLoadTimeoutRef.current !== null) window.clearTimeout(playerLoadTimeoutRef.current);
    if (!currentTrack || useNativeAudio) return;
    setIsLoading(true);
    playerLoadTimeoutRef.current = window.setTimeout(() => {
      setIsLoading(false);
      toast({ title: 'Song is taking too long to load', description: 'Check your connection or choose another version.', variant: 'destructive' });
      playerLoadTimeoutRef.current = null;
    }, 30000);
    return () => {
      if (playerLoadTimeoutRef.current !== null) window.clearTimeout(playerLoadTimeoutRef.current);
      playerLoadTimeoutRef.current = null;
    };
  }, [currentTrack?.videoId, useNativeAudio, toast]);

  const endTriggeredRef = useRef(false);

  // Reset end-triggered flag when track changes
  useEffect(() => {
    endTriggeredRef.current = false;
  }, [currentTrack?.videoId]);

  const triggerNextTrack = () => {
    if (endTriggeredRef.current) return;
    endTriggeredRef.current = true;
    setCurrentTime(0);
    setIsLoading(false);
    if (isRepeat) {
      endTriggeredRef.current = false;
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(0, true);
        playerRef.current.playVideo();
      }
    } else {
      onNext();
    }
  };

  const handleTimeUpdate = (current: number, total: number) => {
    setCurrentTime(current);
    setDuration(total);
    
    // Background watchdog: if we're near the end, trigger next track
    // This catches cases where the onEnd event doesn't fire (background throttling)
    if (total > 0 && current > 0 && (total - current) < 1.5 && isPlaying) {
      triggerNextTrack();
    }
  };

  const handleVideoEnd = () => {
    triggerNextTrack();
  };

  useEffect(() => {
    const previousUrl = previousNativeAudioUrlRef.current;
    if (!useNativeAudio || !nativeAudioUrl || !currentTrack) {
      if (previousUrl) sendNativeAudioCommand({ command: 'stop' });
      previousNativeAudioUrlRef.current = null;
      lastNativeExternalPlayingRef.current = null;
      return;
    }

    if (previousUrl !== nativeAudioUrl) {
      previousNativeAudioUrlRef.current = nativeAudioUrl;
      setNativeCurrentTime(0);
      setNativeDuration(0);
      setIsLoading(true);
      sendNativeAudioCommand({
        command: 'load',
        url: nativeAudioUrl,
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork: currentTrack.thumbnail,
        autoplay: isPlaying,
      });
    } else {
      sendNativeAudioCommand({ command: isPlaying ? 'play' : 'pause' });
    }
  }, [
    useNativeAudio,
    nativeAudioUrl,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.thumbnail,
    isPlaying,
    sendNativeAudioCommand,
  ]);

  useEffect(() => {
    if (!useNativeAudio) return;
    const handleNativeAudioState = (event: Event) => {
      const detail = (event as CustomEvent<{
        event?: string;
        playing?: boolean;
        position?: number;
        duration?: number;
        processingState?: string;
        syncPlaying?: boolean;
        message?: string;
      }>).detail;
      if (!detail) return;

      if (detail.event === 'ended') {
        triggerNextTrack();
        return;
      }
      if (detail.event === 'error') {
        setIsLoading(false);
        toast({
          title: 'Native audio could not be played',
          description: detail.message || 'Check that the audio URL is a valid, accessible HTTPS stream.',
          variant: 'destructive',
        });
        return;
      }

      if (typeof detail.position === 'number') setNativeCurrentTime(detail.position);
      if (typeof detail.duration === 'number') setNativeDuration(detail.duration);
      setIsLoading(detail.processingState === 'loading' || detail.processingState === 'buffering');

      if (detail.syncPlaying && typeof detail.playing === 'boolean') {
        if (detail.playing === isPlaying) {
          lastNativeExternalPlayingRef.current = null;
        } else if (lastNativeExternalPlayingRef.current !== detail.playing) {
          lastNativeExternalPlayingRef.current = detail.playing;
          onPlayPause();
        }
      }
    };

    window.addEventListener('melodiya-native-audio-state', handleNativeAudioState);
    return () => window.removeEventListener('melodiya-native-audio-state', handleNativeAudioState);
  }, [useNativeAudio, isPlaying, onPlayPause, toast, triggerNextTrack]);

  useEffect(() => {
    const handleMusicAction = (event: CustomEvent) => {
      const { action } = event.detail;
      switch (action) {
        case 'play': if (!isPlaying) onPlayPause(); break;
        case 'pause': if (isPlaying) onPlayPause(); break;
        case 'next': onNext(); break;
        case 'previous': onPrevious(); break;
      }
    };
    window.addEventListener('music-action', handleMusicAction as EventListener);
    return () => window.removeEventListener('music-action', handleMusicAction as EventListener);
  }, [isPlaying, onPlayPause, onNext, onPrevious]);

  // Media Session API for lock screen / notification controls
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack && !useNativeAudio && !window.MelodiyaNativeMedia) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: 'Melodiya',
        artwork: [
          { src: currentTrack.thumbnail, sizes: '96x96', type: 'image/jpeg' },
          { src: currentTrack.thumbnail, sizes: '256x256', type: 'image/jpeg' },
          { src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' },
        ],
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', () => { if (!isPlaying) onPlayPause(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (isPlaying) onPlayPause(); });
      navigator.mediaSession.setActionHandler('nexttrack', () => onNext());
      navigator.mediaSession.setActionHandler('previoustrack', () => onPrevious());
      try {
        navigator.mediaSession.setActionHandler('stop', () => { if (isPlaying) onPlayPause(); });
        navigator.mediaSession.setActionHandler('seekto', (details: any) => {
          if (details.seekTime != null && playerRef.current?.seekTo) {
            playerRef.current.seekTo(details.seekTime, true);
            setCurrentTime(details.seekTime);
          }
        });
      } catch {
        /* not all platforms support these */
      }
    }
  }, [currentTrack, isPlaying, onPlayPause, onNext, onPrevious, useNativeAudio]);

  // Keep the notification scrubber in sync
  useEffect(() => {
    if (!useNativeAudio && !window.MelodiyaNativeMedia && 'mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          playbackRate: 1,
        });
      } catch {
        /* ignore invalid position state */
      }
    }
  }, [currentTime, duration, useNativeAudio]);

  // Keep Android's native media notification in sync with the YouTube track.
  // The native handler clears it when the app leaves the foreground.
  useEffect(() => {
    if (!currentTrack || useNativeAudio || !window.MelodiyaNativeMedia) return;
    try {
      window.MelodiyaNativeMedia.postMessage(JSON.stringify({
        command: 'update',
        videoId: currentTrack.videoId,
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork: currentTrack.thumbnail,
        playing: isPlaying,
      }));
    } catch (error) {
      console.warn('Could not sync Android media notification:', error);
    }
  }, [currentTrack?.videoId, currentTrack?.title, currentTrack?.artist, currentTrack?.thumbnail, isPlaying, useNativeAudio]);

  // Do not force an embedded YouTube player to continue after the app backgrounds.
  useEffect(() => {
    const pauseForBackground = () => {
      if (useNativeAudio) return;
      if (isPlaying) {
        try { playerRef.current?.pauseVideo?.(); } catch {}
        onPlayPause();
      }
      try {
        window.MelodiyaNativeMedia?.postMessage(JSON.stringify({ command: 'clear' }));
      } catch {}
    };
    window.addEventListener('melodiya-app-background', pauseForBackground);
    return () => window.removeEventListener('melodiya-app-background', pauseForBackground);
  }, [isPlaying, onPlayPause, useNativeAudio]);

  useEffect(() => {
    if (currentTrack && isPlaying) requestBackgroundSync('music-playback');
  }, [currentTrack?.videoId, isPlaying]);

  // Volume normalization: when enabled, set YouTube player to a fixed 75% volume
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      if (normalizeVolume) {
        playerRef.current.setVolume(75);
      } else {
        playerRef.current.setVolume(isMuted ? 0 : volume[0]);
      }
    }
  }, [normalizeVolume, currentTrack, playerReady]);

  // Send volume changes to the native player for direct streams.
  useEffect(() => {
    if (!useNativeAudio) return;
    sendNativeAudioCommand({ command: 'volume', volume: (isMuted ? 0 : volume[0]) / 100 });
  }, [useNativeAudio, volume, isMuted, sendNativeAudioCommand]);

  // Sync volume to YouTube player
  useEffect(() => {
    if (useNativeAudio) return;
    if (playerRef.current && typeof playerRef.current.setVolume === 'function' && !normalizeVolume) {
      playerRef.current.setVolume(isMuted ? 0 : volume[0]);
    }
  }, [volume, isMuted, normalizeVolume, useNativeAudio]);

  const handleFirstPlay = async () => {
    // Always toggle playback first — notification permission must never block it.
    onPlayPause();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await requestNotificationPermission();
      }
    } catch (err) {
      console.warn('Notification permission unavailable:', err);
    }
  };

  const handleProgressChange = (value: number[]) => {
    if (useNativeAudio && nativeDuration > 0) {
      const newTime = (value[0] / 100) * nativeDuration;
      sendNativeAudioCommand({ command: 'seek', position: newTime });
      setNativeCurrentTime(newTime);
      return;
    }
    if (playerRef.current && duration > 0) {
      const newTime = (value[0] / 100) * duration;
      try {
        playerRef.current.seekTo(newTime, true);
        setCurrentTime(newTime);
      } catch {
        setCurrentTime(newTime);
      }
    }
  };

  const displayedCurrentTime = useNativeAudio ? nativeCurrentTime : currentTime;
  const displayedDuration = useNativeAudio ? nativeDuration : duration;
  const progressPercentage = displayedDuration > 0 ? (displayedCurrentTime / displayedDuration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) {
    return null;
  }

  return (
    <>
      {/* Now Playing Full Screen View */}
      <NowPlayingView
        isVisible={showNowPlaying}
        onClose={() => setShowNowPlaying(false)}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isLoading={isLoading}
        onPlayPause={onPlayPause}
        onNext={onNext}
        onPrevious={onPrevious}
        currentTime={displayedCurrentTime}
        duration={displayedDuration}
        onSeek={handleProgressChange}
        isRepeat={isRepeat}
        isShuffle={isShuffle}
        isLiked={isLiked}
        onToggleRepeat={() => setIsRepeat(!isRepeat)}
        onToggleShuffle={() => setIsShuffle(!isShuffle)}
        onToggleLike={handleToggleLike}
      />

      {/* Hidden YouTube Player */}
      {!useNativeAudio && (
        <YouTubePlayer
          ref={playerRef}
          videoId={currentTrack?.videoId || null}
          isPlaying={isPlaying}
          onReady={handlePlayerReady}
          onStateChange={handleStateChange}
          onEnd={handleVideoEnd}
          onTimeUpdate={handleTimeUpdate}
        />
      )}
      
      {/* Mobile Layout */}
      <div className="md:hidden glass-player px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex flex-col gap-1 flex-shrink-0">
        {/* Clickable Track Info - Opens Now Playing */}
        <div 
          className="flex items-center gap-3 cursor-pointer active:opacity-80 transition-opacity"
          onClick={() => setShowNowPlaying(true)}
        >
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-11 h-11 rounded-lg object-cover shadow-md flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{currentTrack.title}</h4>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 w-10 p-0 ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
              onClick={(e) => { e.stopPropagation(); handleToggleLike(); }}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            </Button>
            <Button
              size="sm"
              className="h-10 w-10 p-0 bg-primary hover:bg-primary/90 rounded-full"
              onClick={(e) => { e.stopPropagation(); handleFirstPlay(); }}
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
          </div>
        </div>

        {/* Mini Progress Bar */}
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex glass-player h-20 px-4 items-center justify-between">
        {/* Track Info - Clickable */}
        <div 
          className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setShowNowPlaying(true)}
        >
          <div className="relative group">
            <img
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className="w-12 h-12 rounded-lg object-cover shadow-md"
            />
            <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <ChevronUp className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{currentTrack.title}</h4>
            <p className="text-xs text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
            onClick={(e) => { e.stopPropagation(); handleToggleLike(); }}
          >
            <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
          </Button>
        </div>

        {/* Player Controls */}
        <div className="flex flex-col items-center gap-2 flex-1 max-w-md">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm"
              className={`h-8 w-8 p-0 ${isShuffle ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setIsShuffle(!isShuffle)}>
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-foreground hover:text-primary"
              onClick={onPrevious}>
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button size="sm"
              className="h-10 w-10 p-0 bg-primary hover:bg-primary/90 rounded-full"
              onClick={onPlayPause} disabled={isLoading}>
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5 text-primary-foreground" />
              ) : (
                <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
              )}
            </Button>
            <Button variant="ghost" size="sm"
              className="h-8 w-8 p-0 text-foreground hover:text-primary"
              onClick={onNext}>
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm"
              className={`h-8 w-8 p-0 ${isRepeat ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setIsRepeat(!isRepeat)}>
              <Repeat className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-muted-foreground">{formatTime(displayedCurrentTime)}</span>
            <Slider value={[progressPercentage]} onValueChange={handleProgressChange} max={100} step={0.1} className="flex-1" />
            <span className="text-xs text-muted-foreground">{formatTime(displayedDuration)}</span>
          </div>
        </div>

        {/* Volume & Lyrics */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Button variant="ghost" size="sm"
            className={`h-8 w-8 p-0 ${showNowPlaying ? 'text-primary' : 'text-muted-foreground'} hover:text-primary`}
            onClick={() => setShowNowPlaying(!showNowPlaying)} title="Now Playing">
            <Music2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMuted(!isMuted)}>
            {isMuted || volume[0] === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Slider value={isMuted ? [0] : volume} onValueChange={setVolume} max={100} step={1} className="w-24" />
        </div>
      </div>
    </>
  );
};
