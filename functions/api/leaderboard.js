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
 *     truncated: <boolean>   // true if the scan hit MAX_PAGES (total is a floor)
 *   }
 *   - ts = ms-epoch of the submission (from the record's list() metadata).
 *   - message = the sanitised note, or null (older/no-message records).
 *   - An empty namespace returns { entries: [], total: 0, truncated: false }
 *     (HTTP 200) — never an error, never mock data.
 *
 * Query: ?limit=<1..100>   (default 10)
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

  const raw = parseInt(new URL(request.url).searchParams.get('limit'), 10);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;

  // --- gather every record from list() metadata (no get() per key) ---
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

  return json(
    {
      entries: entries.slice(0, limit),
      total: entries.length,
      truncated: Boolean(cursor), // cursor is only still set if we bailed at MAX_PAGES
    },
    200
  );
}
