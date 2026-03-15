import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Music, TrendingUp, Clock, Sparkles, Heart, Headphones, Radio, ChevronRight, Mic2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

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
  { name: 'Pop Hits', emoji: '🎤', query: 'karaoke pop hits 2025', from: '340 80% 55%', to: '320 85% 45%' },
  { name: 'Bollywood', emoji: '🎬', query: 'karaoke bollywood songs', from: '10 80% 55%', to: '25 90% 48%' },
  { name: 'Rock Classics', emoji: '🎸', query: 'karaoke rock classics', from: '265 85% 55%', to: '280 80% 45%' },
  { name: 'R&B / Soul', emoji: '🎶', query: 'karaoke r&b soul songs', from: '195 90% 50%', to: '210 95% 40%' },
  { name: 'EDM / Dance', emoji: '🎹', query: 'karaoke edm dance', from: '38 90% 50%', to: '28 85% 42%' },
  { name: 'Country', emoji: '🤠', query: 'karaoke country songs', from: '155 70% 45%', to: '140 75% 35%' },
  { name: 'K-Pop', emoji: '💜', query: 'karaoke kpop songs', from: '275 75% 55%', to: '290 80% 42%' },
  { name: 'Lo-Fi Chill', emoji: '🌙', query: 'karaoke lofi chill songs', from: '220 60% 50%', to: '235 55% 38%' },
] as const;

/* ─────────── small sub-components ─────────── */

const TrackCard: React.FC<{ track: Track; onPlay: (t: Track) => void; index: number }> = ({ track, onPlay, index }) => (
  <button
    onClick={() => onPlay(track)}
    className="group relative flex flex-col gap-3 rounded-2xl bg-card/40 p-3 backdrop-blur-md border border-border/20 hover:border-primary/30 transition-all duration-300 hover:bg-card/70 hover:-translate-y-1 hover:shadow-[0_8px_30px_-12px_hsl(280_100%_70%/0.25)] text-left"
    style={{ animationDelay: `${index * 60}ms` }}
  >
    <div className="relative aspect-square w-full overflow-hidden rounded-xl">
      <img src={track.thumbnail} alt={track.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute bottom-2 right-2 h-10 w-10 flex items-center justify-center rounded-full bg-primary shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
        <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
      </div>
    </div>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{track.title}</p>
      <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
    </div>
  </button>
);

const QuickAction: React.FC<{ icon: React.ReactNode; label: string; sub: string; onClick: () => void; gradient?: string }> = ({ icon, label, sub, onClick, gradient }) => (
  <button
    onClick={onClick}
    className={`group relative flex items-center gap-4 rounded-2xl p-4 md:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg overflow-hidden ${gradient ?? 'bg-card/50 border border-border/20 hover:border-primary/30'}`}
  >
    {gradient && <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_top_right,hsl(280_100%_70%/0.15),transparent_60%)]" />}
    <div className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${gradient ? 'bg-white/15' : 'bg-primary/10'}`}>
      {icon}
    </div>
    <div className="relative z-10 min-w-0 text-left">
      <p className="text-sm font-semibold">{label}</p>
      <p className={`text-xs ${gradient ? 'opacity-75' : 'text-muted-foreground'}`}>{sub}</p>
    </div>
    <ChevronRight className="relative z-10 ml-auto h-4 w-4 opacity-0 group-hover:opacity-60 transition-opacity" />
  </button>
);

const SectionHeader: React.FC<{ title: string; onViewAll?: () => void }> = ({ title, onViewAll }) => (
  <div className="flex items-center justify-between">
    <h2 className="text-lg md:text-xl font-bold tracking-tight">{title}</h2>
    {onViewAll && (
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" onClick={onViewAll}>
        View all <ChevronRight className="ml-1 h-3 w-3" />
      </Button>
    )}
  </div>
);

/* ─────────── main component ─────────── */

export const HomeView: React.FC<HomeViewProps> = ({ onPlayTrack, onViewChange }) => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [karaokeLoading, setKaraokeLoading] = useState<string | null>(null);
  const { user } = useAuth();
  const greeting = useMemo(getGreeting, []);

  useEffect(() => {
    if (user) fetchRecentlyPlayed();
    else setLoading(false);
    fetchTrending();
  }, [user]);

  const fetchRecentlyPlayed = async () => {
    try {
      const { data, error } = await supabase
        .from('recently_played')
        .select('*')
        .eq('user_id', user?.id)
        .order('played_at', { ascending: false })
        .limit(6);

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
    } finally {
      setLoading(false);
    }
  };

  const fetchTrending = async () => {
    setTrendingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: 'trending music songs this week 2025' }
      });
      if (error || !data?.tracks) {
        console.error('Error fetching trending:', error);
        setTrendingTracks([]);
      } else {
        setTrendingTracks((data.tracks as Track[]).slice(0, 6));
      }
    } catch (err) {
      console.error('Error fetching trending:', err);
    } finally {
      setTrendingLoading(false);
    }
  };

  const handleKaraokeSearch = async (search: typeof KARAOKE_SEARCHES[number]) => {
    setKaraokeLoading(search.name);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: search.query }
      });
      if (!error && data?.tracks && data.tracks.length > 0) {
        // Play first karaoke track and pass all as playlist
        onPlayTrack(data.tracks[0], data.tracks);
      }
    } catch (err) {
      console.error('Error fetching karaoke:', err);
    } finally {
      setKaraokeLoading(null);
    }
  };

  return (
    <div className="relative min-h-full">
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute -top-32 left-1/3 h-[420px] w-[420px] rounded-full bg-primary/[0.06] blur-[120px]" />
      <div className="pointer-events-none absolute top-20 right-0 h-[320px] w-[320px] rounded-full bg-accent/[0.05] blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-10 p-5 md:p-8 pb-32">
        {/* ── Hero greeting ── */}
        <section className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">{greeting}</p>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            What do you want to
            <span className="bg-gradient-primary bg-clip-text text-transparent"> listen</span> to?
          </h1>
        </section>

        {/* ── Quick actions ── */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            icon={<Music className="h-5 w-5 text-primary-foreground" />}
            label="Your Library"
            sub="Saved music"
            onClick={() => onViewChange?.('library')}
            gradient="bg-gradient-primary text-primary-foreground"
          />
          <QuickAction
            icon={<TrendingUp className="h-5 w-5 text-accent-foreground" />}
            label="Trending"
            sub="Hot right now"
            onClick={() => onViewChange?.('trending')}
            gradient="bg-gradient-secondary text-accent-foreground"
          />
          <QuickAction
            icon={<Heart className="h-5 w-5 text-primary" />}
            label="Liked Songs"
            sub="Your favorites"
            onClick={() => onViewChange?.('liked')}
          />
          <QuickAction
            icon={<Clock className="h-5 w-5 text-primary" />}
            label="Recently Played"
            sub="Pick up where you left"
            onClick={() => onViewChange?.('recently-played')}
          />
        </section>

        {/* ── Recently played ── */}
        {recentlyPlayed.length > 0 && (
          <section className="space-y-5">
            <SectionHeader title="Jump back in" onViewAll={() => onViewChange?.('recently-played')} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {recentlyPlayed.map((track, i) => (
                <TrackCard key={track.id} track={track} onPlay={onPlayTrack} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ── Popular this week (YouTube Trending) ── */}
        <section className="space-y-5">
          <SectionHeader title="Popular this week" onViewAll={() => onViewChange?.('trending')} />
          {trendingLoading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading trending...</p>
            </div>
          ) : trendingTracks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {trendingTracks.map((track, i) => (
                <TrackCard key={track.id} track={track} onPlay={onPlayTrack} index={i} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Could not load trending songs</p>
          )}
        </section>

        {/* ── Karaoke Zone ── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <Mic2 className="w-5 h-5 text-primary" />
            <SectionHeader title="Karaoke Zone" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {KARAOKE_SEARCHES.map((k) => (
              <button
                key={k.name}
                onClick={() => handleKaraokeSearch(k)}
                disabled={karaokeLoading === k.name}
                className="group relative h-24 md:h-28 overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70"
                style={{
                  background: `linear-gradient(135deg, hsl(${k.from}), hsl(${k.to}))`,
                }}
              >
                {/* Decorative circle */}
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 transition-transform duration-500 group-hover:scale-150" />
                <div className="relative z-10 flex h-full flex-col justify-between p-4">
                  <span className="text-2xl">{karaokeLoading === k.name ? <Loader2 className="w-6 h-6 animate-spin text-white" /> : k.emoji}</span>
                  <span className="text-sm font-bold text-white drop-shadow-md">{k.name}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};