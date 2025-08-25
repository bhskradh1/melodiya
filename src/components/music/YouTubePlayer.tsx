import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

interface YouTubePlayerProps {
  videoId: string | null;
  isPlaying: boolean;
  onReady: () => void;
  onStateChange: (event: any) => void;
  onError?: (error: string) => void;
}

export interface YouTubePlayerRef {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadVideoById: (videoId: string) => void;
  cueVideoById: (videoId: string) => void;
  destroy: () => void;
}

const YouTubePlayer = forwardRef<YouTubePlayerRef, YouTubePlayerProps>(
  ({ videoId, isPlaying, onReady, onStateChange, onError }, ref) => {
    const playerRef = useRef<YT.Player | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      playVideo: () => {
        if (playerRef.current) {
          playerRef.current.playVideo();
        }
      },
      pauseVideo: () => {
        if (playerRef.current) {
          playerRef.current.pauseVideo();
        }
      },
      stopVideo: () => {
        if (playerRef.current) {
          playerRef.current.stopVideo();
        }
      },
      seekTo: (seconds: number, allowSeekAhead: boolean) => {
        if (playerRef.current) {
          playerRef.current.seekTo(seconds, allowSeekAhead);
        }
      },
      setVolume: (volume: number) => {
        if (playerRef.current) {
          playerRef.current.setVolume(volume);
        }
      },
      getCurrentTime: () => {
        if (playerRef.current) {
          return playerRef.current.getCurrentTime();
        }
        return 0;
      },
      getDuration: () => {
        if (playerRef.current) {
          return playerRef.current.getDuration();
        }
        return 0;
      },
      loadVideoById: (videoId: string) => {
        if (playerRef.current) {
          playerRef.current.loadVideoById(videoId);
        }
      },
      cueVideoById: (videoId: string) => {
        if (playerRef.current) {
          playerRef.current.cueVideoById(videoId);
        }
      },
      destroy: () => {
        if (playerRef.current) {
          playerRef.current.destroy();
        }
      }
    }));

    useEffect(() => {
      // Load YouTube IFrame API
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }

      // Initialize player when API is ready
      const onYouTubeIframeAPIReady = () => {
        if (containerRef.current && videoId) {
          playerRef.current = new window.YT.Player(containerRef.current, {
            height: '0',
            width: '0',
            videoId: videoId,
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              enablejsapi: 1,
              fs: 0,
              iv_load_policy: 3,
              modestbranding: 1,
              rel: 0,
              showinfo: 0,
              playsinline: 1
            },
            events: {
              onReady: onReady,
              onStateChange: onStateChange,
              onError: (event: any) => {
                console.error('YouTube player error:', event);
                onError?.(`YouTube error: ${event.data}`);
              }
            }
          });
        }
      };

      if (window.YT && window.YT.Player) {
        onYouTubeIframeAPIReady();
      } else {
        window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
      }

      return () => {
        if (playerRef.current) {
          playerRef.current.destroy();
        }
      };
    }, []);

    useEffect(() => {
      if (playerRef.current && videoId) {
        if (isPlaying) {
          playerRef.current.playVideo();
        } else {
          playerRef.current.pauseVideo();
        }
      }
    }, [videoId, isPlaying]);

    return <div ref={containerRef} />;
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';

export default YouTubePlayer;