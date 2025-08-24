import React, { useEffect, useRef } from 'react';

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
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  isPlaying,
  onReady,
  onStateChange,
  onEnd
}) => {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
            onReady?.();
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

  useEffect(() => {
    if (playerRef.current && videoId) {
      console.log('Loading video:', videoId);
      playerRef.current.loadVideoById(videoId);
    }
  }, [videoId]);

  useEffect(() => {
    if (playerRef.current) {
      if (isPlaying) {
        console.log('Playing video');
        playerRef.current.playVideo();
      } else {
        console.log('Pausing video');
        playerRef.current.pauseVideo();
      }
    }
  }, [isPlaying]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'absolute', 
        top: '-9999px', 
        left: '-9999px',
        width: '1px',
        height: '1px' 
      }}
    />
  );
};