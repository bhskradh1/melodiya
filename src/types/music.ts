import React from 'react';

export interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

export interface MusicPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  playlist?: Track[];
  currentIndex?: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSongEnd?: () => void;
}

export interface YouTubePlayerProps {
  videoId: string | null;
  isPlaying: boolean;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onEnd?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}
