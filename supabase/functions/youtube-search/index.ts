import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  type Candidate,
  formatDuration,
  genreFromTopics,
  langFromCode,
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
// Related songs: find the genre/language of the playing video, then search that
// ---------------------------------------------------------------------------
async function handleRelated(rel: {
  videoId: string;
  title: string;
  artist: string;
  language?: string;
  genres?: string[];
  excludeTitles?: string[];
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

  // 1) What is this video? (genre topic, tags, language) -- costs 1 quota unit
  let genre: string | null = null;
  let language: string | null = null;
  let tagHint: string | null = null;
  try {
    const r = await fetch(`${api}/videos?part=snippet,topicDetails&id=${rel.videoId}&key=${apiKey}`);
    if (r.ok) {
      const d = await r.json();
      const v = d.items?.[0];
      genre = genreFromTopics(v?.topicDetails?.topicCategories || []);
      language = langFromCode(v?.snippet?.defaultAudioLanguage || v?.snippet?.defaultLanguage);
      const titleLc = rel.title.toLowerCase();
      const artistLc = rel.artist.toLowerCase();
      tagHint =
        (v?.snippet?.tags || []).find((t: string) => {
          const x = t.toLowerCase();
          return x.length >= 3 && x.length <= 22 && !titleLc.includes(x) && !artistLc.includes(x);
        }) || null;
    }
  } catch (e) {
    console.error('video lookup failed', e);
  }

  // 2) Build a GENRE query. Never include the song title or artist.
  const genreWord = genre || rel.genres?.[0] || tagHint || 'popular';
  const lang = language || rel.language || '';
  const q = `${genreWord} ${lang} songs -cover -remix -karaoke`.replace(/\s+/g, ' ').trim();
  console.log(`Related search: "${q}" (genre=${genre}, lang=${language})`);

  const sr = await fetch(
    `${api}/search?part=snippet&type=video&videoCategoryId=10&maxResults=30&q=${encodeURIComponent(q)}&key=${apiKey}`
  );
  if (!sr.ok) {
    const err = await sr.json().catch(() => ({}));
    return json({ error: 'Failed to search YouTube', details: err.error?.message }, sr.status);
  }
  const sd = await sr.json();
  const ids: string[] = (sd.items || []).map((i: any) => i.id.videoId).filter(Boolean);

  // 3) Real durations, to drop 1-hour mixes and shorts -- costs 1 quota unit
  const durations = new Map<string, number>();
  if (ids.length) {
    const dr = await fetch(`${api}/videos?part=contentDetails&id=${ids.join(',')}&key=${apiKey}`);
    if (dr.ok) {
      const dd = await dr.json();
      for (const v of dd.items || []) durations.set(v.id, parseISODuration(v.contentDetails?.duration));
    }
  }

  const candidates: Candidate[] = [];
  for (const item of sd.items || []) {
    const secs = durations.get(item.id.videoId) ?? 0;
    if (durations.size && (secs < 90 || secs > 480)) continue; // keep 1:30 - 8:00
    let artist = item.snippet.channelTitle;
    let title = item.snippet.title;
    if (title.includes(' - ')) {
      const parts = title.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
    candidates.push({
      id: item.id.videoId,
      title,
      artist,
      thumbnail:
        item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
      videoId: item.id.videoId,
      duration: secs ? formatDuration(secs) : 'Unknown',
    });
  }

  // 4) Shuffle a little for variety, then drop same-song / covers / too many of one artist
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const tracks = pickRelated(candidates, {
    currentTitle: rel.title,
    currentArtist: rel.artist,
    excludeTitles: rel.excludeTitles,
    limit: 15,
  });

  return json({ tracks, genre: genre || genreWord, language: language || lang || null });
}
