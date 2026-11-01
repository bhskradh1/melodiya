import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  Home,
  Search,
  Music,
  Heart,
  Plus,
  Settings,
  LogOut,
  Crown,
  Library,
  Clock,
  X,
  Share2,
  Users,
  TrendingUp,
  Mic2,
} from 'lucide-react';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onClose?: () => void;
  isMobile?: boolean;
}

const primaryItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Discover', icon: Search },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'karaoke', label: 'Karaoke', icon: Mic2 },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'library', label: 'Your Library', icon: Library },
];

const libraryItems = [
  { id: 'liked', label: 'Liked Songs', icon: Heart },
  { id: 'playlists', label: 'Playlists', icon: Music },
  { id: 'shared-playlists', label: 'Shared with Me', icon: Share2 },
  { id: 'recently-played', label: 'Recently Played', icon: Clock },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  onClose,
  isMobile = false,
}) => {
  const { signOut, isAdmin, user } = useAuth();

  const visiblePrimaryItems = isMobile
    ? primaryItems.filter((item) => !['home', 'search', 'trending', 'library'].includes(item.id))
    : primaryItems;

  const renderNavItem = (item: { id: string; label: string; icon: React.ElementType }) => {
    const Icon = item.icon;
    const active =
      activeView === item.id ||
      (item.id === 'library' && ['liked', 'playlists', 'shared-playlists', 'recently-played', 'playlist-detail'].includes(activeView));

    return (
      <Button
        key={item.id}
        type="button"
        variant="ghost"
        onClick={() => {
          onViewChange(item.id);
          onClose?.();
        }}
        aria-current={active ? 'page' : undefined}
        className={`sonora-nav-link group relative h-10 w-full justify-start gap-3 rounded-xl px-3 text-left text-xs font-medium transition-all ${active ? 'sonora-nav-active' : ''}`}
      >
        <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.7} />
        <span className="truncate">{item.label}</span>
        {active && <i className="sonora-nav-indicator" aria-hidden="true" />}
      </Button>
    );
  };

  return (
    <aside className="sonora-sidebar flex h-full w-64 min-w-64 flex-col">
      <div className="flex items-center justify-between px-6 pb-7 pt-7">
        <button
          type="button"
          aria-label="Go to Sonora home"
          onClick={() => {
            onViewChange('home');
            onClose?.();
          }}
          className="flex items-center gap-3 text-left transition-opacity hover:opacity-80"
        >
          <span className="sonora-brand-mark" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          <span className="font-[Manrope] text-[21px] font-semibold tracking-[-0.045em] text-zinc-200">
            Sonora
          </span>
        </button>
        {isMobile && onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close navigation"
            className="h-8 w-8 rounded-full text-zinc-500 hover:bg-white/[.06] hover:text-zinc-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        <div className="mb-7 space-y-1">
          <p className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[.22em] text-zinc-600">
            Menu
          </p>
          {visiblePrimaryItems.map(renderNavItem)}
        </div>

        <div className="mb-6 border-t border-white/[.07] pt-5">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[9px] font-semibold uppercase tracking-[.22em] text-zinc-600">
              Your collection
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Open playlists"
              title="Open playlists"
              onClick={() => {
                onViewChange('playlists');
                onClose?.();
              }}
              className="h-7 w-7 rounded-full text-zinc-600 hover:bg-white/[.06] hover:text-zinc-200"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-1">
            {libraryItems.map(renderNavItem)}
          </div>
        </div>

        {isAdmin && (
          <div className="mb-6 border-t border-white/[.07] pt-5">
            <p className="mb-2 flex items-center gap-2 px-3 text-[9px] font-semibold uppercase tracking-[.22em] text-lime-200/70">
              <Crown className="h-3.5 w-3.5" /> Studio
            </p>
            {renderNavItem({ id: 'admin', label: 'Content Studio', icon: Settings })}
          </div>
        )}
      </ScrollArea>

      <div className="mx-4 border-t border-white/[.07] pb-4 pt-4">
        <button
          type="button"
          onClick={() => {
            onViewChange('settings');
            onClose?.();
          }}
          className="mb-3 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[.04]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-500/70 to-zinc-900 text-[10px] font-semibold text-zinc-100">
            {user?.email?.slice(0, 1).toUpperCase() || 'S'}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-xs font-medium text-zinc-300">
              {user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Listener'}
            </strong>
            <small className="mt-0.5 block truncate text-[10px] text-zinc-600">
              {user ? 'Your account' : 'Personal listening space'}
            </small>
          </span>
          <Settings className="h-4 w-4 shrink-0 text-zinc-600" />
        </button>
        {user && (
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              await signOut();
              onClose?.();
            }}
            className="h-9 w-full justify-start gap-3 rounded-xl px-3 text-xs text-zinc-600 hover:bg-red-400/[.07] hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        )}
      </div>
    </aside>
  );
};
