import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, TrendingUp, Music, Loader2, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchWeeklyTrending, getWeekKey } from '@/lib/trending';

interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  videoId: string;
  duration?: string;
}

interface TrendingViewProps {
  onPlayTrack: (track: Track, playlist?: Track[]) => void;
}

export const TrendingView: React.FC<TrendingViewProps> = ({ onPlayTrack }) => {
  const [trendingSongs, setTrendingSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const railRef = useRef<HTMLDivElement>(null);

  const load = async (force = false) => {
    setLoading(true);
    try {
      setTrendingSongs(await fetchWeeklyTrending(force));
    } catch (err) {
      console.error('Error fetching trending:', err);
      setTrendingSongs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const scrollRail = (dir: 1 | -1) => {
    railRef.current?.scrollBy({ left: dir * (railRef.current.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading this week's trending songs...</p>
        </div>
      </div>
    );
  }

  const top = trendingSongs.slice(0, 12);
  const rest = trendingSongs.slice(12);

  return (
    <div className="mx-auto max-w-[92rem] space-y-8 p-5 pb-32 md:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-300 to-zinc-700">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <div><p className="sonora-eyebrow">Global signal</p><h1 className="mt-1 font-[Manrope] text-3xl font-medium tracking-[-.045em] text-zinc-100 md:text-4xl">Trending this week</h1></div>
            <p className="text-xs md:text-sm text-muted-foreground">
              Chart week {getWeekKey()} · refreshes every Monday
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="rounded-full" onClick={() => load(true)}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {trendingSongs.length > 0 ? (
        <>
          {/* Swipeable top chart */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-[Manrope] text-xl font-medium text-zinc-200">Top of the week</h2>
              <div className="hidden md:flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => scrollRail(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => scrollRail(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div
              ref={railRef}
              className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-1"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {top.map((track, index) => (
                <button
                  key={track.id}
                  onClick={() => onPlayTrack(track, trendingSongs)}
                  className="group w-[138px] shrink-0 snap-start text-left sm:w-[158px]"
                >
                  <div className="relative aspect-square overflow-hidden rounded-2xl border border-foreground/[0.07]">
                    <img src={track.thumbnail} alt={track.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-zinc-300 to-zinc-700 text-xs font-bold text-zinc-950">
                      {index + 1}
                    </div>
                    <div className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100">
                      <Play className="ml-0.5 h-4 w-4 fill-current text-primary-foreground" />
                    </div>
                  </div>
                  <p className="mt-2.5 truncate text-sm font-semibold">{track.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{track.artist}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Remaining songs */}
          {rest.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-[Manrope] text-xl font-medium text-zinc-200">More trending</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                {rest.map((track, index) => (
                  <Card key={track.id} className="glass-card hover-lift group cursor-pointer" onClick={() => onPlayTrack(track, trendingSongs)}>
                    <CardContent className="p-4">
                      <div className="relative mb-3">
                        <img src={track.thumbnail} alt={track.title} loading="lazy" className="w-full aspect-square rounded-lg object-cover" />
                        <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                            <Play className="w-5 h-5 text-primary-foreground ml-0.5" />
                          </span>
                        </div>
                        <div className="absolute top-2 left-2 w-6 h-6 bg-gradient-to-br from-zinc-300 to-zinc-700 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-white">{index + 13}</span>
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
            </section>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <Music className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Could not load trending songs</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => load(true)}>Try Again</Button>
        </div>
      )}
    </div>
  );
};
