"""Authenticated, metadata-only YouTube Music search endpoint for Vercel."""

from __future__ import annotations

import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ytmusicapi import YTMusic


SUPABASE_URL = os.environ.get("MUSIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("MUSIC_SUPABASE_ANON_KEY", "")

MAX_QUERY_LENGTH = 120
MAX_RESULTS = 20
USER_REQUESTS_PER_MINUTE = 30
CACHE_TTL_SECONDS = 900
CACHE_MAX_ENTRIES = 256
AUTH_TIMEOUT_SECONDS = 5

# Warm Vercel instances may reuse this cache. It is deliberately best-effort:
# serverless instances can be recycled at any time.
_search_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_user_requests: dict[str, list[float]] = {}


def _json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


# Accept only classified artist audio tracks (ATV) and official music videos
# (OMV). Generic videos, UGC, and unclassified rows are excluded. Do not fall
# back to general YouTube video search for this product.
UNWANTED_TITLE_PATTERN = re.compile(
    r"\\b(?:"
    r"jukebox|non[\\s-]?stop|medley|mash[\\s-]?up|megamix|"
    r"compilation|full\\s+album|all\\s+songs|greatest\\s+hits|best\\s+of|"
    r"continuous\\s+mix|merged\\s+(?:songs?|tracks?)|combined\\s+songs?|"
    r"karaoke|cover(?:\\s+(?:song|version))?|tribute|"
    r"slowed|nightcore|sped[\\s-]?up|8d(?:\\s+audio)?|"
    r"dj\\s+mix|bass\\s+boosted|remix|unofficial|fan[\\s-]?(?:made|edit)|"
    r"reaction|lo[ -]?fi|instrumental|extended\\s+version|"
    r"loop(?:ed)?|song\\s+collection|nonstop\\s+hits"
    r")\\b",
    re.IGNORECASE,
)


def _normalize_track(item: dict[str, Any]) -> dict[str, str] | None:
    # Admit only YouTube Music's song result type, never generic videos,
    # user uploads, community playlists or other result categories.
    if item.get("resultType") != "song":
        return None

    # Missing videoType is not proof of an official upload. Under the
    # strict catalogue policy, accept only YouTube Music artist-track and
    # official-music-video types; reject UGC and unclassified rows.
    video_type = item.get("videoType")
    if video_type not in {
        "MUSIC_VIDEO_TYPE_ATV",
        "MUSIC_VIDEO_TYPE_OMV",
    }:
        return None

    video_id = str(item.get("videoId") or "").strip()
    title = str(item.get("title") or "").strip()
    if not video_id or not title or UNWANTED_TITLE_PATTERN.search(title):
        return None
    if item.get("isAvailable") is False:
        return None

    artist_items = item.get("artists") or []
    artists: list[str] = []
    for artist in artist_items:
        if not isinstance(artist, dict):
            continue
        name = str(artist.get("name") or "").strip()
        channel_id = str(artist.get("id") or "").strip()
        # Require a linked artist channel so unattributed entries are rejected.
        if name and channel_id.startswith("UC"):
            artists.append(name)

    if not artists:
        return None

    artist_text = ", ".join(dict.fromkeys(artists))
    duration_seconds = item.get("duration_seconds")
    try:
        # A single-song catalogue result should not be long-form jukebox material.
        if duration_seconds is not None and int(duration_seconds) > 900:
            return None
    except (TypeError, ValueError):
        pass

    thumbnails = item.get("thumbnails") or []
    thumbnail = ""
    if isinstance(thumbnails, list):
        for image in reversed(thumbnails):
            if isinstance(image, dict) and image.get("url"):
                thumbnail = str(image["url"])
                break

    return {
        "id": video_id,
        "videoId": video_id,
        "title": title,
        "artist": artist_text,
        "thumbnail": thumbnail,
        "duration": str(item.get("duration") or "Unknown"),
        "source": "youtube_music",
    }


def _verify_user(authorization: str) -> str | None:
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError("Search authentication is not configured")

    token = authorization.removeprefix("Bearer ").strip()
    if not token or token == authorization.strip():
        return None

    request = Request(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=AUTH_TIMEOUT_SECONDS) as response:
            user = json.loads(response.read(64 * 1024).decode("utf-8"))
    except HTTPError as exc:
        if exc.code in (401, 403):
            return None
        raise RuntimeError("Could not verify the Melodiya session") from exc
    except (URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("Could not verify the Melodiya session") from exc

    user_id = user.get("id") if isinstance(user, dict) else None
    return str(user_id) if user_id else None


def _is_rate_limited(user_id: str) -> bool:
    now = time.monotonic()
    recent = [stamp for stamp in _user_requests.get(user_id, []) if now - stamp < 60]
    if len(recent) >= USER_REQUESTS_PER_MINUTE:
        _user_requests[user_id] = recent
        return True
    recent.append(now)
    _user_requests[user_id] = recent

    # Keep the in-memory bookkeeping bounded on warm instances.
    if len(_user_requests) > 2000:
        cutoff = now - 60
        for key in list(_user_requests):
            stamps = [stamp for stamp in _user_requests[key] if stamp >= cutoff]
            if stamps:
                _user_requests[key] = stamps
            else:
                _user_requests.pop(key, None)
    return False


def _search(query: str, limit: int) -> tuple[list[dict[str, str]], bool]:
    cache_key = f"{query.casefold()}:{limit}"
    now = time.monotonic()
    cached = _search_cache.get(cache_key)
    if cached and now - cached[0] < CACHE_TTL_SECONDS:
        return cached[1], True

    # One small catalogue request per new query. Do not bulk-fetch hundreds
    # of candidates; strict official-source filtering is more important than
    # filling a large result list. Repeat queries use the cache above.
    results = YTMusic().search(query, filter="songs", limit=min(MAX_RESULTS, limit))
    tracks = []
    for item in results:
        if not isinstance(item, dict) or item.get("resultType") != "song":
            continue
        track = _normalize_track(item)
        if track:
            tracks.append(track)
            if len(tracks) >= limit:
                break

    _search_cache[cache_key] = (now, tracks)
    if len(_search_cache) > CACHE_MAX_ENTRIES:
        oldest_key = min(_search_cache, key=lambda key: _search_cache[key][0])
        _search_cache.pop(oldest_key, None)
    return tracks, False


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        try:
            raw_length = int(self.headers.get("Content-Length", "0"))
            if raw_length <= 0 or raw_length > 4096:
                self._send_json(400, {"error": "Invalid request body"})
                return

            body = json.loads(self.rfile.read(raw_length).decode("utf-8"))
            if not isinstance(body, dict):
                self._send_json(400, {"error": "Invalid request body"})
                return

            query = str(body.get("query") or "").strip()
            if not query or len(query) > MAX_QUERY_LENGTH:
                self._send_json(
                    400,
                    {"error": f"Search query must be between 1 and {MAX_QUERY_LENGTH} characters"},
                )
                return

            user_id = _verify_user(self.headers.get("Authorization", ""))
            if not user_id:
                self._send_json(401, {"error": "Please sign in to search"})
                return

            if _is_rate_limited(user_id):
                self._send_json(
                    429,
                    {"error": "Search limit reached. Please wait a minute and try again."},
                )
                return

            requested_limit = body.get("limit", MAX_RESULTS)
            try:
                limit = max(1, min(MAX_RESULTS, int(requested_limit)))
            except (TypeError, ValueError):
                limit = MAX_RESULTS

            tracks, cached = _search(query, limit)
            self._send_json(
                200,
                {
                    "tracks": tracks,
                    "count": len(tracks),
                    "provider": "youtube_music",
                    "cached": cached,
                },
            )
        except RuntimeError as exc:
            self._send_json(503, {"error": str(exc)})
        except Exception:
            # Do not send upstream exception details or auth material to clients.
            self._send_json(502, {"error": "YouTube Music search is temporarily unavailable"})

    def log_message(self, format: str, *args: Any) -> None:
        # Avoid logging search terms or authorization headers.
        return
