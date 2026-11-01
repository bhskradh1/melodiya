import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Music, TrendingUp, Clock, Heart, ChevronRight, ChevronLeft, Mic2, Sparkles } from 'lucide-react';
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
  onSearchQuery?: (query: string) => void;
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};


/* ─────────── sub-components ─────────── */

const TrackCard: React.FC<{ track: Track; onPlay: (t: Track) => void; index: number }> = ({ track, onPlay, index }) => (
  <button
    type="button"
    onClick={() => onPlay(track)}
    className="group w-[138px] shrink-0 snap-start text-left sm:w-[158px]"
    style={{ animationDelay: `${index * 45}ms` }}
  >
    <span className="cover relative aspect-square w-full rounded-2xl">
      <img src={track.thumbnail || '/placeholder.svg'} alt={track.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
      <span className="cover-shine" />
      <span className="absolute bottom-2 right-2 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-zinc-100 text-zinc-950 opacity-0 shadow-xl transition-all group-hover:translate-y-0 group-hover:opacity-100">
        <Play className="ml-0.5 h-4 w-4 fill-current" />
      </span>
    </span>
    <span className="mt-3 block min-w-0 px-0.5">
      <span className="block truncate text-[12px] font-semibold leading-snug text-zinc-200">{track.title}</span>
      <span className="mt-1 block truncate text-[11px] text-zinc-500">{track.artist}</span>
    </span>
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
    <section className="mt-11 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {subtitle && <p className="sonora-eyebrow mb-1">{subtitle}</p>}
          <h2 className="font-[Manrope] text-xl font-medium tracking-[-.035em] text-zinc-200 md:text-2xl">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showArrows && <div className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" aria-label="Scroll left" className="h-8 w-8 rounded-full p-0 text-zinc-500 hover:bg-white/[.06] hover:text-zinc-100" onClick={() => scrollRail(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" aria-label="Scroll right" className="h-8 w-8 rounded-full p-0 text-zinc-500 hover:bg-white/[.06] hover:text-zinc-100" onClick={() => scrollRail(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>}
          {onViewAll && <button type="button" onClick={onViewAll} className="flex items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-200">View all <ChevronRight className="h-3 w-3" /></button>}
        </div>
      </div>
      <div ref={railRef} className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:-mx-10 md:px-10" style={{ WebkitOverflowScrolling: 'touch' }}>{children}</div>
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

export const HomeView: React.FC<HomeViewProps> = ({ onPlayTrack, onViewChange, onSearchQuery }) => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [personalRows, setPersonalRows] = useState<RecommendationRow[]>([]);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [featIndex, setFeatIndex] = useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const { user } = useAuth();
  const { preferences, version, loading: preferencesLoading } = usePreferences();
  const greeting = useMemo(getGreeting, []);

  const topFive = trendingTracks.slice(0, 5);
  const featured = topFive[featIndex] ?? topFive[0] ?? null;
  const restTrending = trendingTracks.slice(5);
  const quickPickTracks = (recentlyPlayed.length ? recentlyPlayed : trendingTracks).slice(0, 5);
  const quickPickLabels = ['Daily Mix 01', 'Discover Weekly', 'Release Radar', 'Night Drive', 'Deep Focus'];
  const popularArtists = Array.from(new Map([...trendingTracks, ...recentlyPlayed].map((track) => [track.artist, track])).values()).slice(0, 6);

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
    if (preferencesLoading) return;
    let cancelled = false;
    setPersonalLoading(true);
    // Home recommendations are cache-only; opening Home must not issue searches.
    fetchPersonalizedRows(preferences, false, false)
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
  }, [preferences, version, preferencesLoading]);


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


  const listenerName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'listener';

  const moods = [
    { name: 'Late night', caption: 'Midnight electronics', style: 'after', query: 'late night electronic music' },
    { name: 'Deep focus', caption: 'Minimal and immersive', style: 'orbit', query: 'deep focus ambient music' },
    { name: 'Slow mornings', caption: 'Warm and unhurried', style: 'glass', query: 'slow morning acoustic music' },
    { name: 'Night drive', caption: 'Motion after dark', style: 'chrome', query: 'night drive synthwave music' },
    { name: 'Quiet hours', caption: 'Soft ambient spaces', style: 'nocturne', query: 'quiet ambient instrumental music' },
  ];

  return (
    <div className="relative min-h-full overflow-x-hidden">
      <div className="pointer-events-none absolute -top-36 left-[28%] h-[420px] w-[420px] rounded-full bg-white/[.035] blur-[150px]" />
      <div className="pointer-events-none absolute right-0 top-72 h-[340px] w-[340px] rounded-full bg-lime-100/[.025] blur-[130px]" />

      <div className="relative z-10 mx-auto max-w-[92rem] space-y-0 px-5 pb-32 pt-4 md:px-10 md:pt-6">
        <header className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="sonora-eyebrow">{getGreeting()}</p>
            <h1 className="mt-2 font-[Manrope] text-[2rem] font-medium leading-[1.05] tracking-[-.055em] text-zinc-100 md:text-[2.75rem]">What do you want to hear?</h1>
            <p className="mt-3 text-xs text-zinc-500 md:text-sm">A little space for the music that moves with you.</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/[.08] bg-white/[.025] px-3 py-2 text-[9px] font-medium uppercase tracking-[.18em] text-zinc-500 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-200 shadow-[0_0_10px_rgba(216,249,155,.6)]" /> Your listening space
          </div>
        </header>

        <section aria-label="Quick picks" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
          <button type="button" onClick={() => onViewChange?.('liked')} className="group flex min-w-0 items-center overflow-hidden rounded-xl border border-white/[.08] bg-white/[.055] text-left transition hover:bg-white/[.09]">
            <span className="grid h-14 w-14 shrink-0 place-items-center bg-gradient-to-br from-zinc-200 to-zinc-600 text-zinc-950 md:h-16 md:w-16"><Heart className="h-5 w-5 fill-current" /></span>
            <span className="min-w-0 flex-1 truncate px-3 text-xs font-semibold text-zinc-200 md:text-sm">Liked Songs</span>
            <span className="mr-3 hidden h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-950 shadow-lg group-hover:grid"><Play className="h-3.5 w-3.5 fill-current" /></span>
          </button>
          {quickPickTracks.map((track, index) => (
            <button key={track.videoId} type="button" onClick={() => onPlayTrack(track, quickPickTracks)} className="group flex min-w-0 items-center overflow-hidden rounded-xl border border-white/[.08] bg-white/[.055] text-left transition hover:bg-white/[.09]">
              <img src={track.thumbnail || '/placeholder.svg'} alt="" className="h-14 w-14 shrink-0 object-cover md:h-16 md:w-16" loading="lazy" />
              <span className="min-w-0 flex-1 px-3">
                <strong className="block truncate text-xs font-semibold text-zinc-200 md:text-sm">{quickPickLabels[index]}</strong>
                <small className="mt-1 block truncate text-[10px] text-zinc-600">{track.artist}</small>
              </span>
              <span className="mr-3 hidden h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-950 shadow-lg group-hover:grid"><Play className="h-3.5 w-3.5 fill-current" /></span>
            </button>
          ))}
        </section>

        <section className="relative mt-8 min-h-[20rem] overflow-hidden rounded-[1.4rem] border border-white/[.09] bg-[linear-gradient(112deg,rgba(32,34,33,.97),rgba(14,15,15,.94))] shadow-2xl shadow-black/30 md:min-h-[22rem]">
          {featured && <img src={featured.thumbnail} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-[.10] blur-3xl" />}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(15,16,16,.97),rgba(15,16,16,.78)_52%,rgba(9,10,10,.35))]" />
          <div className="relative z-10 max-w-xl px-6 py-10 md:px-12 md:py-12">
            <div className="mb-4 flex items-center gap-2 text-[9px] font-semibold tracking-[.22em] text-zinc-400"><span className="h-1.5 w-1.5 rounded-full bg-lime-200 shadow-[0_0_12px_rgba(216,249,155,.6)]" /> FEATURED MIX</div>
            <h2 className="font-[Manrope] text-4xl font-medium leading-[.98] tracking-[-.055em] text-zinc-100 md:text-6xl">Metallic<br /><span className="bg-gradient-to-r from-zinc-100 to-zinc-500 bg-clip-text text-transparent">memories.</span></h2>
            <p className="mt-4 max-w-sm text-xs leading-6 text-zinc-400 md:text-sm">A hand-picked starting point from your current listening world.{featured ? ` Featuring ${featured.artist}.` : ''}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" disabled={!featured} onClick={() => featured && onPlayTrack(featured, trendingTracks)} className="h-11 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-400 px-5 text-xs font-semibold text-zinc-950 shadow-xl hover:brightness-110"><Play className="mr-2 h-4 w-4 fill-current" /> Play mix</Button>
              <Button type="button" variant="outline" onClick={() => onViewChange?.('trending')} className="h-11 rounded-full border-white/15 bg-white/[.035] px-5 text-xs text-zinc-300 hover:bg-white/[.08] hover:text-white">Explore trending</Button>
            </div>
          </div>
          <div className="vinyl-art hidden sm:block"><span /><i /><b>S<br /><small>01</small></b></div>
          {featured && <div className="absolute bottom-5 right-5 z-10 hidden items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur-xl md:flex"><img src={featured.thumbnail} alt="" className="h-11 w-11 rounded-lg object-cover" /><span className="max-w-36"><strong className="block truncate text-[10px] text-zinc-200">{featured.title}</strong><small className="mt-1 block truncate text-[9px] text-zinc-500">{featured.artist}</small></span></div>}
        </section>

        {(recentlyPlayed.length > 0 || trendingTracks.length > 0) && (
          <Row title="Recently played" subtitle="Jump back in" onViewAll={() => onViewChange?.('recently-played')} showArrows>
            {(recentlyPlayed.length ? recentlyPlayed : trendingTracks).slice(0, 8).map((track, index) => (
              <TrackCard key={track.videoId} track={track} onPlay={(item) => onPlayTrack(item, recentlyPlayed.length ? recentlyPlayed : trendingTracks)} index={index} />
            ))}
          </Row>
        )}

        <Row title="Made for you" subtitle={listenerName ? `Only for ${listenerName}` : 'Only for you'} onViewAll={() => onViewChange?.('search')} showArrows>
          {personalLoading && personalRows.length === 0
            ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="w-[138px] shrink-0 sm:w-[158px]"><div className="aspect-square animate-pulse rounded-2xl bg-white/[.045]" /><div className="mt-3 h-3 w-4/5 animate-pulse rounded bg-white/[.045]" /><div className="mt-2 h-2 w-1/2 animate-pulse rounded bg-white/[.035]" /></div>)
            : personalRows.length > 0
              ? personalRows.slice(0, 2).flatMap((row) => row.tracks).slice(0, 8).map((track, index) => (
                  <TrackCard key={track.id} track={track as Track} onPlay={(item) => {
                    const row = personalRows.find((candidate) => candidate.tracks.some((candidateTrack) => candidateTrack.id === item.id));
                    onPlayTrack(item, row?.tracks as Track[] | undefined);
                  }} index={index} />
                ))
              : trendingTracks.slice(0, 8).map((track, index) => <TrackCard key={track.videoId} track={track} onPlay={(item) => onPlayTrack(item, trendingTracks)} index={index} />)}
        </Row>

        <section className="mt-11">
          <div><p className="sonora-eyebrow">Your sound map</p><h2 className="mt-1 font-[Manrope] text-xl font-medium text-zinc-200">Browse by mood</h2></div>
          <div className="no-scrollbar mt-5 flex gap-3 overflow-x-auto pb-2">
            {moods.map((mood) => <button key={mood.name} type="button" onClick={() => onSearchQuery?.(mood.query)} className={`cover cover-${mood.style} relative min-h-32 w-52 shrink-0 overflow-hidden rounded-2xl p-5 text-left transition hover:-translate-y-0.5`}><span className="relative z-10"><strong className="block font-[Manrope] text-lg text-zinc-100">{mood.name}</strong><small className="mt-1 block text-xs text-zinc-300/60">{mood.caption}</small></span><span className="cover-shine" /></button>)}
          </div>
        </section>

        <section className="mt-11">
          <div><p className="sonora-eyebrow">Community favorites</p><h2 className="mt-1 font-[Manrope] text-xl font-medium text-zinc-200">Popular artists</h2></div>
          <div className="mt-5 grid grid-cols-3 gap-5 sm:grid-cols-4 lg:grid-cols-6">
            {popularArtists.map((track) => <button key={track.artist} type="button" onClick={() => onSearchQuery?.(track.artist)} className="min-w-0 text-center" aria-label={`Search for ${track.artist}`}><span className="cover mx-auto aspect-square w-full max-w-28 rounded-full"><img src={track.thumbnail || '/placeholder.svg'} alt="" className="h-full w-full object-cover" loading="lazy" /><span className="cover-shine" /></span><strong className="mt-3 block truncate text-xs text-zinc-300">{track.artist}</strong><small className="mt-1 block text-[10px] text-zinc-600">Artist</small></button>)}
          </div>
        </section>

        <button type="button" onClick={() => onViewChange?.('karaoke')} className="mt-11 flex w-full items-center gap-4 rounded-2xl border border-white/[.08] bg-white/[.025] p-5 text-left transition hover:-translate-y-0.5 hover:bg-white/[.05] md:p-7">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-zinc-200 to-zinc-500 text-zinc-950"><Mic2 className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><strong className="block font-[Manrope] text-lg font-medium text-zinc-200">Karaoke room</strong><small className="mt-1 block text-xs text-zinc-500">Sing along with synced lyrics</small></span>
          <ChevronRight className="h-5 w-5 text-zinc-600" />
        </button>
      </div>
    </div>
  );
};
