import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserPlus, Check, X, Search, Users, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { searchUsers, UserProfile } from '@/lib/playlistSharing';
import {
  sendFriendRequest,
  respondToFriendRequest,
  removeFriendship,
  getIncomingRequests,
  getOutgoingRequests,
  getFriends,
  FriendshipRow,
} from '@/lib/friends';

export const FriendsView: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [incoming, setIncoming] = useState<FriendshipRow[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    const [f, i, o] = await Promise.all([
      getFriends(user.id),
      getIncomingRequests(user.id),
      getOutgoingRequests(user.id),
    ]);
    setFriends(f.data || []);
    setIncoming(i.data || []);
    setOutgoing(o.data || []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [user]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const excludeIds = [
      user?.id,
      ...friends.map((f) => f.profile?.user_id),
      ...incoming.map((f) => f.profile?.user_id),
      ...outgoing.map((f) => f.profile?.user_id),
    ];
    const result = await searchUsers(q, excludeIds);
    if (result.success && result.data) setSearchResults(result.data);
    setSearching(false);
  };

  const handleSend = async (addresseeId: string) => {
    if (!user) return;
    const res = await sendFriendRequest(user.id, addresseeId);
    if (res.success) {
      toast({ title: 'Request sent', description: 'Friend request sent.' });
      setQuery('');
      setSearchResults([]);
      refresh();
    } else {
      toast({ title: 'Could not send', description: String(res.error), variant: 'destructive' });
    }
  };

  const handleRespond = async (id: string, accept: boolean) => {
    const res = await respondToFriendRequest(id, accept);
    if (res.success) {
      toast({ title: accept ? 'Accepted' : 'Rejected' });
      refresh();
    }
  };

  const handleRemove = async (id: string) => {
    const res = await removeFriendship(id);
    if (res.success) {
      toast({ title: 'Removed' });
      refresh();
    }
  };

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-7 px-5 pb-32 pt-4 md:px-10 md:pt-6">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-300 to-zinc-700 text-zinc-950">
          <Users className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="sonora-eyebrow mb-1">Your circle</p><h1 className="font-[Manrope] text-3xl font-medium tracking-[-.045em] text-zinc-100 md:text-4xl">Friends</h1>
          <p className="mt-2 text-xs text-zinc-500">Find people, share playlists and keep your music circle close.</p>
        </div>
      </div>

      {/* Search & Add */}
      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by username or name..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="search-spotlight h-11 rounded-full border-white/[.08] bg-white/[.025] pl-10 text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          {query.trim().length >= 2 && (
            <div className="space-y-1">
              {searching ? (
                <p className="text-sm text-muted-foreground p-2">Searching...</p>
              ) : searchResults.length > 0 ? (
                searchResults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-xl border border-white/[.06] bg-white/[.025] p-3 transition hover:bg-white/[.06]">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={u.avatar_url} />
                        <AvatarFallback>{u.display_name?.[0] || u.username?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{u.display_name || u.username}</p>
                        {u.display_name && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleSend(u.id)}>
                      <UserPlus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground p-2">No users found</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue="friends">
          <TabsList className="rounded-full border border-white/[.08] bg-white/[.025] p-1">
            <TabsTrigger value="friends">Friends ({friends.length})</TabsTrigger>
            <TabsTrigger value="incoming">
              Requests {incoming.length > 0 && <Badge className="ml-2">{incoming.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="outgoing">Sent ({outgoing.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="space-y-2 mt-4">
            {friends.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No friends yet. Search above to add some!</p>
            ) : (
              friends.map((f) => (
                <Card key={f.id} className="glass-card">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={f.profile?.avatar_url || undefined} />
                        <AvatarFallback>{f.profile?.display_name?.[0] || f.profile?.username?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{f.profile?.display_name || f.profile?.username}</p>
                        <p className="text-xs text-muted-foreground">@{f.profile?.username}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(f.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="incoming" className="space-y-2 mt-4">
            {incoming.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No pending requests</p>
            ) : (
              incoming.map((f) => (
                <Card key={f.id} className="glass-card">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={f.profile?.avatar_url || undefined} />
                        <AvatarFallback>{f.profile?.display_name?.[0] || f.profile?.username?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{f.profile?.display_name || f.profile?.username}</p>
                        <p className="text-xs text-muted-foreground">@{f.profile?.username}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleRespond(f.id, true)}>
                        <Check className="w-4 h-4 mr-1" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRespond(f.id, false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="outgoing" className="space-y-2 mt-4">
            {outgoing.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No sent requests</p>
            ) : (
              outgoing.map((f) => (
                <Card key={f.id} className="glass-card">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={f.profile?.avatar_url || undefined} />
                        <AvatarFallback>{f.profile?.display_name?.[0] || f.profile?.username?.[0] || '?'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{f.profile?.display_name || f.profile?.username}</p>
                        <p className="text-xs text-muted-foreground">Pending</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(f.id)}>
                      Cancel
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
