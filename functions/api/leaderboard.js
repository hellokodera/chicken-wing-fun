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
 *     truncated: <boolean>,  // true if the scan hit MAX_RECORDS (total is a floor)
 *     player:    { rank, name, score, message } | null   // see `playerId` below
 *   }
 *   - ts = ms-epoch of the submission (from the record itself).
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
 *     for a few seconds right after submitting, since KV reads can lag a fresh
 *     put() (eventual consistency); the client is expected to degrade
 *     gracefully in that case rather than treating it as an error.
 *
 * NOTE ON SCALE: this reads each record's actual VALUE via kv.get() (list() +
 * per-key get, batched GET_CONCURRENCY at a time) rather than trusting list()
 * metadata — so a score edited directly in the Cloudflare dashboard (which only
 * lets you edit a key's value, not its metadata) is reflected immediately
 * instead of being invisible. That costs one subrequest per record, so
 * MAX_RECORDS caps the scan well below list()-metadata's old ~25,000; past that,
 * replace this with a maintained sorted index or D1.
 *
 * NOTE ON DUPLICATES: every round is its own KV record, so the same player name
 * can legitimately appear more than once here (their multiple runs). No
 * best-per-player de-duplication is applied.
 */

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const PAGE_SIZE = 1000; // KV list() hard max per page
const MAX_RECORDS = 500; // safety cap on get()s issued per request (subrequest cost)
const GET_CONCURRENCY = 20; // parallel kv.get()s per batch

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

  // --- 1. list keys (cheap — no metadata needed, the real value is read below) ---
  const keys = [];
  let cursor;
  try {
    do {
      const res = await kv.list({ prefix: 'score:', limit: PAGE_SIZE, cursor });
      for (const k of res.keys) keys.push(k.name);
      cursor = res.list_complete ? undefined : res.cursor;
    } while (cursor && keys.length < MAX_RECORDS);
  } catch {
    return json({ error: 'Could not read the leaderboard. Please try again.' }, 500);
  }
  const truncated = Boolean(cursor) || keys.length > MAX_RECORDS;
  const scanKeys = keys.slice(0, MAX_RECORDS);

  // --- 2. read each record's actual value, batched so we don't fire hundreds
  //        of concurrent subrequests at once ---
  // `id` is kept on each entry only to locate the requesting player's own
  // record below (for `player`/true rank) — it's stripped before the public
  // `entries` list is returned.
  const entries = [];
  try {
    for (let i = 0; i < scanKeys.length; i += GET_CONCURRENCY) {
      const batch = scanKeys.slice(i, i + GET_CONCURRENCY);
      const values = await Promise.all(batch.map((key) => kv.get(key, 'json').catch(() => null)));
      for (const v of values) {
        if (!v || typeof v.name !== 'string' || typeof v.score !== 'number') continue;
        entries.push({
          id: typeof v.id === 'string' ? v.id : null, // absent on pre-`id` records
          name: v.name,
          score: v.score,
          ts: typeof v.ts === 'number' ? v.ts : 0,
          message: typeof v.message === 'string' && v.message ? v.message : null,
        });
      }
    }
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
      truncated,
      player,
    },
    200
  );
}
