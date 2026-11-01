import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSettings } from '@/contexts/SettingsContext';
import { usePreferences, GENRE_OPTIONS, type UserPreferences } from '@/contexts/PreferencesContext';
import { useToast } from '@/hooks/use-toast';
import { getOfflineTracks, clearOfflineLibrary } from '@/lib/offlineLibrary';
import {
  Mic2,
  WifiOff,
  Music2,
  Globe,
  Palette,
  Bell,
  Shield,
  User,
  LogOut,
  Trash2,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const settings = useSettings();
  const { preferences: prefs, updatePreferences } = usePreferences();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ display_name: '', username: '' });
  const [offlineCount, setOfflineCount] = useState(() => getOfflineTracks().length);

  useEffect(() => {
    if (user) fetchData();
    else setLoading(false);
  }, [user]);

  const fetchData = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (data) {
        setProfile({
          display_name: data.display_name || '',
          username: data.username || '',
        });
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: profile.display_name,
          username: profile.username,
        })
        .eq('user_id', user!.id);
      if (error) throw error;
      toast({ title: 'Profile updated' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const savePrefs = async (updates: Partial<UserPreferences>) => {
    try {
      await updatePreferences(updates);
      toast({ title: 'Preference saved' });
    } catch (error) {
      console.error('Could not save preference:', error);
      toast({ title: 'Could not save preference', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const toggleGenre = (genre: string) => {
    const current = prefs.favorite_genres || [];
    const next = current.includes(genre)
      ? current.filter((g) => g !== genre)
      : [...current, genre];
    savePrefs({ favorite_genres: next });
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    if (enabled && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      const granted = perm === 'granted';
      settings.updateSetting('notifications', granted);
      if (!granted) {
        toast({ title: 'Notifications blocked', description: 'Please allow notifications in your browser settings', variant: 'destructive' });
      }
    } else {
      settings.updateSetting('notifications', false);
    }
  };

  const handleClearOffline = async () => {
    await clearOfflineLibrary();
    setOfflineCount(0);
    toast({ title: 'Offline library cleared' });
  };

  const handleClearCaches = async () => {
    try {
      Object.keys(localStorage)
        .filter((k) =>
          k.startsWith('melodiya_recs_') ||
          k.startsWith('melodiya_verified_artist_songs_') ||
          k.startsWith('trending_week_verified_artist_songs_') ||
          k.startsWith('melodiya_trending')
        )
        .forEach((k) => localStorage.removeItem(k));
      toast({ title: 'Music cache cleared', description: 'Trending, recommendations and search results will refresh when opened again' });
    } catch {
      toast({ title: 'Error', description: 'Could not clear cache', variant: 'destructive' });
    }
  };

  const handleClearHistory = async () => {
    try {
      const { error } = await supabase
        .from('recently_played')
        .delete()
        .eq('user_id', user!.id);
      if (error) throw error;
      toast({ title: 'History cleared' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to clear history', variant: 'destructive' });
    }
  };

  const handleClearLikedSongs = async () => {
    try {
      const { error } = await supabase
        .from('liked_songs')
        .delete()
        .eq('user_id', user!.id);
      if (error) throw error;
      toast({ title: 'Liked songs cleared' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to clear liked songs', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[92rem] min-w-0 space-y-6 px-5 pb-32 pt-4 md:px-10 md:pt-6">
      <div className="mb-2">
        <p className="sonora-eyebrow mb-2">Your space</p>
        <h1 className="font-[Manrope] text-3xl font-medium tracking-[-.045em] text-zinc-100 md:text-4xl">Settings</h1>
        <p className="mt-2 text-xs text-zinc-500">Tune your account, listening preferences and experience.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      {/* Account */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5 text-primary" />
            Account
          </CardTitle>
          <CardDescription>Manage your profile information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ''} disabled className="bg-muted/50" />
          </div>
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input
              value={profile.display_name}
              onChange={(e) => setProfile((p) => ({ ...p, display_name: e.target.value }))}
              placeholder="Your display name"
            />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              value={profile.username}
              onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))}
              placeholder="Your username"
            />
          </div>
          <Button onClick={saveProfile} disabled={saving} className="rounded-full bg-gradient-to-br from-zinc-100 to-zinc-400 px-5 text-xs font-semibold text-zinc-950 hover:brightness-110">
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </CardContent>
      </Card>

      {/* Playback */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music2 className="w-5 h-5 text-primary" />
            Playback
          </CardTitle>
          <CardDescription>Control how music plays</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Autoplay</Label>
              <p className="text-xs text-muted-foreground">Play similar songs when your queue ends</p>
            </div>
            <Switch
              checked={prefs.auto_play}
              onCheckedChange={(v) => savePrefs({ auto_play: v })}
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Fade Transition</Label>
                <p className="text-xs text-muted-foreground">Fade the current song out before it ends</p>
              </div>
              <Switch
                checked={settings.crossfade}
                onCheckedChange={(v) => settings.updateSetting('crossfade', v)}
              />
            </div>
            {settings.crossfade && (
              <div className="flex items-center gap-3 pl-1">
                <span className="text-xs text-muted-foreground w-6">0s</span>
                <Slider
                  value={[settings.crossfadeSeconds]}
                  onValueChange={(v) => settings.updateSetting('crossfadeSeconds', v[0])}
                  min={1}
                  max={12}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-8">{settings.crossfadeSeconds}s</span>
              </div>
            )}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Normalize Volume</Label>
              <p className="text-xs text-muted-foreground">Set the same volume level for all songs</p>
            </div>
            <Switch
              checked={settings.normalizeVolume}
              onCheckedChange={(v) => settings.updateSetting('normalizeVolume', v)}
            />
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Default Volume</Label>
              <span className="text-xs text-muted-foreground">{settings.defaultVolume}%</span>
            </div>
            <Slider
              value={[settings.defaultVolume]}
              onValueChange={(v) => settings.updateSetting('defaultVolume', v[0])}
              min={0}
              max={100}
              step={1}
            />
          </div>
        </CardContent>
      </Card>

      {/* Favorite genres */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music2 className="w-5 h-5 text-primary" />
            Your Taste
          </CardTitle>
          <CardDescription>Pick genres you love — Home and Search adapt instantly</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.map((genre) => {
              const active = (prefs.favorite_genres || []).includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all ${
                    active
                      ? 'border-transparent bg-gradient-primary text-primary-foreground'
                      : 'border-foreground/10 bg-foreground/[0.04] text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
          {(prefs.favorite_genres || []).length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">No genres selected yet.</p>
          )}
        </CardContent>
      </Card>


      {/* Language */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5 text-primary" />
            Language & Region
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>Preferred Language</Label>
            <Select
              value={prefs.preferred_language}
              onValueChange={(v) => savePrefs({ preferred_language: v })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">Hindi</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
                <SelectItem value="ja">Japanese</SelectItem>
                <SelectItem value="ko">Korean</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
                <SelectItem value="ne">Nepali</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="w-5 h-5 text-primary" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Now Playing Notifications</Label>
              <p className="text-xs text-muted-foreground">Show notifications when tracks change</p>
            </div>
            <Switch checked={settings.notifications} onCheckedChange={handleNotificationToggle} />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palette className="w-5 h-5 text-primary" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label>Dark Mode</Label>
              <p className="text-xs text-muted-foreground">Use dark theme</p>
            </div>
            <Switch
              checked={settings.darkMode}
              onCheckedChange={(v) => settings.updateSetting('darkMode', v)}
            />
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <div>
              <Label>Reduce Motion</Label>
              <p className="text-xs text-muted-foreground">Minimise animations and transitions</p>
            </div>
            <Switch
              checked={settings.reduceMotion}
              onCheckedChange={(v) => settings.updateSetting('reduceMotion', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Now Playing & Lyrics */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic2 className="w-5 h-5 text-primary" />
            Now Playing & Lyrics
          </CardTitle>
          <CardDescription>Full-screen player and karaoke behaviour</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-open Now Playing</Label>
              <p className="text-xs text-muted-foreground">Open the full player on mobile when a song starts</p>
            </div>
            <Switch
              checked={settings.autoOpenNowPlaying}
              onCheckedChange={(v) => settings.updateSetting('autoOpenNowPlaying', v)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-scroll Lyrics</Label>
              <p className="text-xs text-muted-foreground">Follow the song line by line while singing</p>
            </div>
            <Switch
              checked={settings.lyricsAutoScroll}
              onCheckedChange={(v) => settings.updateSetting('lyricsAutoScroll', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Offline library */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <WifiOff className="w-5 h-5 text-primary" />
            Offline Library
          </CardTitle>
          <CardDescription>{offlineCount} saved {offlineCount === 1 ? 'track' : 'tracks'} listed locally. Audio still requires an internet connection.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleClearOffline} disabled={offlineCount === 0}>
            <Trash2 className="w-4 h-4" />
            Clear Offline Library
          </Button>
        </CardContent>
      </Card>

      {/* Cache management */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trash2 className="w-5 h-5 text-primary" />
            Cache
          </CardTitle>
          <CardDescription>Refresh locally cached recommendations and trending picks</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={handleClearCaches}>
            <Trash2 className="w-4 h-4" />
            Refresh Recommendations Cache
          </Button>
        </CardContent>
      </Card>

      {/* Privacy & Storage */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5 text-primary" />
            Privacy & Storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleClearHistory}
          >
            <Trash2 className="w-4 h-4" />
            Clear Listening History
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleClearLikedSongs}
          >
            <Trash2 className="w-4 h-4" />
            Clear Liked Songs
          </Button>
        </CardContent>
      </Card>

      </div>

      {/* Sign Out */}
      <Card className="glass-card border-white/[.08]">
        <CardContent className="pt-6">
          <Button
            variant="destructive"
            className="w-full gap-2"
            onClick={() => signOut()}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
