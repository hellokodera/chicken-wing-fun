/**
 * Cloudflare Pages Function — POST /api/submit-score
 *
 * Records ONE KV entry per submitted round. It never overwrites and never caps
 * to a top-N: every round is kept as its own record so leaderboard views and
 * later stats (replay rate, score distribution, unique players) can be built by
 * listing these entries. The read/query endpoint is a separate, later step.
 *
 * KV binding required: `chicken_wing_fun_leaderboard`
 *   Cloudflare dashboard -> Pages project -> Settings -> Functions ->
 *   "KV namespace bindings" -> add:
 *     Variable name : chicken_wing_fun_leaderboard
 *     KV namespace  : 838b7906967c44f29d7e84f4b874f6e7
 *
 *   ...or, if the Pages project uses a wrangler.toml:
 *     [[kv_namespaces]]
 *     binding = "chicken_wing_fun_leaderboard"
 *     id      = "838b7906967c44f29d7e84f4b874f6e7"
 *
 * Key format: `score:<ts16>:<uuid>`
 *   - ts16 : Date.now() in ms, zero-padded to 16 chars, so a plain string sort
 *            of the `score:` prefix is chronological (headroom past year 5000).
 *   - uuid : crypto.randomUUID(), so two submissions in the same millisecond
 *            can never collide.
 */

const MAX_NAME_LEN = 20;
const MIN_SCORE = 0;
const MAX_SCORE = 5000; // sanity ceiling — well beyond a real 120-second round

// Same-origin on Pages doesn't strictly need CORS, but these keep local dev,
// preview deploys and any future subdomain working. No credentials/cookies are
// involved, so a wildcard origin is safe here — CORS only governs whether other
// origins may READ the response, not who may POST (validation does that).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
      ...headers,
    },
  });
}

// Drop C0 control characters (0-31) and DEL (127) — newlines, tabs, NULs, etc.
// Done by code point so the source file stays free of literal control bytes.
function stripControlChars(str) {
  let out = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code > 31 && code !== 127) out += ch;
  }
  return out;
}

/** CORS preflight. */
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Fallback for GET / PUT / PATCH / DELETE / HEAD — POST and OPTIONS have their
 *  own handlers, which take precedence over this catch-all. */
export function onRequest() {
  return json({ error: 'Method not allowed — use POST.' }, 405, { Allow: 'POST, OPTIONS' });
}

export async function onRequestPost({ request, env }) {
  // 1. Body must be a JSON object.
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Request body must be a JSON object.' }, 400);
  }

  // 2a. name — required string; strip control chars, trim, enforce 1..MAX_NAME_LEN.
  if (typeof body.name !== 'string') {
    return json({ error: '"name" is required and must be a string.' }, 400);
  }
  const name = stripControlChars(body.name).trim();
  if (name.length === 0) {
    return json({ error: '"name" must not be empty.' }, 400);
  }
  if (name.length > MAX_NAME_LEN) {
    return json({ error: `"name" must be ${MAX_NAME_LEN} characters or fewer.` }, 400);
  }

  // 2b. score — required finite non-negative whole number, at or below the cap.
  const { score } = body;
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return json({ error: '"score" is required and must be a number.' }, 400);
  }
  if (!Number.isInteger(score)) {
    return json({ error: '"score" must be a whole number.' }, 400);
  }
  if (score < MIN_SCORE) {
    return json({ error: '"score" must not be negative.' }, 400);
  }
  if (score > MAX_SCORE) {
    return json({ error: `"score" is above the accepted maximum (${MAX_SCORE}).` }, 400);
  }

  // 3. timestamp — always server-authoritative. Any client-supplied `timestamp`
  //    in the body is deliberately ignored (not trusted).
  const ts = Date.now();
  const isoTimestamp = new Date(ts).toISOString();

  // 4. Collision-proof, roughly time-sortable key + the record to store.
  const id = crypto.randomUUID();
  const key = `score:${String(ts).padStart(16, '0')}:${id}`;
  const record = {
    id,
    name,
    score,
    timestamp: isoTimestamp,
    ts,
    schema: 1,
  };

  // 5. Write — one put per round, no read-modify-write, no cap.
  if (!env || !env.chicken_wing_fun_leaderboard) {
    return json({ error: 'Score service is temporarily unavailable.' }, 500);
  }
  try {
    await env.chicken_wing_fun_leaderboard.put(key, JSON.stringify(record), {
      // small list()-visible summary so leaderboard reads later don't need a
      // get() per key.
      metadata: { name, score, ts },
    });
  } catch {
    return json({ error: 'Could not save the score. Please try again.' }, 500);
  }

  return json({ success: true, key, record }, 201);
}
