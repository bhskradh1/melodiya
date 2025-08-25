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
  const [apiLoaded, setApiLoaded] = useState(false);
  const [playerInitialized, setPlayerInitialized] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => playerRef.current);

  // Load YouTube IFrame API with better error handling
  useEffect(() => {
    // Check for common browser compatibility issues
    const checkBrowserCompatibility = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(userAgent);
      const isOldBrowser = /msie|trident/i.test(userAgent);
      
      console.log('Browser compatibility check:');
      console.log('- User Agent:', navigator.userAgent);
      console.log('- Is Mobile:', isMobile);
      console.log('- Is Old Browser:', isOldBrowser);
      console.log('- Supports ES6:', typeof Promise !== 'undefined');
      console.log('- Supports fetch:', typeof fetch !== 'undefined');
      
      if (isOldBrowser) {
        setError('Your browser is not supported. Please use a modern browser like Chrome, Firefox, or Edge.');
        return false;
      }
      
      return true;
    };

    // Check network connectivity
    const checkNetworkConnectivity = async () => {
      try {
        const response = await fetch('https://www.youtube.com/favicon.ico', { 
          method: 'HEAD',
          mode: 'no-cors'
        });
        console.log('Network connectivity check passed');
        return true;
      } catch (error) {
        console.warn('Network connectivity check failed:', error);
        return false;
      }
    };

    const loadYouTubeAPI = async () => {
      return new Promise<void>(async (resolve, reject) => {
        // Check browser compatibility first
        if (!checkBrowserCompatibility()) {
          reject(new Error('Browser not compatible'));
          return;
        }

        // Check network connectivity
        const isNetworkOk = await checkNetworkConnectivity();
        if (!isNetworkOk) {
          console.warn('Network connectivity issues detected, but continuing with API load');
        }

        // Check if API is already loaded
        if (window.YT && window.YT.Player) {
          console.log('YouTube API already loaded');
          setApiLoaded(true);
          resolve();
          return;
        }

        console.log('Loading YouTube IFrame API...');
        console.log('Current origin:', window.location.origin);
        console.log('User agent:', navigator.userAgent);

        // Set up the callback for when API is ready
        window.onYouTubeIframeAPIReady = () => {
          console.log('YouTube IFrame API loaded successfully');
          setApiLoaded(true);
          resolve();
        };

        // Create and load the script
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.crossOrigin = 'anonymous';
        
        // Handle script loading errors
        tag.onerror = () => {
          console.error('Failed to load YouTube IFrame API script');
          setError('Failed to load YouTube player - check internet connection');
          reject(new Error('Failed to load YouTube IFrame API'));
        };

        // Handle script load success
        tag.onload = () => {
          console.log('YouTube IFrame API script loaded successfully');
        };

        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
          console.log('YouTube IFrame API script tag inserted');
        } else {
          console.error('No script tags found for YouTube API insertion');
          reject(new Error('No script tags found'));
        }

        // Timeout after 15 seconds for slower connections
        setTimeout(() => {
          if (!window.YT) {
            console.error('YouTube IFrame API loading timeout after 15 seconds');
            setError('YouTube player loading timeout - please refresh the page');
            reject(new Error('YouTube IFrame API loading timeout'));
          }
        }, 15000);
      });
    };

    loadYouTubeAPI()
      .then(() => {
        console.log('YouTube API loaded, initializing player...');
        // Give a small delay to ensure API is fully ready
        setTimeout(() => {
          initializePlayer();
        }, 200);
      })
      .catch((err) => {
        console.error('Error loading YouTube API:', err);
        if (err.message !== 'Browser not compatible') {
          setError('Failed to initialize YouTube player - please refresh the page');
        }
      });
  }, []);

  const initializePlayer = () => {
    if (!containerRef.current || !window.YT || !window.YT.Player) {
      console.error('Cannot initialize player: missing dependencies');
      return;
    }

    try {
      console.log('Initializing YouTube player...');
      
      // Check if we're on mobile and handle accordingly
      const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|windows phone/i.test(navigator.userAgent);
      console.log('Device type:', isMobile ? 'Mobile' : 'Desktop');
      
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
          origin: window.location.origin,
          // Mobile-specific optimizations
          ...(isMobile && {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            // Ensure mobile compatibility
            origin: window.location.origin,
          }),
        },
        events: {
          onReady: (event: any) => {
            console.log('YouTube player ready');
            setPlayerInitialized(true);
            setError(null);
            
            // On mobile, give extra time for the player to stabilize
            const readyDelay = isMobile ? 500 : 200;
            setTimeout(() => {
              onReady?.();
            }, readyDelay);
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
            
            // Common YouTube error codes and their meanings
            let errorMessage = `Player error: ${event.data}`;
            switch (event.data) {
              case 2:
                errorMessage = 'Invalid video ID or video not available';
                break;
              case 5:
                errorMessage = 'HTML5 player error - try refreshing the page';
                break;
              case 100:
                errorMessage = 'Video not found or removed';
                break;
              case 101:
                errorMessage = 'Video not embeddable';
                break;
              case 150:
                errorMessage = 'Video not embeddable';
                break;
              default:
                errorMessage = `Player error (${event.data}) - please try again`;
            }
            
            setError(errorMessage);
            
            // Retry initialization on certain errors
            if (event.data === 2 || event.data === 5 || event.data === 100) {
              console.log('Retrying player initialization due to error:', event.data);
              setTimeout(() => {
                if (retryCount < 3) {
                  setRetryCount(prev => prev + 1);
                  reinitializePlayer();
                } else {
                  setError('Maximum retry attempts reached. Please refresh the page.');
                }
              }, 2000);
            }
          }
        }
      });
    } catch (err) {
      console.error('Error creating YouTube player:', err);
      setError('Failed to create player');
    }
  };

  const reinitializePlayer = () => {
    console.log('Reinitializing YouTube player...');
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (err) {
        console.error('Error destroying player:', err);
      }
      playerRef.current = null;
    }
    setPlayerInitialized(false);
    
    // Wait a bit before reinitializing
    setTimeout(() => {
      initializePlayer();
    }, 1000);
  };

  const startTimeTracking = () => {
    stopTimeTracking(); // Clear any existing interval
    
    intervalRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && typeof playerRef.current.getDuration === 'function') {
        try {
          const currentTime = playerRef.current.getCurrentTime();
          const duration = playerRef.current.getDuration();
          
          if (duration > 0) {
            onTimeUpdate?.(currentTime, duration);
          }
        } catch (err) {
          console.error('Error getting time info:', err);
          stopTimeTracking();
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

  // Handle video ID changes
  useEffect(() => {
    if (playerRef.current && videoId && playerInitialized) {
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
        }, 200);
      } catch (error) {
        console.error('Error loading video:', error);
        setError('Failed to load video');
      }
    }
  }, [videoId, playerInitialized]);

  // Handle play/pause state changes
  useEffect(() => {
    if (playerRef.current && playerInitialized) {
      try {
        if (isPlaying) {
          console.log('Playing video');
          playerRef.current.playVideo();
          console.log('Play command sent');
        } else {
          console.log('Pausing video');
          playerRef.current.pauseVideo();
          console.log('Pause command sent');
        }
      } catch (error) {
        console.error('Error controlling playback:', error);
        setError('Failed to control playback');
      }
    }
  }, [isPlaying, playerInitialized]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimeTracking();
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (err) {
          console.error('Error destroying player:', err);
        }
      }
    };
  }, []);

  // Show error state if there are issues
  if (error) {
    return (
      <div 
        style={{ 
          position: 'absolute', 
          top: '-9999px', 
          left: '-9999px',
          width: '1px',
          height: '1px' 
        }}
      >
        <div className="text-red-500 text-xs">{error}</div>
      </div>
    );
  }

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
});

YouTubePlayer.displayName = 'YouTubePlayer';