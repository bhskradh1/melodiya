import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, TrendingUp, Music, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface TrendingViewProps {
  onPlayTrack: (track: Track) => void;
}

export const TrendingView: React.FC<TrendingViewProps> = ({ onPlayTrack }) => {
  const [trendingSongs, setTrendingSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrendingSongs();
  }, []);

  const getTodayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  const getDailyQuery = () => {
    const d = new Date();
    // Day-of-year to rotate seed queries daily
    const start = new Date(d.getFullYear(), 0, 0);
    const diff = d.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const seeds = [
      'top trending songs today',
      'viral hits this week',
      'most played music right now',
      'global top hits',
      'trending pop songs',
      'trending hip hop songs',
      'new music releases this week',
      'billboard hot 100 this week',
      'tiktok viral songs',
      'youtube music trending',
    ];
    const seed = seeds[dayOfYear % seeds.length];
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${seed} ${dateStr}`;
  };

  const fetchTrendingSongs = async (force = false) => {
    setLoading(true);
    try {
      const todayKey = getTodayKey();
      const cacheKey = `trending_cache_${todayKey}`;

      // Use cached data for today unless forced refresh
      if (!force) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as Track[];
            if (Array.isArray(parsed) && parsed.length) {
              setTrendingSongs(parsed);
              setLoading(false);
              return;
            }
          } catch {}
        }
        // Clear stale caches from previous days
        Object.keys(localStorage)
          .filter((k) => k.startsWith('trending_cache_') && k !== cacheKey)
          .forEach((k) => localStorage.removeItem(k));
      }

      const { data, error } = await supabase.functions.invoke('youtube-search', {
        body: { query: getDailyQuery() }
      });
      if (error || !data?.tracks) {
        console.error('Error fetching trending:', error);
        setTrendingSongs([]);
      } else {
        const tracks = data.tracks as Track[];
        setTrendingSongs(tracks);
        try { localStorage.setItem(cacheKey, JSON.stringify(tracks)); } catch {}
      }
    } catch (err) {
      console.error('Error fetching trending:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading trending songs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Trending Now</h1>
            <p className="text-muted-foreground">
              The most popular songs this week on YouTube
            </p>
          </div>
        </div>
      </div>

      {/* Trending Songs Grid */}
      {trendingSongs.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {trendingSongs.map((track, index) => (
            <Card key={track.id} className="glass-card hover-lift group cursor-pointer">
              <CardContent className="p-4">
                <div className="relative mb-3">
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="w-full aspect-square rounded-lg object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      className="h-10 w-10 p-0 rounded-full bg-primary hover:bg-primary/90"
                      onClick={() => onPlayTrack(track)}
                    >
                      <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                    </Button>
                  </div>
                  {/* Trending rank badge */}
                  <div className="absolute top-2 left-2 w-6 h-6 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{index + 1}</span>
                  </div>
                </div>
                <div>
                  <h3 className="font-medium text-sm mb-1 truncate">{track.title}</h3>
                  <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Music className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Could not load trending songs</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchTrendingSongs}>Try Again</Button>
        </div>
      )}
    </div>
  );
};