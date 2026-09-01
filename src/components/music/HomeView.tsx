import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Play, Music, TrendingUp, Clock, Heart, ChevronRight, ChevronLeft, Mic2, Loader2, Search, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { fetchWeeklyTrending } from '@/lib/trending';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePreferences } from '@/contexts/PreferencesContext';
import { fetchPersonalizedRows, type RecommendationRow } from '@/lib/recommendations';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface HomeViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
  onViewChange?: (view: string) => void;
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const KARAOKE_SEARCHES = [
  { name: 'Pop Hits', emoji: '🎤', query: 'karaoke pop hits 2025' },
  { name: 'Bollywood', emoji: '🎬', query: 'karaoke bollywood songs' },
  { name: 'Rock Classics', emoji: '🎸', query: 'karaoke rock classics' },
  { name: 'R&B / Soul', emoji: '🎶', query: 'karaoke r&b soul songs' },
  { name: 'EDM / Dance', emoji: '🎹', query: 'karaoke edm dance' },
  { name: 'Country', emoji: '🤠', query: 'karaoke country songs' },
  { name: 'K-Pop', emoji: '💜', query: 'karaoke kpop songs' },
  { name: 'Lo-Fi Chill', emoji: '🌙', query: 'karaoke lofi chill songs' },
] as const;

/* ─────────── sub-components ─────────── */

const TrackCard: React.FC<{ track: Track; onPlay: (t: Track) => void; index: number }> = ({ track, onPlay, index }) => (
  <button
    onClick={() => onPlay(track)}
    className="group w-[150px] sm:w-[168px] shrink-0 snap-start text-left"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-foreground/[0.07] bg-card/40 shadow-[0_10px_30px_-14px_hsl(var(--background))]">
      <img
        src={track.thumbnail}
        alt={track.title}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/10 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-90" />
      <div className="absolute bottom-2.5 right-2.5 flex h-10 w-10 translate-y-3 items-center justify-center rounded-full bg-primary opacity-0 shadow-[0_8px_24px_-6px_hsl(var(--primary))] transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <Play className="ml-0.5 h-4 w-4 fill-current text-primary-foreground" />
      </div>
    </div>
    <div className="mt-2.5 min-w-0 px-0.5">
      <p className="truncate text-sm font-semibold leading-snug">{track.title}</p>
      <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
    </div>
  </button>
);

const Row: React.FC<{
  title: string;
  subtitle?: string;
  onViewAll?: () => void;
  showArrows?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, onViewAll, showArrows, children }) => {
  const railRef = React.useRef<HTMLDivElement>(null);
  const scrollRail = (dir: 1 | -1) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showArrows && (
            <div className="hidden md:flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Scroll left"
                className="h-8 w-8 rounded-full p-0"
                onClick={() => scrollRail(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Scroll right"
                className="h-8 w-8 rounded-full p-0"
                onClick={() => scrollRail(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          {onViewAll && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-xs text-muted-foreground hover:text-foreground"
              onClick={onViewAll}
            >
              View all <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      <div
        ref={railRef}
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-1 md:-mx-8 md:px-8"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>
    </section>
  );
};

const Chip: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }> = ({
  icon,
  label,
  onClick,
  active,
}) => (
  <button
    onClick={onClick}
    className={`group flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 ${
      active
        ? 'border-transparent bg-gradient-primary text-primary-foreground shadow-[0_10px_30px_-12px_hsl(var(--primary))]'
        : 'border-foreground/[0.08] bg-foreground/[0.04] text-foreground hover:border-primary/40 hover:bg-foreground/[0.08]'
    }`}
  >
    <span className={active ? '' : 'text-primary'}>{icon}</span>
    {label}
  </button>
);

/* ─────────── main component ─────────── */

export const HomeView: React.FC<HomeViewProps> = ({ onPlayTrack, onViewChange }) => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [karaokeLoading, setKaraokeLoading] = useState<string | null>(null);
  const [karaokeQuery, setKaraokeQuery] = useState('');
  const [karaokeSearchLoading, setKaraokeSearchLoading] = useState(false);
  const [personalRows, setPersonalRows] = useState<RecommendationRow[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [featIndex, setFeatIndex] = useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const { user } = useAuth();
  const { preferences, version } = usePreferences();
  const greeting = useMemo(getGreeting, []);

  const topFive = trendingTracks.slice(0, 5);
  const featured = topFive[featIndex] ?? topFive[0] ?? null;
  const restTrending = trendingTracks.slice(5);

  const moveFeatured = useCallback(
    (dir: 1 | -1) => {
      setFeatIndex((i) => {
        const len = Math.max(topFive.length, 1);
        return (i + dir + len) % len;
      });
    },
    [topFive.length]
  );

  useEffect(() => {
    let cancelled = false;
    setPersonalLoading(true);
    fetchPersonalizedRows(preferences)
      .then((rows) => {
        if (!cancelled) setPersonalRows(rows);
      })
      .catch((e) => console.error('Personalized rows failed:', e))
      .finally(() => {
        if (!cancelled) setPersonalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preferences, version]);

  const handleKaraokeCustomSearch = useCallback(async () => {
    const q = karaokeQuery.trim();
    if (!q) return;
    setKaraokeSearchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: `karaoke ${q}` },
      });
      if (!error && data?.tracks && data.tracks.length > 0) {
        onPlayTrack(data.tracks[0], data.tracks);
      }
    } catch (err) {
      console.error('Karaoke search error:', err);
    } finally {
      setKaraokeSearchLoading(false);
    }
  }, [karaokeQuery, onPlayTrack]);

  useEffect(() => {
    if (user) fetchRecentlyPlayed();
    fetchTrending();
  }, [user]);

  const fetchRecentlyPlayed = async () => {
    try {
      const { data, error } = await supabase
        .from('recently_played')
        .select('*')
        .eq('user_id', user?.id)
        .order('played_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setRecentlyPlayed(
        (data ?? []).map(item => ({
          id: item.id,
          title: item.title,
          artist: item.artist || 'Unknown Artist',
          thumbnail: item.thumbnail_url || '/placeholder.svg',
          videoId: item.youtube_video_id,
        }))
      );
    } catch (error) {
      console.error('Error fetching recently played:', error);
    }
  };

  const fetchTrending = async () => {
    setTrendingLoading(true);
    try {
      const tracks = await fetchWeeklyTrending();
      setTrendingTracks(tracks.slice(0, 20) as Track[]);
    } catch (err) {
      console.error('Error fetching trending:', err);
      setTrendingTracks([]);
    } finally {
      setTrendingLoading(false);
    }
  };

  const handleKaraokeSearch = async (search: typeof KARAOKE_SEARCHES[number]) => {
    setKaraokeLoading(search.name);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: search.query },
      });
      if (!error && data?.tracks && data.tracks.length > 0) {
        onPlayTrack(data.tracks[0], data.tracks);
      }
    } catch (err) {
      console.error('Error fetching karaoke:', err);
    } finally {
      setKaraokeLoading(null);
    }
  };

  return (
    <div className="relative min-h-full overflow-x-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/4 h-[460px] w-[460px] rounded-full bg-primary/20 blur-[140px]" />
      <div className="pointer-events-none absolute top-32 right-0 h-[360px] w-[360px] rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-10 p-5 md:p-8 pb-32">
        {/* ── Greeting ── */}
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">{greeting}</p>
            <h1 className="mt-1 text-3xl md:text-[2.6rem] font-bold leading-[1.05]">
              What do you want to
              <span className="bg-gradient-primary bg-clip-text text-transparent"> hear</span>?
            </h1>
          </div>
        </header>

        {/* ── Featured hero slider (top 5 of the week) ── */}
        <section
          className="relative overflow-hidden rounded-[28px] border border-foreground/[0.08] bg-card/40 backdrop-blur-2xl shadow-[0_28px_80px_-40px_hsl(var(--background))]"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 45) moveFeatured(dx < 0 ? 1 : -1);
            touchStartX.current = null;
          }}
        >
          {featured && (
            <img
              src={featured.thumbnail}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-25 blur-2xl"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-background/60 to-background/90" />

          <div className="relative z-10 flex flex-col gap-6 p-6 md:flex-row md:items-center md:gap-8 md:p-9">
            <div className="relative mx-auto aspect-square w-40 shrink-0 overflow-hidden rounded-2xl shadow-[0_24px_60px_-24px_hsl(var(--primary))] md:mx-0 md:w-48">
              {trendingLoading || !featured ? (
                <div className="h-full w-full animate-pulse bg-foreground/10" />
              ) : (
                <img src={featured.thumbnail} alt={featured.title} className="h-full w-full object-cover" />
              )}
            </div>

            <div className="min-w-0 flex-1 text-center md:text-left">
              <div className="flex items-center justify-center gap-2 md:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary backdrop-blur-xl">
                  <Sparkles className="h-3 w-3" /> Featured today
                </span>
                {topFive.length > 1 && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {featIndex + 1}/{topFive.length}
                  </span>
                )}
              </div>
              <h2 className="mt-3 truncate text-2xl md:text-4xl font-bold">
                {featured ? featured.title : 'Loading picks…'}
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {featured ? featured.artist : 'Fresh tracks are on the way'}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
                <Button
                  size="lg"
                  disabled={!featured}
                  onClick={() => featured && onPlayTrack(featured, trendingTracks)}
                  className="rounded-full bg-gradient-primary px-7 font-semibold text-primary-foreground shadow-[0_14px_40px_-14px_hsl(var(--primary))] transition-transform hover:scale-[1.03]"
                >
                  <Play className="mr-2 h-4 w-4 fill-current" /> Play now
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => onViewChange?.('trending')}
                  className="rounded-full border-foreground/15 bg-foreground/[0.04] px-6 backdrop-blur-xl hover:bg-foreground/[0.09]"
                >
                  Explore trending
                </Button>
              </div>

              {topFive.length > 1 && (
                <div className="mt-5 flex items-center justify-center gap-2 md:justify-start">
                  {topFive.map((t, i) => (
                    <button
                      key={t.id}
                      aria-label={`Show featured track ${i + 1}`}
                      onClick={() => setFeatIndex(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === featIndex ? 'w-6 bg-primary' : 'w-1.5 bg-foreground/25 hover:bg-foreground/40'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {topFive.length > 1 && (
            <>
              <button
                aria-label="Previous featured track"
                onClick={() => moveFeatured(-1)}
                className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-foreground/10 bg-background/60 p-2 backdrop-blur-xl transition-colors hover:bg-background/80 md:flex"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                aria-label="Next featured track"
                onClick={() => moveFeatured(1)}
                className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-foreground/10 bg-background/60 p-2 backdrop-blur-xl transition-colors hover:bg-background/80 md:flex"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </section>


        {/* ── Quick chips ── */}
        <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 md:-mx-8 md:px-8">
          <Chip icon={<Music className="h-4 w-4" />} label="Your Library" onClick={() => onViewChange?.('library')} active />
          <Chip icon={<TrendingUp className="h-4 w-4" />} label="Trending" onClick={() => onViewChange?.('trending')} />
          <Chip icon={<Heart className="h-4 w-4" />} label="Liked Songs" onClick={() => onViewChange?.('liked')} />
          <Chip icon={<Clock className="h-4 w-4" />} label="Recently Played" onClick={() => onViewChange?.('recently-played')} />
        </div>

        {/* ── Jump back in ── */}
        {recentlyPlayed.length > 0 && (
          <Row title="Jump back in" subtitle="Pick up where you left off" onViewAll={() => onViewChange?.('recently-played')}>
            {recentlyPlayed.map((track, i) => (
              <TrackCard key={track.id} track={track} onPlay={onPlayTrack} index={i} />
            ))}
          </Row>
        )}

        {/* ── Popular this week ── */}
        <Row title="Popular this week" subtitle="What everyone is streaming" showArrows onViewAll={() => onViewChange?.('trending')}>
          {trendingLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-[150px] shrink-0 sm:w-[168px]">
                  <div className="aspect-square w-full animate-pulse rounded-2xl bg-foreground/[0.06]" />
                  <div className="mt-2.5 h-3 w-4/5 animate-pulse rounded bg-foreground/[0.06]" />
                  <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded bg-foreground/[0.05]" />
                </div>
              ))
            : restTrending.length > 0
            ? restTrending.map((track, i) => <TrackCard key={track.id} track={track} onPlay={onPlayTrack} index={i} />)
            : <p className="py-8 text-sm text-muted-foreground">Could not load trending songs</p>}
        </Row>

        {/* ── Personalized rows ── */}
        {personalLoading && personalRows.length === 0 ? (
          <Row title="Made for you" subtitle="Tuning to your taste…" showArrows>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[150px] shrink-0 sm:w-[168px]">
                <div className="aspect-square w-full animate-pulse rounded-2xl bg-foreground/[0.06]" />
                <div className="mt-2.5 h-3 w-4/5 animate-pulse rounded bg-foreground/[0.06]" />
                <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded bg-foreground/[0.05]" />
              </div>
            ))}
          </Row>
        ) : (
          personalRows.map((row) => (
            <Row key={row.key} title={row.title} subtitle={row.subtitle} showArrows onViewAll={() => onViewChange?.('settings')}>
              {row.tracks.map((track, i) => (
                <TrackCard key={`${row.key}-${track.id}`} track={track as Track} onPlay={(t) => onPlayTrack(t, row.tracks as Track[])} index={i} />
              ))}
            </Row>
          ))
        )}

        {/* ── Karaoke shortcut ── */}
        <button
          type="button"
          onClick={() => onViewChange?.('karaoke')}
          className="flex w-full items-center gap-3 rounded-[28px] border border-foreground/[0.08] bg-card/35 p-5 text-left backdrop-blur-2xl transition-transform hover:-translate-y-0.5 md:p-7"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-[0_10px_28px_-12px_hsl(var(--primary))]">
            <Mic2 className="h-4 w-4 text-primary-foreground" />
          </span>
          <div className="flex-1">
            <h2 className="text-xl font-bold">Karaoke Zone</h2>
            <p className="text-xs text-muted-foreground">Sing along with synced lyrics</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

      </div>
    </div>
  );
};
