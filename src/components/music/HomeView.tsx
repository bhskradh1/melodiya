import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Music, TrendingUp, Clock, Heart, Search, Bell, ChevronRight } from 'lucide-react';
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
  onPlayTrack: (track: Track) => void;
  onViewChange?: (view: string) => void;
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

type TabId = 'all' | 'new' | 'hot' | 'picks';
const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New Artists' },
  { id: 'hot', label: 'Hot Tracks' },
  { id: 'picks', label: "Editor's Picks" },
];

const popularTracks: Track[] = [
  { id: '1', title: 'Blinding Lights', artist: 'The Weeknd', thumbnail: 'https://img.youtube.com/vi/4NRXx6U8ABQ/hqdefault.jpg', videoId: '4NRXx6U8ABQ' },
  { id: '2', title: 'Watermelon Sugar', artist: 'Harry Styles', thumbnail: 'https://img.youtube.com/vi/E07s5ZYygMg/hqdefault.jpg', videoId: 'E07s5ZYygMg' },
  { id: '3', title: 'Good 4 U', artist: 'Olivia Rodrigo', thumbnail: 'https://img.youtube.com/vi/gNi_6U5Pm_o/hqdefault.jpg', videoId: 'gNi_6U5Pm_o' },
  { id: '4', title: 'Save Your Tears', artist: 'The Weeknd', thumbnail: 'https://img.youtube.com/vi/XXYlFuWEuKI/hqdefault.jpg', videoId: 'XXYlFuWEuKI' },
  { id: '5', title: 'Levitating', artist: 'Dua Lipa', thumbnail: 'https://img.youtube.com/vi/TUVcZfQe-Kw/hqdefault.jpg', videoId: 'TUVcZfQe-Kw' },
];

/* ── Track row for Popular list ── */
const TrackRow: React.FC<{ track: Track; onPlay: (t: Track) => void }> = ({ track, onPlay }) => (
  <button
    onClick={() => onPlay(track)}
    className="group flex items-center gap-3 w-full rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.06] active:bg-white/[0.1]"
  >
    <img src={track.thumbnail} alt={track.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
    <div className="min-w-0 flex-1 text-left">
      <p className="text-sm font-medium truncate">{track.title}</p>
      <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
    </div>
    <div className="h-9 w-9 rounded-full border border-white/20 flex items-center justify-center opacity-60 group-hover:opacity-100 group-hover:border-primary group-hover:bg-primary/10 transition-all flex-shrink-0">
      <Play className="w-4 h-4 ml-0.5" />
    </div>
  </button>
);

/* ── Featured banner card ── */
const FeaturedCard: React.FC<{ title: string; subtitle: string; gradient: string; onClick: () => void }> = ({ title, subtitle, gradient, onClick }) => (
  <button
    onClick={onClick}
    className="relative flex-shrink-0 w-[260px] h-[150px] rounded-2xl overflow-hidden group"
    style={{ background: gradient }}
  >
    {/* decorative glow */}
    <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/10 blur-xl group-hover:scale-150 transition-transform duration-700" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
    <div className="relative z-10 flex flex-col justify-between h-full p-5">
      <div>
        <h3 className="text-white font-bold text-lg leading-tight">{title}</h3>
        <p className="text-white/70 text-xs mt-1 line-clamp-2">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-white bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
          Start Listening
        </span>
      </div>
    </div>
  </button>
);

export const HomeView: React.FC<HomeViewProps> = ({ onPlayTrack, onViewChange }) => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const greeting = useMemo(getGreeting, []);
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'there';

  useEffect(() => {
    if (user) fetchRecentlyPlayed();
    else setLoading(false);
  }, [user]);

  const fetchRecentlyPlayed = async () => {
    try {
      const { data, error } = await supabase
        .from('recently_played')
        .select('*')
        .eq('user_id', user?.id)
        .order('played_at', { ascending: false })
        .limit(8);
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

  return (
    <div className="relative min-h-full pb-28">
      {/* Ambient top glow */}
      <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/[0.08] blur-[120px]" />

      <div className="relative z-10 max-w-3xl mx-auto px-5 pt-6 space-y-7">
        {/* ── Header with avatar ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/30">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{greeting}</p>
              <h1 className="text-xl font-bold leading-tight">Hello, {displayName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
              onClick={() => onViewChange?.('search')}
            >
              <Search className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 rounded-full bg-white/[0.06] hover:bg-white/[0.12]"
            >
              <Bell className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* ── Pill tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                  : 'bg-white/[0.07] text-muted-foreground hover:bg-white/[0.12] hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── For you — featured cards ── */}
        <section className="space-y-3">
          <h2 className="text-base font-bold">For you</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5">
            <FeaturedCard
              title="Feel the Beat"
              subtitle="Explore trending tracks and hidden gems curated just for you."
              gradient="linear-gradient(135deg, hsl(280 80% 50%), hsl(250 90% 40%))"
              onClick={() => onViewChange?.('trending')}
            />
            <FeaturedCard
              title="Mood Mix"
              subtitle="Sweet tunes to match your vibe. Let the music speak."
              gradient="linear-gradient(135deg, hsl(200 80% 45%), hsl(260 70% 50%))"
              onClick={() => onViewChange?.('liked')}
            />
            <FeaturedCard
              title="Chill Zone"
              subtitle="Lo-fi beats and ambient tracks for focus and relaxation."
              gradient="linear-gradient(135deg, hsl(160 60% 40%), hsl(200 70% 35%))"
              onClick={() => onViewChange?.('library')}
            />
          </div>
        </section>

        {/* ── Recently played horizontal scroll ── */}
        {recentlyPlayed.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Recently Played</h2>
              <button
                onClick={() => onViewChange?.('recently-played')}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                Show all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5">
              {recentlyPlayed.map(track => (
                <button
                  key={track.id}
                  onClick={() => onPlayTrack(track)}
                  className="group flex-shrink-0 w-[120px] space-y-2"
                >
                  <div className="relative w-[120px] h-[120px] rounded-xl overflow-hidden">
                    <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg">
                        <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-medium truncate">{track.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{track.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── Popular list ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Popular</h2>
            <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
              Show all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-0.5">
            {popularTracks.map(track => (
              <TrackRow key={track.id} track={track} onPlay={onPlayTrack} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};