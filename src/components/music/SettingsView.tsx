import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSettings } from '@/contexts/SettingsContext';
import { usePreferences, GENRE_OPTIONS, type UserPreferences } from '@/contexts/PreferencesContext';
import { useToast } from '@/hooks/use-toast';
import {
  Volume2,
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
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(() => {
    try {
      return parseInt(localStorage.getItem('melodiya-crossfade-seconds') || '5');
    } catch { return 5; }
  });

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
    await updatePreferences(updates);
    toast({ title: 'Preference saved' });
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
    <div className="p-6 pb-32 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

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
          <Button onClick={saveProfile} disabled={saving} className="bg-gradient-primary hover:opacity-90">
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
                <Label>Crossfade</Label>
                <p className="text-xs text-muted-foreground">Smooth transition between songs</p>
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
                  value={[crossfadeSeconds]}
                  onValueChange={(v) => {
                    setCrossfadeSeconds(v[0]);
                    localStorage.setItem('melodiya-crossfade-seconds', String(v[0]));
                  }}
                  min={1}
                  max={12}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-muted-foreground w-8">{crossfadeSeconds}s</span>
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
          <div className="flex items-center justify-between">
            <div>
              <Label>Show Explicit Content</Label>
              <p className="text-xs text-muted-foreground">Allow explicit songs to appear</p>
            </div>
            <Switch
              checked={settings.showExplicit}
              onCheckedChange={(v) => settings.updateSetting('showExplicit', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Audio Quality */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="w-5 h-5 text-primary" />
            Audio Quality
          </CardTitle>
          <CardDescription>Choose your streaming quality</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Streaming Quality</Label>
              <p className="text-xs text-muted-foreground">Higher quality uses more data</p>
            </div>
            <Select
              value={prefs.sound_quality}
              onValueChange={(v) => savePrefs({ sound_quality: v })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="very_high">Very High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Data Saver</Label>
              <p className="text-xs text-muted-foreground">Reduce data usage when streaming</p>
            </div>
            <Switch
              checked={settings.dataSaver}
              onCheckedChange={(v) => settings.updateSetting('dataSaver', v)}
            />
          </div>
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

      {/* Sign Out */}
      <Card className="glass-card border-destructive/20">
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
