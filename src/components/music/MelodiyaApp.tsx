import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { MusicPlayer } from './MusicPlayer';
import { Track } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function MelodiyaApp() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [volume, setVolume] = useState(75);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('none');
  const [shuffleMode, setShuffleMode] = useState(false);
  const [likedTracks, setLikedTracks] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    fetchLikedTracks();
  }, []);

  const fetchLikedTracks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: likedData } = await supabase
          .from('liked_songs')
          .select('track_id')
          .eq('user_id', user.id);
        
        if (likedData) {
          const likedIds = new Set(likedData.map(item => item.track_id));
          setLikedTracks(likedIds);
        }
      }
    } catch (error) {
      console.error('Error fetching liked tracks:', error);
    }
  };

  const handlePlayTrack = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    
    // Find track index in playlist
    const index = playlist.findIndex(t => t.id === track.id);
    if (index !== -1) {
      setCurrentIndex(index);
    }
  };

  const handlePlayPause = () => {
    if (currentTrack) {
      setIsPlaying(!isPlaying);
    }
  };

  const handleNext = () => {
    if (playlist.length === 0) return;

    let nextIndex = currentIndex + 1;
    
    if (repeatMode === 'one') {
      // Stay on same track
      nextIndex = currentIndex;
    } else if (repeatMode === 'all' && nextIndex >= playlist.length) {
      // Loop back to start
      nextIndex = 0;
    } else if (nextIndex >= playlist.length) {
      // End of playlist
      setIsPlaying(false);
      return;
    }

    setCurrentIndex(nextIndex);
    setCurrentTrack(playlist[nextIndex]);
    setIsPlaying(true);
  };

  const handlePrevious = () => {
    if (playlist.length === 0) return;

    let prevIndex = currentIndex - 1;
    
    if (repeatMode === 'one') {
      // Stay on same track
      prevIndex = currentIndex;
    } else if (repeatMode === 'all' && prevIndex < 0) {
      // Loop to end
      prevIndex = playlist.length - 1;
    } else if (prevIndex < 0) {
      // Beginning of playlist
      return;
    }

    setCurrentIndex(prevIndex);
    setCurrentTrack(playlist[prevIndex]);
    setIsPlaying(true);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const handleTrackSelect = (track: Track) => {
    const index = playlist.findIndex(t => t.id === track.id);
    if (index !== -1) {
      setCurrentIndex(index);
      setCurrentTrack(track);
      setIsPlaying(true);
    }
  };

  const handleToggleLike = async (track: Track) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "Please log in to like tracks",
          variant: "destructive"
        });
        return;
      }

      const isLiked = likedTracks.has(track.id);
      
      if (isLiked) {
        // Unlike
        await supabase
          .from('liked_songs')
          .delete()
          .eq('user_id', user.id)
          .eq('track_id', track.id);
        
        setLikedTracks(prev => {
          const newSet = new Set(prev);
          newSet.delete(track.id);
          return newSet;
        });
        
        toast({
          title: "Removed from Liked Songs",
          description: `${track.title} has been removed from your liked songs`,
        });
      } else {
        // Like
        await supabase
          .from('liked_songs')
          .insert({
            user_id: user.id,
            track_id: track.id
          });
        
        setLikedTracks(prev => new Set(prev).add(track.id));
        
        toast({
          title: "Added to Liked Songs",
          description: `${track.title} has been added to your liked songs`,
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update liked status",
        variant: "destructive"
      });
    }
  };

  const handleToggleRepeat = () => {
    setRepeatMode(prev => {
      switch (prev) {
        case 'none': return 'all';
        case 'all': return 'one';
        case 'one': return 'none';
        default: return 'none';
      }
    });
  };

  const handleToggleShuffle = () => {
    setShuffleMode(!shuffleMode);
  };

  const isLiked = currentTrack ? likedTracks.has(currentTrack.id) : false;

  return (
    <div className="flex h-screen bg-background">
      <Sidebar 
        onPlayTrack={handlePlayTrack}
        onSetPlaylist={setPlaylist}
        onSetCurrentTrack={setCurrentTrack}
        onSetIsPlaying={setIsPlaying}
        onSetCurrentIndex={setCurrentIndex}
      />
      
      <div className="flex-1 flex flex-col">
        <main className="flex-1 overflow-y-auto p-6">
          {/* Main content area - will be filled by child components */}
        </main>
        
        {currentTrack && (
          <MusicPlayer
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            volume={volume}
            currentTime={currentTime}
            duration={duration}
            playlist={playlist}
            currentIndex={currentIndex}
            onTrackSelect={handleTrackSelect}
            onToggleLike={handleToggleLike}
            isLiked={isLiked}
            onToggleRepeat={handleToggleRepeat}
            onToggleShuffle={handleToggleShuffle}
            repeatMode={repeatMode}
            shuffleMode={shuffleMode}
          />
        )}
      </div>
    </div>
  );
}