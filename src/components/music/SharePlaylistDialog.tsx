import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Share2, X, Search, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  sharePlaylist,
  unsharePlaylist,
  getPlaylistShares,
  searchUsers,
  UserProfile,
} from '@/lib/playlistSharing';

interface SharePlaylistDialogProps {
  playlistId: string;
  playlistName: string;
  currentUserId: string;
  triggerClassName?: string;
}

export const SharePlaylistDialog: React.FC<SharePlaylistDialogProps> = ({
  playlistId,
  playlistName,
  currentUserId,
  triggerClassName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [sharedWith, setSharedWith] = useState<any[]>([]);
  const [sharedUserIds, setSharedUserIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch initial shares when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchShares();
    }
  }, [isOpen]);

  const fetchShares = async () => {
    setIsLoading(true);
    try {
      const result = await getPlaylistShares(playlistId);
      if (result.success && result.data) {
        setSharedWith(result.data);
        const userIds = new Set(
          result.data.map((share: any) => share.shared_with_user_id)
        );
        setSharedUserIds(userIds);
      }
    } catch (error) {
      console.error('Error fetching shares:', error);
      toast({
        title: 'Error',
        description: 'Failed to load shared users',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const excludeIds = Array.from(sharedUserIds);
      excludeIds.push(currentUserId); // Exclude current user
      
      const result = await searchUsers(query, excludeIds);
      if (result.success && result.data) {
        setSearchResults(result.data);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to search users',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleShare = async (userId: string) => {
    try {
      const result = await sharePlaylist(playlistId, userId, currentUserId);
      if (result.success) {
        setSharedUserIds((prev) => new Set([...prev, userId]));
        toast({
          title: 'Shared',
          description: `Playlist shared successfully`,
        });
        setSearchQuery('');
        setSearchResults([]);
        await fetchShares();
      } else {
        throw new Error('Failed to share');
      }
    } catch (error) {
      console.error('Error sharing playlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to share playlist',
        variant: 'destructive',
      });
    }
  };

  const handleUnshare = async (userId: string) => {
    try {
      const result = await unsharePlaylist(playlistId, userId);
      if (result.success) {
        setSharedUserIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
        setSharedWith((prev) =>
          prev.filter((share: any) => share.shared_with_user_id !== userId)
        );
        toast({
          title: 'Unshared',
          description: 'Playlist unshared',
        });
        setSearchQuery('');
        setSearchResults([]);
      } else {
        throw new Error('Failed to unshare');
      }
    } catch (error) {
      console.error('Error unsharing playlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to unshare playlist',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={triggerClassName}
          title="Share this playlist"
        >
          <Share2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-card">
        <DialogHeader>
          <DialogTitle>Share "{playlistName}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Users Section */}
          <div className="space-y-2">
            <Label htmlFor="user-search">Share with users</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="user-search"
                placeholder="Search by username or name..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Search Results */}
            {searchQuery.trim().length > 0 && (
              <div className="border rounded-md bg-background">
                {isSearching ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    Searching...
                  </div>
                ) : searchResults.length > 0 ? (
                  <ScrollArea className="h-48">
                    <div className="space-y-1 p-2">
                      {searchResults.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar_url} />
                              <AvatarFallback>
                                {user.display_name?.[0] ||
                                  user.username?.[0] ||
                                  '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {user.display_name || user.username}
                              </p>
                              {user.display_name && (
                                <p className="text-xs text-muted-foreground">
                                  @{user.username}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleShare(user.id)}
                            className="h-8"
                          >
                            Share
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No users found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shared With Section */}
          <div className="space-y-2">
            <Label>
              Shared with {sharedWith.length} user
              {sharedWith.length !== 1 ? 's' : ''}
            </Label>
            {sharedWith.length > 0 ? (
              <div className="border rounded-md bg-background p-3 space-y-2">
                {sharedWith.map((share: any) => (
                  <div
                    key={share.shared_with_user_id}
                    className="flex items-center justify-between p-2 rounded bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={share.profiles?.avatar_url}
                        />
                        <AvatarFallback>
                          {share.profiles?.display_name?.[0] ||
                            share.profiles?.username?.[0] ||
                            '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {share.profiles?.display_name ||
                            share.profiles?.username}
                        </p>
                        {share.profiles?.display_name && (
                          <p className="text-xs text-muted-foreground">
                            @{share.profiles?.username}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        handleUnshare(share.shared_with_user_id)
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded bg-muted/50 text-center text-sm text-muted-foreground">
                Not shared with anyone yet
              </div>
            )}
          </div>

          {/* Close Button */}
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="w-full"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
