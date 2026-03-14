import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Repeat,
  Shuffle,
  ChevronDown,
  Volume2,
  VolumeX,
  Music2,
  Loader2,
  Share2,
  ListMusic,
} from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface NowPlayingViewProps {
  isVisible: boolean;
  onClose: () => void;
  currentTrack: Track;
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  currentTime: number;
  duration: number;
  onSeek: (value: number[]) => void;
  isRepeat: boolean;
  isShuffle: boolean;
  isLiked: boolean;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleLike: () => void;
}

export const NowPlayingView: React.FC<NowPlayingViewProps> = ({
  isVisible,
  onClose,
  currentTrack,
  isPlaying,
  isLoading,
  onPlayPause,
  onNext,
  onPrevious,
  currentTime,
  duration,
  onSeek,
  isRepeat,
  isShuffle,
  isLiked,
  onToggleRepeat,
  onToggleShuffle,
  onToggleLike,
}) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [volume, setVolume] = useState([75]);
  const [isMuted, setIsMuted] = useState(false);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Fetch lyrics when track changes or lyrics tab opened
  useEffect(() => {
    if (showLyrics && currentTrack) {
      fetchLyrics();
    }
  }, [currentTrack.videoId, showLyrics]);

  const fetchLyrics = async () => {
    setLyricsLoading(true);
    setLyricsError(null);
    setLyrics(null);

    const cleanTitle = currentTrack.title
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/official\s*(music\s*)?video/gi, '')
      .replace(/lyrics?\s*video/gi, '')
      .replace(/audio/gi, '')
      .replace(/hd|hq|4k|mv/gi, '')
      .replace(/\|.*$/g, '')
      .replace(/ft\.?|feat\.?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const cleanArtist = currentTrack.artist
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .trim();

    try {
      // 1. Try LRCLIB (best free lyrics database, supports synced + plain lyrics)
      const lrcResult = await tryLrclib(cleanArtist, cleanTitle);
      if (lrcResult) { setLyrics(lrcResult); setLyricsLoading(false); return; }

      // 2. Try LRCLIB search (broader matching)
      const lrcSearchResult = await tryLrclibSearch(`${cleanArtist} ${cleanTitle}`);
      if (lrcSearchResult) { setLyrics(lrcSearchResult); setLyricsLoading(false); return; }

      // 3. Try lyrics.ovh as fallback
      const ovhResult = await tryLyricsOvh(cleanArtist, cleanTitle);
      if (ovhResult) { setLyrics(ovhResult); setLyricsLoading(false); return; }

      // 4. Try with shorter/simpler title
      const shortTitle = cleanTitle.split(/[-|,]/)[0].trim();
      if (shortTitle !== cleanTitle && shortTitle.length > 2) {
        const shortResult = await tryLrclib(cleanArtist, shortTitle);
        if (shortResult) { setLyrics(shortResult); setLyricsLoading(false); return; }
        
        const shortOvh = await tryLyricsOvh(cleanArtist, shortTitle);
        if (shortOvh) { setLyrics(shortOvh); setLyricsLoading(false); return; }
      }

      setLyricsError('Lyrics not available for this song');
    } catch {
      setLyricsError('Could not load lyrics');
    } finally {
      setLyricsLoading(false);
    }
  };

  const tryLrclib = async (artist: string, title: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
        { headers: { 'User-Agent': 'Melodiya Music App v1.0' } }
      );
      if (res.ok) {
        const data = await res.json();
        // Prefer synced lyrics, fall back to plain lyrics
        const lyricsText = data.syncedLyrics || data.plainLyrics;
        if (lyricsText) {
          // Clean synced lyrics timestamps if present: [00:12.34] Line -> Line
          return lyricsText.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]\s?/gm, '').trim();
        }
      }
    } catch (e) { console.log('LRCLIB get failed:', e); }
    return null;
  };

  const tryLrclibSearch = async (query: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'Melodiya Music App v1.0' } }
      );
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          const best = results[0];
          const lyricsText = best.syncedLyrics || best.plainLyrics;
          if (lyricsText) {
            return lyricsText.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]\s?/gm, '').trim();
          }
        }
      }
    } catch (e) { console.log('LRCLIB search failed:', e); }
    return null;
  };

  const tryLyricsOvh = async (artist: string, title: string): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.lyrics) return data.lyrics.trim();
      }
    } catch (e) { console.log('lyrics.ovh failed:', e); }
    return null;
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
      style={{
        background: `linear-gradient(180deg, hsl(280 60% 15%) 0%, hsl(215 30% 6%) 100%)`,
      }}
    >
      {/* Blurred album art background */}
      <div className="absolute inset-0 overflow-hidden">
        <img
          src={currentTrack.thumbnail}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-150 blur-[80px] opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/90" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-foreground/70 hover:text-foreground rounded-full"
            onClick={onClose}
          >
            <ChevronDown className="w-6 h-6" />
          </Button>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
              Now Playing
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-foreground/70 hover:text-foreground rounded-full"
            onClick={() => setShowLyrics(!showLyrics)}
          >
            <Music2 className={`w-5 h-5 ${showLyrics ? 'text-primary' : ''}`} />
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col md:flex-row items-center justify-center px-6 gap-6 overflow-hidden min-h-0">
          {/* Album Art / Left Side */}
          <div className={`flex flex-col items-center gap-6 ${showLyrics ? 'md:w-1/2 w-full' : 'w-full'} transition-all duration-500`}>
            {/* Album Art */}
            <div className={`relative ${showLyrics ? 'w-48 h-48 md:w-72 md:h-72' : 'w-64 h-64 md:w-80 md:h-80'} transition-all duration-500`}>
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className={`w-full h-full object-cover rounded-2xl shadow-2xl ${
                  isPlaying ? 'animate-pulse-subtle' : ''
                }`}
                style={{
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 80px rgba(168, 85, 247, 0.15)',
                }}
              />
              {isLoading && (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                </div>
              )}
            </div>

            {/* Track Info */}
            <div className="text-center w-full max-w-sm">
              <h2 className="text-xl md:text-2xl font-bold truncate">{currentTrack.title}</h2>
              <p className="text-muted-foreground mt-1">{currentTrack.artist}</p>
            </div>
          </div>

          {/* Lyrics Panel (right side on desktop, below on mobile) */}
          {showLyrics && (
            <div className="md:w-1/2 w-full flex-1 min-h-0 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right duration-300">
              <div className="flex items-center gap-2 mb-3">
                <Music2 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Lyrics</h3>
              </div>
              <ScrollArea className="flex-1 pr-4">
                {lyricsLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Finding lyrics...</p>
                  </div>
                )}
                {lyricsError && !lyricsLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Music2 className="w-12 h-12 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">{lyricsError}</p>
                    <Button variant="outline" size="sm" onClick={fetchLyrics}>
                      Try Again
                    </Button>
                  </div>
                )}
                {lyrics && !lyricsLoading && (
                  <div className="space-y-0.5 pb-8">
                    {lyrics.split('\n').map((line, i) => (
                      <p
                        key={i}
                        className={`text-base md:text-lg leading-relaxed ${
                          line.trim() === '' ? 'h-4' : 'text-foreground/80 hover:text-primary transition-colors'
                        }`}
                      >
                        {line || '\u00A0'}
                      </p>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="px-6 pb-8 pt-4 space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Slider
              value={[progressPercentage]}
              onValueChange={onSeek}
              max={100}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground font-mono">{formatTime(currentTime)}</span>
              <span className="text-xs text-muted-foreground font-mono">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Main Controls */}
          <div className="flex items-center justify-between max-w-sm mx-auto w-full">
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 w-10 p-0 rounded-full ${isShuffle ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={onToggleShuffle}
            >
              <Shuffle className="w-5 h-5" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-12 w-12 p-0 text-foreground hover:text-primary rounded-full"
              onClick={onPrevious}
            >
              <SkipBack className="w-7 h-7" />
            </Button>

            <Button
              size="lg"
              className="h-16 w-16 p-0 bg-foreground hover:bg-foreground/90 rounded-full shadow-xl"
              onClick={onPlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-7 h-7 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-8 h-8 text-background" />
              ) : (
                <Play className="w-8 h-8 text-background ml-1" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-12 w-12 p-0 text-foreground hover:text-primary rounded-full"
              onClick={onNext}
            >
              <SkipForward className="w-7 h-7" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={`h-10 w-10 p-0 rounded-full ${isRepeat ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={onToggleRepeat}
            >
              <Repeat className="w-5 h-5" />
            </Button>
          </div>

          {/* Secondary Actions */}
          <div className="flex items-center justify-between max-w-sm mx-auto w-full">
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`}
              onClick={onToggleLike}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 w-8 p-0 ${showLyrics ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => setShowLyrics(!showLyrics)}
            >
              <Music2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
