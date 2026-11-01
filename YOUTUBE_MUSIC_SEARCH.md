# YouTube Music search provider

Melodiya now has an optional, metadata-only YouTube Music search endpoint at
`/api/ytmusic-search`. It uses the unauthenticated search capability of
`ytmusicapi`; it does not extract audio, download tracks, or alter playback.

## Runtime configuration

Set these encrypted Vercel project environment variables for Production,
Preview, and Development:

- `MUSIC_SUPABASE_URL`: the Melodiya Supabase project URL.
- `MUSIC_SUPABASE_ANON_KEY`: the Melodiya Supabase publishable/anon key.

The endpoint checks the supplied Supabase access token against
`/auth/v1/user`. It does not accept a caller-provided user ID as proof of
authentication.

## Search behaviour

- Searches the YouTube Music public catalogue for songs only.
- Returns up to 25 results per request.
- Uses a five-minute in-memory cache on warm serverless instances.
- Applies a best-effort limit of 30 searches per signed-in user per minute per
  warm instance. Vercel can recycle or scale instances, so this is not a
  globally persistent quota.
- Melodiya tries this provider first and falls back to the existing
  `youtube-search` Supabase Edge Function if the new provider is unavailable
  or returns no tracks.

The provider uses an unofficial YouTube Music interface and may break if
YouTube changes it. It is not an unlimited-search guarantee and remains subject
to YouTube-side throttling and applicable terms.
