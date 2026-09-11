/**
 * Cloudflare Pages Function — GET /api/leaderboard
 *
 * Reads every score record from the `chicken_wing_fun_leaderboard` KV namespace,
 * ranks them by score (descending; ties broken by earliest submission), and
 * returns the top N.
 *
 * Response body: a JSON OBJECT (wrapped so fields can be added later without a
 * breaking change):
 *   {
 *     entries:   [ { name, score, ts, message }, ... ],  // top N, score desc
 *     total:     <number>,   // count of all valid score records scanned
 *     truncated: <boolean>,  // true if the scan hit MAX_PAGES (total is a floor)
 *     player:    { rank, name, score, message } | null   // see `playerId` below
 *   }
 *   - ts = ms-epoch of the submission (from the record's list() metadata).
 *   - message = the sanitised note, or null (older/no-message records).
 *   - An empty namespace returns { entries: [], total: 0, truncated: false,
 *     player: null } (HTTP 200) — never an error, never mock data.
 *
 * Query:
 *   ?limit=<1..100>      (default 10)
 *   ?playerId=<uuid>     optional — the `id` from a submit-score response.
 *     When given, the record with this id is located in the FULL sorted scan
 *     (not just the returned top N) and its true rank is returned as `player`
 *     — this is what lets the client show "your score, below the top 10" with
 *     a real rank number even when the player didn't place. `player` is null
 *     if `playerId` is omitted, or if that record isn't found — which happens
 *     for a few seconds right after submitting, since KV's list() can lag a
 *     fresh put() (eventual consistency); the client is expected to degrade
 *     gracefully in that case rather than treating it as an error.
 *
 * NOTE ON SCALE: this lists + sorts the whole namespace inside the Function,
 * reading only list() metadata (no get() per key). That is fine into the tens of
 * thousands of rounds; MAX_PAGES caps the scan. Past that, replace this with a
 * maintained sorted index or D1.
 *
 * NOTE ON DUPLICATES: every round is its own KV record, so the same player name
 * can legitimately appear more than once here (their multiple runs). No
 * best-per-player de-duplication is applied.
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const PAGE_SIZE = 1000; // KV list() hard max per page
const MAX_PAGES = 25; // safety cap -> up to 25,000 records scanned per request

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // the board changes on every submit and players expect to see their own
      // score right after submitting — don't let a CDN cache it.
      'Cache-Control': 'no-store',
      ...CORS,
      ...headers,
    },
  });
}

/** CORS preflight. */
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Fallback for POST / PUT / PATCH / DELETE / HEAD — GET and OPTIONS have their
 *  own handlers, which take precedence over this catch-all. */
export function onRequest() {
  return json({ error: 'Method not allowed — use GET.' }, 405, { Allow: 'GET, OPTIONS' });
}

export async function onRequestGet({ request, env }) {
  const kv = env && env.chicken_wing_fun_leaderboard;
  if (!kv) {
    return json({ error: 'Leaderboard service is temporarily unavailable.' }, 500);
  }

  const url = new URL(request.url);
  const raw = parseInt(url.searchParams.get('limit'), 10);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;
  const playerIdRaw = url.searchParams.get('playerId');
  // sanity cap only — a real id is always a 36-char crypto.randomUUID(); anything
  // absurdly longer clearly isn't one and would just never match below anyway.
  const playerId =
    typeof playerIdRaw === 'string' && playerIdRaw.length > 0 && playerIdRaw.length <= 100
      ? playerIdRaw
      : null;

  // --- gather every record from list() metadata (no get() per key) ---
  // `id` is kept on each entry only to locate the requesting player's own
  // record below (for `player`/true rank) — it's stripped before the public
  // `entries` list is returned.
  const entries = [];
  let cursor;
  let pages = 0;
  try {
    do {
      const res = await kv.list({ prefix: 'score:', limit: PAGE_SIZE, cursor });
      for (const k of res.keys) {
        const m = k.metadata;
        if (!m || typeof m.name !== 'string' || typeof m.score !== 'number') continue;
        entries.push({
          id: typeof m.id === 'string' ? m.id : null, // absent on pre-`id` records
          name: m.name,
          score: m.score,
          ts: typeof m.ts === 'number' ? m.ts : 0,
          message: typeof m.message === 'string' && m.message ? m.message : null,
        });
      }
      cursor = res.list_complete ? undefined : res.cursor;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);
  } catch {
    return json({ error: 'Could not read the leaderboard. Please try again.' }, 500);
  }

  // --- rank: score desc, then earliest submission first ---
  entries.sort((a, b) => b.score - a.score || a.ts - b.ts);

  // Locate the requesting player's own record in the FULL sorted scan (not
  // just the slice below) so a score outside the top N still gets its true
  // rank — this is what lets the leaderboard show "your score, below the top
  // 10" instead of just dropping it. null if no playerId was sent, or if the
  // record hasn't propagated to list() yet (KV eventual consistency).
  let player = null;
  if (playerId) {
    const idx = entries.findIndex((e) => e.id === playerId);
    if (idx !== -1) {
      const e = entries[idx];
      player = { rank: idx + 1, name: e.name, score: e.score, message: e.message };
    }
  }

  return json(
    {
      entries: entries.slice(0, limit).map(({ id, ...rest }) => rest), // id never leaves this function
      total: entries.length,
      truncated: Boolean(cursor), // cursor is only still set if we bailed at MAX_PAGES
      player,
    },
    200
  );
}
