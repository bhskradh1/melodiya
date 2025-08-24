import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Home, 
  Search, 
  Music, 
  Heart, 
  Plus, 
  Settings, 
  LogOut,
  Crown,
  Library
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const { signOut, isAdmin } = useAuth();

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'library', label: 'Your Library', icon: Library },
  ];

  const libraryItems = [
    { id: 'liked', label: 'Liked Songs', icon: Heart },
    { id: 'playlists', label: 'Recently Played', icon: Music },
  ];

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="glass-sidebar w-64 h-full flex flex-col">
      {/* Brand */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <Music className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Melodiya
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        {/* Main Navigation */}
        <div className="space-y-1 mb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={activeView === item.id ? "secondary" : "ghost"}
                className={`w-full justify-start gap-3 h-10 ${
                  activeView === item.id 
                    ? "bg-primary/20 text-primary hover:bg-primary/30" 
                    : "hover:bg-hover-bg"
                }`}
                onClick={() => onViewChange(item.id)}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Button>
            );
          })}
        </div>

        <Separator className="my-4" />

        {/* Library Section */}
        <div className="space-y-1 mb-6">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium text-muted-foreground">Library</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {libraryItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={activeView === item.id ? "secondary" : "ghost"}
                className={`w-full justify-start gap-3 h-10 ${
                  activeView === item.id 
                    ? "bg-primary/20 text-primary hover:bg-primary/30" 
                    : "hover:bg-hover-bg"
                }`}
                onClick={() => onViewChange(item.id)}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Button>
            );
          })}
        </div>

        <Separator className="my-4" />

        {/* Admin Section */}
        {isAdmin && (
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2 px-3 py-2">
              <Crown className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Admin</span>
            </div>
            <Button
              variant={activeView === 'admin' ? "secondary" : "ghost"}
              className={`w-full justify-start gap-3 h-10 ${
                activeView === 'admin' 
                  ? "bg-accent/20 text-accent hover:bg-accent/30" 
                  : "hover:bg-hover-bg"
              }`}
              onClick={() => onViewChange('admin')}
            >
              <Settings className="w-5 h-5" />
              Admin Panel
            </Button>
          </div>
        )}
      </ScrollArea>

      {/* Bottom Actions */}
      <div className="p-3 space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-10 hover:bg-hover-bg"
          onClick={() => onViewChange('settings')}
        >
          <Settings className="w-5 h-5" />
          Settings
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 h-10 hover:bg-destructive/20 hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};