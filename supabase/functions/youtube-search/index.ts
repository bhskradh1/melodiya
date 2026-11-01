import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  type Candidate,
  formatDuration,
  isSameSong,
  normalizeTitle,
  genreFromTopics,
  langFromCode,
  inferVibeTerms,
  parseISODuration,
  pickRelated,
} from "./related.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { query } = body;

    // ---- NEW: "related" mode = next song of the same genre (not the same song again) ----
    if (body.related) {
      return await handleRelated(body.related);
    }
    
    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required and must be a string' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const apiKey = Deno.env.get('YOUTUBE_API_KEY');
    if (!apiKey) {
      console.error('YouTube API key not found');
      return new Response(
        JSON.stringify({ error: 'YouTube API key not configured' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Searching for: ${query}`);

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=20&q=${encodeURIComponent(query)}&key=${apiKey}`;
    
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      console.error(`YouTube API error: ${response.status} ${response.statusText}`);
      const errorData = await response.json().catch(() => ({}));
      console.error('Error details:', errorData);
      
      return new Response(
        JSON.stringify({ 
          error: 'Failed to search YouTube',
          details: errorData.error?.message || 'Unknown error'
        }),
        { 
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const data = await response.json();
    console.log(`Found ${data.items?.length || 0} results`);

    const tracks = data.items?.map((item: any) => {
      // Extract artist and title from the video title
      const title = item.snippet.title;
      let artist = item.snippet.channelTitle;
      let songTitle = title;

      // Try to parse "Artist - Song" format
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        if (parts.length >= 2) {
          artist = parts[0].trim();
          songTitle = parts.slice(1).join(' - ').trim();
        }
      }

      // Get the best quality thumbnail
      const thumbnail = item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url;

      return {
        id: item.id.videoId,
        title: songTitle,
        artist: artist,
        thumbnail: thumbnail,
        videoId: item.id.videoId,
        duration: 'Unknown' // YouTube Data API v3 doesn't include duration in search results
      };
    }) || [];

    return new Response(
      JSON.stringify({ tracks }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in youtube-search function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

// ---------------------------------------------------------------------------
// YouTube-style Up Next: similar feeling + popular/trending tracks.
// ---------------------------------------------------------------------------
type LastFmTrack = {
  title: string;
  artist: string;
  match: number;
  musicBrainzId?: string;
};

type LastFmResult = {
  tracks: LastFmTrack[];
  tags: string[];
};

const lastFmJson = async (params: URLSearchParams): Promise<any | null> => {
  try {
    const response = await fetch('https://ws.audioscrobbler.com/2.0/?' + params.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) return null;
    const data = await response.json();
    // Last.fm may return API errors with HTTP 200.
    if (data?.error) {
      console.warn('Last.fm API response error:', data.message || data.error);
      return null;
    }
    return data;
  } catch (error) {
    console.warn('Last.fm request failed:', error);
    return null;
  }
};

const getLastFmRecommendations = async (
  title: string,
  artist: string,
): Promise<LastFmResult> => {
  const apiKey = Deno.env.get('LASTFM_API_KEY');
  if (!apiKey) return { tracks: [], tags: [] };

  const base = {
    api_key: apiKey,
    format: 'json',
    autocorrect: '1',
  };

  const similarParams = new URLSearchParams({
    ...base,
    method: 'track.getSimilar',
    artist,
    track: title,
    limit: '35',
  });
  const tagsParams = new URLSearchParams({
    ...base,
    method: 'track.getTopTags',
    artist,
    track: title,
  });

  let [similarData, tagData] = await Promise.all([
    lastFmJson(similarParams),
    lastFmJson(tagsParams),
  ]);

  // YouTube channels sometimes expose a label/publisher rather than the real
  // performer. If that artist/title pair has no Last.fm similarity results,
  // resolve the track by title first, then retry similarity with its canonical
  // artist. This costs extra requests only for failed seed lookups.
  let rawTracks = similarData?.similartracks?.track;
  const hasSimilarTracks = Array.isArray(rawTracks) ? rawTracks.length > 0 : Boolean(rawTracks);
  if (!hasSimilarTracks) {
    const searchParams = new URLSearchParams({
      ...base,
      method: 'track.search',
      track: title,
      limit: '5',
    });
    const searchData = await lastFmJson(searchParams);
    const matches = searchData?.results?.trackmatches?.track;
    const possibleMatches = Array.isArray(matches) ? matches : matches ? [matches] : [];
    const canonical = possibleMatches.find((item: any) =>
      item?.name &&
      item?.artist &&
      isSameSong(String(item.name), title)
    );
    const canonicalArtist = String(canonical?.artist || '').trim();
    const canonicalTitle = String(canonical?.name || '').trim();

    if (canonicalArtist && canonicalTitle) {
      const canonicalSimilarParams = new URLSearchParams({
        ...base,
        method: 'track.getSimilar',
        artist: canonicalArtist,
        track: canonicalTitle,
        limit: '35',
      });
      const canonicalTagsParams = new URLSearchParams({
        ...base,
        method: 'track.getTopTags',
        artist: canonicalArtist,
        track: canonicalTitle,
      });
      [similarData, tagData] = await Promise.all([
        lastFmJson(canonicalSimilarParams),
        lastFmJson(canonicalTagsParams),
      ]);
      rawTracks = similarData?.similartracks?.track;
    }
  }
  const tracks: LastFmTrack[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const rawTrackItems = Array.isArray(rawTracks) ? rawTracks : rawTracks ? [rawTracks] : [];
  const numericMatches = rawTrackItems
    .map((item: any) => Number(item?.match))
    .filter((value: number) => Number.isFinite(value) && value > 0);
  const maxMatch = Math.max(1, ...numericMatches);
  const matchDivisor = maxMatch > 1 ? maxMatch : 1;

  for (const item of rawTrackItems) {
    const trackTitle = String(item?.name || '').trim();
    const trackArtist = String(item?.artist?.name || '').trim();
    if (!trackTitle || !trackArtist) continue;

    const mbid = String(item?.mbid || '').trim();
    const musicBrainzId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mbid) ? mbid : undefined;
    const key = musicBrainzId || (normalizeTitle(trackTitle) + '|' + normalizeTitle(trackArtist));
    if (seenIds.has(key) || seenNames.has(key)) continue;
    seenIds.add(key);
    seenNames.add(key);

    const match = Number(item?.match);
    tracks.push({
      title: trackTitle,
      artist: trackArtist,
      // Last.fm's documented sample response uses values above 1. Normalize
      // against this response's best match so relative similarity is retained.
      match: Number.isFinite(match) ? Math.max(0, Math.min(1, match / matchDivisor)) : 0.25,
      musicBrainzId,
    });
  }

  const rawTags = tagData?.toptags?.tag;
  const tags = (Array.isArray(rawTags) ? rawTags : rawTags ? [rawTags] : [])
    .map((tag: any) => String(tag?.name || '').trim())
    .filter((tag: string) => tag.length >= 2 && tag.length <= 32)
    .filter((tag: string) => !/^(seen live|favorites?|favourites?|awesome|spotify|all)$/i.test(tag))
    .slice(0, 5);

  return { tracks: tracks.slice(0, 35), tags };
};

const parseYouTubeTrackTitle = (rawTitle: string, channelTitle: string) => {
  let artist = channelTitle || 'Unknown Artist';
  let title = rawTitle || 'Unknown Track';
  const separators = [' - ', ' – ', ' — '];
  const separator = separators.find((value) => title.includes(value));
  if (separator) {
    const parts = title.split(separator);
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(separator).trim();
    }
  }
  return { title, artist };
};

async function handleRelated(rel: {
  videoId: string;
  title: string;
  artist: string;
  language?: string;
  languageCode?: string;
  genres?: string[];
  excludeTitles?: string[];
  excludeVideoIds?: string[];
  excludeArtists?: string[];
  musicBrainzId?: string;
  excludeMusicBrainzIds?: string[];
}) {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) return json({ error: 'YouTube API key not configured' }, 500);
  if (!rel?.videoId || !rel?.title || !rel?.artist) {
    return json({ error: 'videoId, title and artist are required' }, 400);
  }

  const api = 'https://www.googleapis.com/youtube/v3';
  const excludedIds = new Set([rel.videoId, ...(rel.excludeVideoIds || [])]);
  const excludedTitles = rel.excludeTitles || [];
  const excludedArtists = rel.excludeArtists || [];
  const excludedMusicBrainzIds = [
    rel.musicBrainzId || '',
    ...(rel.excludeMusicBrainzIds || []),
  ].filter(Boolean);

  // Read YouTube's metadata for the seed so tags, topic and language remain useful
  // when an upload has incomplete metadata in the external music catalogue.
  let genre: string | null = null;
  let detectedLanguage: string | null = null;
  let tags: string[] = [];
  try {
    const params = new URLSearchParams({
      part: 'snippet,topicDetails',
      id: rel.videoId,
      key: apiKey,
    });
    const response = await fetch(api + '/videos?' + params.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      const video = data.items?.[0];
      genre = genreFromTopics(video?.topicDetails?.topicCategories || []);
      detectedLanguage = langFromCode(
        video?.snippet?.defaultAudioLanguage || video?.snippet?.defaultLanguage,
      );
      tags = Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [];
    }
  } catch (error) {
    console.warn('Current video metadata lookup failed:', error);
  }

  // Last.fm supplies track-to-track similarity, top tags and (when available)
  // MusicBrainz recording MBIDs. MBIDs are used as canonical recording keys,
  // avoiding a separate MusicBrainz request for every song (MusicBrainz asks
  // clients to stay at one request per second).
  const lastFm = await getLastFmRecommendations(rel.title, rel.artist);
  const similarTracks = lastFm.tracks;
  const language = detectedLanguage || rel.language || '';
  const genreWord = genre || rel.genres?.[0] || lastFm.tags[0] || 'popular music';
  const vibeTerms = inferVibeTerms([
    rel.title,
    rel.artist,
    ...tags,
    ...lastFm.tags,
  ].join(' '));
  const seedText = (rel.title + ' ' + rel.artist).toLowerCase();
  const styleTags = [
    ...lastFm.tags,
    ...tags.map((tag) => tag.trim()).filter((tag) => {
      const value = tag.toLowerCase();
      return value.length >= 3 &&
        value.length <= 28 &&
        !seedText.includes(value) &&
        !/\b(official|video|audio|lyrics?|hd|4k|music|song|full|remastered)\b/i.test(value);
    }),
  ]
    .filter((tag, index, all) => all.findIndex((value) => value.toLowerCase() === tag.toLowerCase()) === index)
    .slice(0, 5);

  const exclusions = '-cover -karaoke -instrumental -reaction -compilation -mashup -slowed -nightcore';
  const lastFmQueries = similarTracks.slice(0, 12).map((track) => {
    const title = track.title.replace(/["']/g, '').slice(0, 90);
    const artist = track.artist.replace(/["']/g, '').slice(0, 70);
    return '"' + title + '" ' + artist + ' (official audio | official music video | VEVO | Topic)';
  });
  const fallbackSimilarQuery = [
    rel.title,
    rel.artist,
    'similar songs',
    vibeTerms[0] || '',
    genreWord,
    language,
    ...styleTags,
  ].filter(Boolean).join(' ');
  const viralQuery = [
    genreWord,
    vibeTerms[0] || '',
    language,
    'viral trending popular hits',
  ].filter(Boolean).join(' ');

  // One YouTube search call is retained to conserve the Data API quota.
  // Exact Last.fm song queries are OR'd together, then the original discovery
  // queries remain as a fallback for tracks that have no good YouTube match.
  const queryParts = [
    ...lastFmQueries,
    fallbackSimilarQuery + ' ' + exclusions,
    viralQuery + ' ' + exclusions,
  ];
  const query = queryParts.join(' | ').slice(0, 480);
  console.log('Up Next source:', similarTracks.length ? 'Last.fm + YouTube' : 'YouTube fallback');

  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    maxResults: '50',
    order: 'relevance',
    safeSearch: 'moderate',
    q: query,
    key: apiKey,
  });
  const languageCode = (rel.languageCode || '').trim().toLowerCase();
  if (/^[a-z]{2}$/.test(languageCode)) {
    searchParams.set('relevanceLanguage', languageCode);
  }

  const searchResponse = await fetch(api + '/search?' + searchParams.toString(), {
    signal: AbortSignal.timeout(7000),
  });
  if (!searchResponse.ok) {
    const errorData = await searchResponse.json().catch(() => ({}));
    return json({
      error: 'Failed to search similar and popular songs',
      details: errorData.error?.message,
    }, searchResponse.status);
  }

  const searchData = await searchResponse.json();
  const searchItems = (searchData.items || [])
    .filter((item: any) => item.id?.videoId && !excludedIds.has(item.id.videoId));
  const ids: string[] = searchItems.map((item: any) => item.id.videoId);

  // Batch-fetch duration, views, likes, descriptions and topic metadata.
  const detailsById = new Map<string, any>();
  if (ids.length) {
    const params = new URLSearchParams({
      part: 'contentDetails,statistics,snippet,topicDetails',
      id: ids.join(','),
      key: apiKey,
    });
    const detailsResponse = await fetch(api + '/videos?' + params.toString(), {
      signal: AbortSignal.timeout(7000),
    });
    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json();
      for (const video of detailsData.items || []) detailsById.set(video.id, video);
    }
  }

  const now = Date.now();
  const preferredGenres = [genre, ...(rel.genres || []), ...lastFm.tags]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const candidates: Candidate[] = [];

  searchItems.forEach((item: any, relevanceRank: number) => {
    const videoId = item.id.videoId;
    const details = detailsById.get(videoId);
    const seconds = parseISODuration(details?.contentDetails?.duration || '');
    if (details && seconds > 0 && (seconds < 60 || seconds > 600)) return;

    const rawTitle = String(item.snippet.title || 'Unknown Track');
    const channelTitle = String(item.snippet.channelTitle || 'Unknown Artist');
    const parsed = parseYouTubeTrackTitle(rawTitle, channelTitle);
    const normalizedYouTubeTitle = normalizeTitle(parsed.title);
    const normalizedRawTitle = normalizeTitle(rawTitle);

    let matchedTrack: LastFmTrack | undefined;
    let mappedTitleScore = 0;
    for (const track of similarTracks) {
      const matchesTitle =
        isSameSong(track.title, parsed.title) ||
        (normalizedYouTubeTitle.length >= 4 && normalizedYouTubeTitle === normalizeTitle(track.title)) ||
        (normalizedRawTitle.length >= 4 && normalizedRawTitle === normalizeTitle(track.title));
      if (!matchesTitle) continue;

      const artistHaystack = (rawTitle + ' ' + channelTitle).toLowerCase();
      // Require a corroborating artist signal before assigning canonical
      // Last.fm metadata. A title-only match such as "Stay" is too ambiguous.
      const artistSignal = artistHaystack.includes(track.artist.toLowerCase()) ? 1 : 0;
      if (artistSignal === 0) continue;
      const score = track.match * artistSignal;
      if (score > mappedTitleScore) {
        mappedTitleScore = score;
        matchedTrack = track;
      }
    }

    // Where Last.fm recognizes the recording, display its clean canonical
    // title/artist, while keeping the matching embeddable YouTube video ID.
    const title = matchedTrack?.title || parsed.title;
    const artist = matchedTrack?.artist || parsed.artist;
    const musicBrainzId = matchedTrack?.musicBrainzId;

    // Keep all eligible uploads until ranking. pickRelated then chooses the
    // strongest official/popular match and discards alternate uploads with
    // the same known recording MBID.
    const statistics = details?.statistics || {};
    const views = Number(statistics.viewCount || 0);
    const likes = Number(statistics.likeCount || 0);
    const publishedAt = details?.snippet?.publishedAt || item.snippet.publishedAt;
    const publishedTime = publishedAt ? Date.parse(publishedAt) : NaN;
    const ageDays = Number.isFinite(publishedTime)
      ? Math.max(1, (now - publishedTime) / 86400000)
      : 30;

    const candidateGenre = genreFromTopics(details?.topicDetails?.topicCategories || []);
    const genreMatch = !candidateGenre || preferredGenres.length === 0
      ? 0.5
      : preferredGenres.some((value) => value === candidateGenre.toLowerCase()) ? 1 : 0.2;

    const candidateTags = Array.isArray(details?.snippet?.tags) ? details.snippet.tags : [];
    const description = String(details?.snippet?.description || '');
    const candidateText = [title, artist, description, ...candidateTags].join(' ');
    const candidateVibes = inferVibeTerms(candidateText);
    const vibeMatch = vibeTerms.length === 0
      ? 0.5
      : candidateVibes.some((vibe) => vibeTerms.includes(vibe)) ? 1 : 0.25;

    const channelLower = channelTitle.toLowerCase();
    const officialSignal =
      /\btopic$/.test(channelLower) ||
      /\b(vevo|official)\b/.test(channelLower) ||
      /\b(official audio|official music video)\b/i.test(rawTitle) ||
      /provided to youtube by|licensed to youtube by/i.test(description)
        ? 1
        : 0.2;

    candidates.push({
      id: videoId,
      title,
      artist,
      thumbnail:
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        '',
      videoId,
      duration: seconds ? formatDuration(seconds) : 'Unknown',
      relevanceRank,
      viewCount: views,
      viewsPerDay: views / ageDays,
      likeRatio: views > 0 ? likes / views : 0,
      genreMatch,
      vibeMatch,
      lastFmMatch: matchedTrack ? mappedTitleScore : 0.15,
      musicBrainzId,
      officialSignal,
    });
  });

  const selected = pickRelated(candidates, {
    currentTitle: rel.title,
    currentArtist: rel.artist,
    excludeTitles: excludedTitles,
    excludeVideoIds: Array.from(excludedIds),
    excludeArtists: excludedArtists,
    excludeMusicBrainzIds,
    limit: 15,
  });
  const tracks = selected.map(({
    id, title, artist, thumbnail, videoId, duration, musicBrainzId,
  }) => ({
    id, title, artist, thumbnail, videoId, duration, musicBrainzId,
  }));

  return json({
    tracks,
    genre: genre || genreWord,
    language,
    vibe: vibeTerms,
    tags: lastFm.tags,
    recommendationSource: similarTracks.length ? 'lastfm-track-similarity' : 'youtube-fallback',
    lastFmSimilarCount: similarTracks.length,
    musicBrainzIdsMatched: selected.filter((track) => Boolean(track.musicBrainzId)).length,
    strategy: 'lastfm-track-match-plus-official-youtube-search-popularity-no-repeat',
  });
}

