import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  type Candidate,
  formatDuration,
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
}) {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const apiKey = Deno.env.get('YOUTUBE_API_KEY');
  if (!apiKey) return json({ error: 'YouTube API key not configured' }, 500);
  if (!rel?.videoId || !rel?.title) return json({ error: 'videoId and title are required' }, 400);

  const api = 'https://www.googleapis.com/youtube/v3';
  const excludedIds = new Set([rel.videoId, ...(rel.excludeVideoIds || [])]);
  const excludedTitles = rel.excludeTitles || [];
  const excludedArtists = rel.excludeArtists || [];

  // Read the current track's YouTube metadata to infer its genre, language and feel.
  let genre: string | null = null;
  let detectedLanguage: string | null = null;
  let tags: string[] = [];
  try {
    const params = new URLSearchParams({
      part: 'snippet,topicDetails',
      id: rel.videoId,
      key: apiKey,
    });
    const response = await fetch(api + '/videos?' + params.toString());
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
    console.error('Current video metadata lookup failed:', error);
  }

  const language = detectedLanguage || rel.language || '';
  const genreWord = genre || rel.genres?.[0] || 'popular music';
  const vibeTerms = inferVibeTerms([rel.title, rel.artist, ...tags].join(' '));
  const seedText = (rel.title + ' ' + rel.artist).toLowerCase();
  const styleTags = tags
    .map((tag) => tag.trim())
    .filter((tag) => {
      const value = tag.toLowerCase();
      return value.length >= 3 &&
        value.length <= 28 &&
        !seedText.includes(value) &&
        !/\b(official|video|audio|lyrics?|hd|4k|music|song|full|remastered)\b/i.test(value);
    })
    .slice(0, 2);

  // OR combines a close similarity search and a popular-in-this-vibe search
  // into one YouTube search request. URLSearchParams safely encodes the pipe.
  const exclusions = '-cover -remix -karaoke -instrumental -reaction -compilation';
  const similarQuery = [
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
  const query = similarQuery + ' ' + exclusions + '|' + viralQuery + ' ' + exclusions;

  console.log('Up Next query:', query);

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

  const searchResponse = await fetch(api + '/search?' + searchParams.toString());
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

  // Fetch view counts, recent upload dates and durations in one batch.
  const detailsById = new Map<string, any>();
  if (ids.length) {
    const params = new URLSearchParams({
      part: 'contentDetails,statistics,snippet,topicDetails',
      id: ids.join(','),
      key: apiKey,
    });
    const detailsResponse = await fetch(api + '/videos?' + params.toString());
    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json();
      for (const video of detailsData.items || []) detailsById.set(video.id, video);
    }
  }

  const now = Date.now();
  const preferredGenres = [genre, ...(rel.genres || [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const candidates: Candidate[] = [];

  searchItems.forEach((item: any, relevanceRank: number) => {
    const videoId = item.id.videoId;
    const details = detailsById.get(videoId);
    const seconds = parseISODuration(details?.contentDetails?.duration || '');
    if (details && seconds > 0 && (seconds < 60 || seconds > 600)) return;

    let artist = item.snippet.channelTitle || 'Unknown Artist';
    let title = item.snippet.title || 'Unknown Track';
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts.slice(1).join(' - ').trim();
      }
    }

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
      : preferredGenres.includes(candidateGenre.toLowerCase()) ? 1 : 0.2;

    const candidateTags = Array.isArray(details?.snippet?.tags) ? details.snippet.tags : [];
    const candidateText = [
      title,
      artist,
      details?.snippet?.description || '',
      ...candidateTags,
    ].join(' ');
    const candidateVibes = inferVibeTerms(candidateText);
    const vibeMatch = vibeTerms.length === 0
      ? 0.5
      : candidateVibes.some((vibe) => vibeTerms.includes(vibe)) ? 1 : 0.25;

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
    });
  });

  const selected = pickRelated(candidates, {
    currentTitle: rel.title,
    currentArtist: rel.artist,
    excludeTitles: excludedTitles,
    excludeVideoIds: Array.from(excludedIds),
    excludeArtists: excludedArtists,
    limit: 15,
  });
  const tracks = selected.map(({ id, title, artist, thumbnail, videoId, duration }) => ({
    id, title, artist, thumbnail, videoId, duration,
  }));

  return json({
    tracks,
    genre: genre || genreWord,
    language,
    vibe: vibeTerms,
    strategy: 'similar-vibe-plus-popularity-no-repeat-artists',
  });
}

