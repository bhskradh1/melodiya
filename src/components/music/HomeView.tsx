import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Music, TrendingUp, Clock, Sparkles } from 'lucide-react';
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
}

export const HomeView: React.FC<HomeViewProps> = ({ onPlayTrack }) => {
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchRecentlyPlayed();
    }
  }, [user]);

  const fetchRecentlyPlayed = async () => {
    try {
      const { data, error } = await supabase
        .from('recently_played')
        .select('*')
        .order('played_at', { ascending: false })
        .limit(6);

      if (error) throw error;

      const tracks = data?.map(item => ({
        id: item.id,
        title: item.title,
        artist: item.artist || 'Unknown Artist',
        thumbnail: item.thumbnail_url || '/placeholder.svg',
        videoId: item.youtube_video_id
      })) || [];

      setRecentlyPlayed(tracks);
    } catch (error) {
      console.error('Error fetching recently played:', error);
    } finally {
      setLoading(false);
    }
  };

  const popularTracks = [
    {
      id: '1',
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      thumbnail: '/placeholder.svg',
      videoId: '4NRXx6U8ABQ'
    },
    {
      id: '2',
      title: 'Watermelon Sugar',
      artist: 'Harry Styles',
      thumbnail: '/placeholder.svg',
      videoId: 'E07s5ZYygMg'
    },
    {
      id: '3',
      title: 'Good 4 U',
      artist: 'Olivia Rodrigo',
      thumbnail: '/placeholder.svg',
      videoId: 'gNi_6U5Pm_o'
    }
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Welcome Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-primary" />
          Welcome back!
        </h1>
        <p className="text-muted-foreground">
          Discover new music and continue where you left off
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card hover-lift cursor-pointer bg-gradient-primary text-primary-foreground">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Music className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold">Your Library</h3>
              <p className="text-primary-foreground/80 text-sm">Browse your saved music</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover-lift cursor-pointer bg-gradient-secondary text-accent-foreground">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold">Trending Now</h3>
              <p className="text-accent-foreground/80 text-sm">Popular songs today</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover-lift cursor-pointer">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Recently Played</h3>
              <p className="text-muted-foreground text-sm">Continue listening</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recently Played */}
      {recentlyPlayed.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Recently Played</h2>
            <Button variant="ghost" size="sm">View All</Button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {recentlyPlayed.map((track) => (
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
                  </div>
                  <div>
                    <h3 className="font-medium text-sm mb-1 truncate">{track.title}</h3>
                    <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Popular This Week */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Popular This Week</h2>
          <Button variant="ghost" size="sm">View All</Button>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {popularTracks.map((track) => (
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
                </div>
                <div>
                  <h3 className="font-medium text-sm mb-1 truncate">{track.title}</h3>
                  <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Music Categories */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Browse by Genre</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { name: 'Pop', color: 'bg-gradient-to-br from-pink-500 to-rose-500' },
            { name: 'Rock', color: 'bg-gradient-to-br from-red-500 to-orange-500' },
            { name: 'Hip Hop', color: 'bg-gradient-to-br from-purple-500 to-indigo-500' },
            { name: 'Electronic', color: 'bg-gradient-to-br from-cyan-500 to-blue-500' },
            { name: 'Jazz', color: 'bg-gradient-to-br from-amber-500 to-yellow-500' },
            { name: 'Classical', color: 'bg-gradient-to-br from-emerald-500 to-green-500' },
            { name: 'Country', color: 'bg-gradient-to-br from-orange-500 to-red-500' },
            { name: 'R&B', color: 'bg-gradient-to-br from-violet-500 to-purple-500' }
          ].map((genre) => (
            <Card key={genre.name} className={`${genre.color} hover-lift cursor-pointer text-white`}>
              <CardContent className="p-6 h-24 flex items-end">
                <h3 className="font-bold text-lg">{genre.name}</h3>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};