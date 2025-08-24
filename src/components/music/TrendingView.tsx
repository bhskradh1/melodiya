import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, TrendingUp, Music } from 'lucide-react';

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

  const fetchTrendingSongs = async () => {
    // Simulate API call for trending songs
    // In a real app, this would fetch from your backend
    setTimeout(() => {
      const trending = [
        {
          id: 'trending-1',
          title: 'Blinding Lights',
          artist: 'The Weeknd',
          thumbnail: '/placeholder.svg',
          videoId: '4NRXx6U8ABQ'
        },
        {
          id: 'trending-2',
          title: 'Watermelon Sugar',
          artist: 'Harry Styles',
          thumbnail: '/placeholder.svg',
          videoId: 'E07s5ZYygMg'
        },
        {
          id: 'trending-3',
          title: 'Good 4 U',
          artist: 'Olivia Rodrigo',
          thumbnail: '/placeholder.svg',
          videoId: 'gNi_6U5Pm_o'
        },
        {
          id: 'trending-4',
          title: 'Levitating',
          artist: 'Dua Lipa',
          thumbnail: '/placeholder.svg',
          videoId: 'TUVcZfQe-Kw'
        },
        {
          id: 'trending-5',
          title: 'Stay',
          artist: 'Kid LAROI & Justin Bieber',
          thumbnail: '/placeholder.svg',
          videoId: 'kTJczUoc26U'
        },
        {
          id: 'trending-6',
          title: 'As It Was',
          artist: 'Harry Styles',
          thumbnail: '/placeholder.svg',
          videoId: 'H5v3kku4y6Q'
        },
        {
          id: 'trending-7',
          title: 'Shivers',
          artist: 'Ed Sheeran',
          thumbnail: '/placeholder.svg',
          videoId: 'Il0S8BoucSA'
        },
        {
          id: 'trending-8',
          title: 'We Don\'t Talk About Bruno',
          artist: 'Carolina Gaitán, Mauro Castillo',
          thumbnail: '/placeholder.svg',
          videoId: 'bvWRMAU6V-c'
        },
        {
          id: 'trending-9',
          title: 'Bad Habit',
          artist: 'Steve Lacy',
          thumbnail: '/placeholder.svg',
          videoId: 'H5v3kku4y6Q'
        },
        {
          id: 'trending-10',
          title: 'Late Night Talking',
          artist: 'Harry Styles',
          thumbnail: '/placeholder.svg',
          videoId: 'H5v3kku4y6Q'
        },
        {
          id: 'trending-11',
          title: 'Hold Me Closer',
          artist: 'Elton John & Britney Spears',
          thumbnail: '/placeholder.svg',
          videoId: 'H5v3kku4y6Q'
        },
        {
          id: 'trending-12',
          title: 'Unholy',
          artist: 'Sam Smith & Kim Petras',
          thumbnail: '/placeholder.svg',
          videoId: 'H5v3kku4y6Q'
        }
      ];
      setTrendingSongs(trending);
      setLoading(false);
    }, 1000);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
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
              The most popular songs right now
            </p>
          </div>
        </div>
      </div>

      {/* Trending Songs Grid */}
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

      {/* Categories */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Trending by Genre</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'Pop', count: '2.5M', color: 'bg-gradient-to-br from-pink-500 to-rose-500' },
            { name: 'Hip Hop', count: '1.8M', color: 'bg-gradient-to-br from-purple-500 to-indigo-500' },
            { name: 'Rock', count: '1.2M', color: 'bg-gradient-to-br from-red-500 to-orange-500' },
            { name: 'Electronic', count: '950K', color: 'bg-gradient-to-br from-cyan-500 to-blue-500' }
          ].map((genre) => (
            <Card key={genre.name} className={`${genre.color} hover-lift cursor-pointer text-white`}>
              <CardContent className="p-4 h-20 flex items-end justify-between">
                <div>
                  <h3 className="font-bold text-sm">{genre.name}</h3>
                  <p className="text-white/80 text-xs">{genre.count} plays</p>
                </div>
                <Music className="w-6 h-6 text-white/60" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
