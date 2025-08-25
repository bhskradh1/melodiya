import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string | null;
  isPlaying: boolean;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onEnd?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export const YouTubePlayer = forwardRef<any, YouTubePlayerProps>(({
  videoId,
  isPlaying,
  onReady,
  onStateChange,
  onEnd,
  onTimeUpdate
}, ref) => {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useImperativeHandle(ref, () => playerRef.current);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = initializePlayer;
    } else {
      initializePlayer();
    }
  }, []);

  const initializePlayer = () => {
    if (containerRef.current && window.YT && window.YT.Player) {
      console.log('Initializing YouTube player...');
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: '0',
        width: '0',
        videoId: videoId || '',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
        },
        events: {
          onReady: (event: any) => {
            console.log('YouTube player ready');
            // Ensure the player is fully initialized
            setTimeout(() => {
              onReady?.();
            }, 100);
          },
          onStateChange: (event: any) => {
            console.log('YouTube player state changed:', event.data);
            onStateChange?.(event.data);
            
            // YouTube Player States:
            // -1 (unstarted)
            // 0 (ended)
            // 1 (playing)
            // 2 (paused)
            // 3 (buffering)
            // 5 (video cued)
            
            if (event.data === 1) { // playing
              startTimeTracking();
            } else if (event.data === 2 || event.data === 0) { // paused or ended
              stopTimeTracking();
            }
            
            if (event.data === 0) { // ended
              onEnd?.();
            }
          },
          onError: (event: any) => {
            console.error('YouTube player error:', event.data);
          }
        }
      });
    }
  };

  const startTimeTracking = () => {
    stopTimeTracking(); // Clear any existing interval
    
    intervalRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && typeof playerRef.current.getDuration === 'function') {
        const currentTime = playerRef.current.getCurrentTime();
        const duration = playerRef.current.getDuration();
        
        if (duration > 0) {
          onTimeUpdate?.(currentTime, duration);
        }
      }
    }, 1000);
  };

  const stopTimeTracking = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopTimeTracking();
    };
  }, []);

  useEffect(() => {
    if (playerRef.current && videoId) {
      console.log('Loading video:', videoId);
      try {
        // First cue the video to ensure it's loaded
        playerRef.current.cueVideoById(videoId);
        console.log('Video cue command sent for:', videoId);
        
        // Then load it for immediate playback if needed
        setTimeout(() => {
          if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
            playerRef.current.loadVideoById(videoId);
            console.log('Video load command sent for:', videoId);
          }
        }, 100);
      } catch (error) {
        console.error('Error loading video:', error);
      }
    }
  }, [videoId]);

  useEffect(() => {
    if (playerRef.current) {
      if (isPlaying) {
        console.log('Playing video');
        try {
          playerRef.current.playVideo();
          console.log('Play command sent');
        } catch (error) {
          console.error('Error playing video:', error);
        }
      } else {
        console.log('Pausing video');
        try {
          playerRef.current.pauseVideo();
          console.log('Pause command sent');
        } catch (error) {
          console.error('Error pausing video:', error);
        }
      }
    }
  }, [isPlaying]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'fixed',
        top: '-100vh', 
        left: '-100vw',
        width: '1px',
        height: '1px',
        opacity: 0,
        visibility: 'hidden',
        zIndex: -9999,
        pointerEvents: 'none',
        overflow: 'hidden',
        transform: 'translateZ(0)', // Force hardware acceleration
        WebkitTransform: 'translateZ(0)', // iOS Safari specific
        display: 'block', // Ensure it's not affecting layout
        maxWidth: '1px',
        maxHeight: '1px'
      }}
    />
  );
});

YouTubePlayer.displayName = 'YouTubePlayer';
