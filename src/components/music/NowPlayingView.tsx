import { useSettings } from '@/contexts/SettingsContext';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AddToPlaylistButton } from './AddToPlaylistButton';
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
  Gauge,
} from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
}

interface SyncedLine {
  time: number; // seconds
  text: string;
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

const SCROLL_SPEEDS = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '1.5x', value: 1.5 },
  { label: '2x', value: 2 },
];

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
  const [syncedLines, setSyncedLines] = useState<SyncedLine[] | null>(null);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const activeLyricRef = useRef<HTMLParagraphElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const { lyricsAutoScroll } = useSettings();
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(lyricsAutoScroll);

  useEffect(() => {
    setAutoScrollEnabled(lyricsAutoScroll);
  }, [lyricsAutoScroll]);
  const [scrollSpeed, setScrollSpeed] = useState(1); // 1x default
  const [showSpeedControl, setShowSpeedControl] = useState(false);
  const plainScrollRef = useRef<number | null>(null);
  const userScrollRef = useRef(false);
  const userScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Parse LRC format: [mm:ss.xx] text -> { time, text }
  const parseSyncedLyrics = useCallback((lrc: string): SyncedLine[] => {
    const lines: SyncedLine[] = [];
    for (const line of lrc.split('\n')) {
      const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/);
      if (match) {
        const mins = parseInt(match[1]);
        const secs = parseInt(match[2]);
        const ms = parseInt(match[3].padEnd(3, '0'));
        const time = mins * 60 + secs + ms / 1000;
        const text = match[4].trim();
        if (text) lines.push({ time, text });
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }, []);

  // Find current active line index based on playback time with adaptive offset
  const activeLineIndex = useMemo(() => {
    if (!syncedLines || syncedLines.length === 0) return -1;
    // Use a small look-ahead so lyrics highlight just before the vocal starts
    const adjustedTime = currentTime + 0.3;
    let idx = -1;
    for (let i = 0; i < syncedLines.length; i++) {
      if (adjustedTime >= syncedLines[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [syncedLines, Math.floor(currentTime * 4)]); // update ~4 times per second for smoother tracking

  // Detect user manual scroll to temporarily disable auto-scroll
  useEffect(() => {
    const container = lyricsContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (!userScrollRef.current) {
        userScrollRef.current = true;
        setAutoScrollEnabled(false);
      }
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
      userScrollTimeoutRef.current = setTimeout(() => {
        userScrollRef.current = false;
        setAutoScrollEnabled(true);
      }, 4000);
    };
    container.addEventListener('wheel', handleScroll, { passive: true });
    container.addEventListener('touchmove', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('wheel', handleScroll);
      container.removeEventListener('touchmove', handleScroll);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    };
  }, [showLyrics, syncedLines, plainLyrics]);

  // Auto-scroll to active lyric line (synced mode)
  useEffect(() => {
    if (autoScrollEnabled && isSynced && activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex, autoScrollEnabled, isSynced]);

  // Auto-scroll for plain lyrics (no timestamps) — scroll at a constant rate
  useEffect(() => {
    if (plainScrollRef.current) {
      cancelAnimationFrame(plainScrollRef.current);
      plainScrollRef.current = null;
    }
    if (!autoScrollEnabled || !plainLyrics || !showLyrics || isSynced || !isPlaying) return;
    const container = lyricsContainerRef.current;
    if (!container) return;

    const pixelsPerSecond = 30 * scrollSpeed;
    let lastTime: number | null = null;

    const step = (timestamp: number) => {
      if (lastTime !== null) {
        const delta = (timestamp - lastTime) / 1000;
        container.scrollTop += pixelsPerSecond * delta;
      }
      lastTime = timestamp;
      plainScrollRef.current = requestAnimationFrame(step);
    };
    plainScrollRef.current = requestAnimationFrame(step);

    return () => {
      if (plainScrollRef.current) cancelAnimationFrame(plainScrollRef.current);
    };
  }, [autoScrollEnabled, plainLyrics, showLyrics, isSynced, isPlaying, scrollSpeed]);

  // Fetch lyrics when track changes or lyrics tab opened
  useEffect(() => {
    if (showLyrics && currentTrack) {
      fetchLyrics();
    }
  }, [currentTrack.videoId, showLyrics]);

  const fetchLyrics = async () => {
    setLyricsLoading(true);
    setLyricsError(null);
    setSyncedLines(null);
    setPlainLyrics(null);
    setIsSynced(false);

    const cleanTitle = currentTrack.title
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/official\s*(music\s*)?video/gi, '')
      .replace(/lyrics?\s*video/gi, '')
      .replace(/audio/gi, '')
      .replace(/hd|hq|4k|mv/gi, '')
      .replace(/\|.*$/g, '')
      .replace(/ft\.?|feat\.?/gi, '')
      .replace(/karao?ke/gi, '')
      .replace(/instrumental/gi, '')
      .replace(/backing\s*track/gi, '')
      .replace(/with\s*lyrics/gi, '')
      .replace(/piano\s*version/gi, '')
      .replace(/acoustic\s*version/gi, '')
      .replace(/cover/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const cleanArtist = currentTrack.artist
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .replace(/karao?ke/gi, '')
      .replace(/\|.*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    try {
      // 1. LRCLIB exact match (preserves synced lyrics)
      if (await tryLrclib(cleanArtist, cleanTitle)) return;

      // 2. LRCLIB search
      if (await tryLrclibSearch(`${cleanArtist} ${cleanTitle}`)) return;

      // 3. lyrics.ovh fallback (plain only)
      if (await tryLyricsOvh(cleanArtist, cleanTitle)) return;

      // 4. Shorter title attempts
      const shortTitle = cleanTitle.split(/[-|,]/)[0].trim();
      if (shortTitle !== cleanTitle && shortTitle.length > 2) {
        if (await tryLrclib(cleanArtist, shortTitle)) return;
        if (await tryLrclibSearch(shortTitle)) return;
        if (await tryLyricsOvh(cleanArtist, shortTitle)) return;
      }

      // 5. Try with just the title (no artist) for better matching
      if (cleanTitle.length > 3) {
        if (await tryLrclibSearch(cleanTitle)) return;
      }

      setLyricsError('Lyrics not available for this song');
    } catch {
      setLyricsError('Could not load lyrics');
    } finally {
      setLyricsLoading(false);
    }
  };

  const setLyricsFromLrc = (data: any): boolean => {
    if (data.syncedLyrics) {
      const parsed = parseSyncedLyrics(data.syncedLyrics);
      if (parsed.length > 0) {
        setSyncedLines(parsed);
        setIsSynced(true);
        return true;
      }
    }
    if (data.plainLyrics) {
      setPlainLyrics(data.plainLyrics.trim());
      setIsSynced(false);
      return true;
    }
    return false;
  };

  const tryLrclib = async (artist: string, title: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
        { headers: { 'User-Agent': 'Melodiya Music App v1.0' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (setLyricsFromLrc(data)) { setLyricsLoading(false); return true; }
      }
    } catch (e) { console.log('LRCLIB get failed:', e); }
    return false;
  };

  const tryLrclibSearch = async (query: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'Melodiya Music App v1.0' } }
      );
      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          const withSynced = results.find((r: any) => r.syncedLyrics);
          const best = withSynced || results[0];
          if (setLyricsFromLrc(best)) { setLyricsLoading(false); return true; }
        }
      }
    } catch (e) { console.log('LRCLIB search failed:', e); }
    return false;
  };

  const tryLyricsOvh = async (artist: string, title: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.lyrics) {
          setPlainLyrics(data.lyrics.trim());
          setIsSynced(false);
          setLyricsLoading(false);
          return true;
        }
      }
    } catch (e) { console.log('lyrics.ovh failed:', e); }
    return false;
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
      style={{
        background: 'radial-gradient(circle at 50% 35%, #303330, #080909 60%)',
      }}
    >
      {/* Blurred album art background */}
      <div className="absolute inset-0 overflow-hidden">
        <img src={currentTrack.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover scale-150 blur-[80px] opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-black/90" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-foreground/70 hover:text-foreground rounded-full" onClick={onClose}>
            <ChevronDown className="w-6 h-6" />
          </Button>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Now Playing on Sonora</p>
          </div>
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-foreground/70 hover:text-foreground rounded-full" onClick={() => setShowLyrics(!showLyrics)}>
            <Music2 className={`w-5 h-5 ${showLyrics ? 'text-primary' : ''}`} />
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col md:flex-row items-center justify-center px-6 gap-6 overflow-hidden min-h-0">
          {/* Album Art / Left Side */}
          <div className={`flex flex-col items-center gap-6 ${showLyrics ? 'md:w-1/2 w-full' : 'w-full'} transition-all duration-500`}>
            <div className={`relative ${showLyrics ? 'w-48 h-48 md:w-72 md:h-72' : 'w-64 h-64 md:w-80 md:h-80'} transition-all duration-500`}>
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className={`w-full h-full object-cover rounded-2xl shadow-2xl ${isPlaying ? 'animate-pulse-subtle' : ''}`}
                style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 80px rgba(216, 249, 155, 0.10)' }}
              />
              {isLoading && (
                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div className="text-center w-full max-w-sm">
              <h2 className="text-xl md:text-2xl font-bold truncate">{currentTrack.title}</h2>
              <p className="text-muted-foreground mt-1">{currentTrack.artist}</p>
            </div>
          </div>

          {/* Lyrics Panel */}
          {showLyrics && (
            <div className="md:w-1/2 w-full flex-1 min-h-0 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right duration-300">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Music2 className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Lyrics {isSynced && <span className="text-primary text-xs ml-1">• Synced</span>}
                  </h3>
                </div>
                {/* Scroll speed control */}
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                    onClick={() => setShowSpeedControl(!showSpeedControl)}
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    {scrollSpeed}x
                  </Button>
                  {showSpeedControl && (
                    <div className="absolute right-0 top-full mt-1 bg-card/90 backdrop-blur-xl border border-border/30 rounded-xl p-2 flex gap-1 z-50 shadow-xl">
                      {SCROLL_SPEEDS.map((s) => (
                        <Button
                          key={s.value}
                          variant={scrollSpeed === s.value ? 'default' : 'ghost'}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setScrollSpeed(s.value);
                            setShowSpeedControl(false);
                          }}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div ref={lyricsContainerRef} className="flex-1 overflow-y-auto pr-1 scroll-smooth scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
                    <Button variant="outline" size="sm" onClick={fetchLyrics}>Try Again</Button>
                  </div>
                )}

                {/* Synced Lyrics with highlighting */}
                {isSynced && syncedLines && !lyricsLoading && (
                  <div className="space-y-1 py-8">
                    <div className="h-24" />
                    {syncedLines.map((line, i) => {
                      const isActive = i === activeLineIndex;
                      const isPast = i < activeLineIndex;
                      return (
                        <p
                          key={i}
                          ref={isActive ? activeLyricRef : undefined}
                          className={`
                            text-lg md:text-xl leading-relaxed font-medium py-1.5 px-2 rounded-lg cursor-pointer
                            transition-all duration-300 ease-out
                            ${isActive
                              ? 'text-foreground scale-105 origin-left bg-primary/10'
                              : isPast
                                ? 'text-muted-foreground/40'
                                : 'text-muted-foreground/60 hover:text-muted-foreground/80'
                            }
                          `}
                          style={{
                            transform: isActive ? 'scale(1.05)' : 'scale(1)',
                            textShadow: isActive ? '0 0 20px rgba(216, 249, 155, 0.22)' : 'none',
                          }}
                          onClick={() => {
                            if (duration > 0) {
                              const seekPercent = (line.time / duration) * 100;
                              onSeek([seekPercent]);
                            }
                          }}
                        >
                          {line.text}
                        </p>
                      );
                    })}
                    <div className="h-48" />
                  </div>
                )}

                {/* Plain Lyrics (no timestamps) */}
                {!isSynced && plainLyrics && !lyricsLoading && (
                  <div className="space-y-0.5 pb-8">
                    {plainLyrics.split('\n').map((line, i) => (
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
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="px-6 pb-8 pt-4 space-y-4">
          <div className="space-y-2">
            <Slider value={[progressPercentage]} onValueChange={onSeek} max={100} step={0.1} className="w-full" />
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground font-mono">{formatTime(currentTime)}</span>
              <span className="text-xs text-muted-foreground font-mono">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between max-w-sm mx-auto w-full">
            <Button variant="ghost" size="sm" className={`h-10 w-10 p-0 rounded-full ${isShuffle ? 'text-primary' : 'text-muted-foreground'}`} onClick={onToggleShuffle}>
              <Shuffle className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-12 w-12 p-0 text-foreground hover:text-primary rounded-full" onClick={onPrevious}>
              <SkipBack className="w-7 h-7" />
            </Button>
            <Button size="lg" className="h-16 w-16 p-0 bg-foreground hover:bg-foreground/90 rounded-full shadow-xl" onClick={onPlayPause} disabled={isLoading}>
              {isLoading ? (
                <div className="w-7 h-7 border-2 border-background border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-8 h-8 text-background" />
              ) : (
                <Play className="w-8 h-8 text-background ml-1" />
              )}
            </Button>
            <Button variant="ghost" size="sm" className="h-12 w-12 p-0 text-foreground hover:text-primary rounded-full" onClick={onNext}>
              <SkipForward className="w-7 h-7" />
            </Button>
            <Button variant="ghost" size="sm" className={`h-10 w-10 p-0 rounded-full ${isRepeat ? 'text-primary' : 'text-muted-foreground'}`} onClick={onToggleRepeat}>
              <Repeat className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex items-center justify-between max-w-sm mx-auto w-full">
            <AddToPlaylistButton track={currentTrack} />
            <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${isLiked ? 'text-red-500' : 'text-muted-foreground'}`} onClick={onToggleLike}>
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" className={`h-8 w-8 p-0 ${showLyrics ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setShowLyrics(!showLyrics)}>
              <Music2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
