/**
 * Cloudflare Pages Function — POST /api/log-round
 *
 * Anonymous count of finished rounds (timer ran to zero), whether or not the
 * player later submits a name. Body: { sessionId, score }.
 *
 * Stores ONLY session id, score and a server timestamp — nothing from the
 * request itself (no IP, user agent, headers or location) is read or saved.
 *
 * Key:   `round:<ts16>:<uuid>`  (same scheme as `score:` keys; never matched by
 *        the leaderboard, which lists the `score:` prefix only)
 * Value: "1" (placeholder) — the data lives in KV key METADATA {s, p, t} so
 *        /api/stats can count rounds from list() alone, with no per-key reads.
 * Expiry: 90 days via `expirationTtl` (seconds from the write).
 *
 * Uses the same KV binding as submit-score: `chicken_wing_fun_leaderboard`.
 */

const MIN_SCORE = 0;
const MAX_SCORE = 5000; // same ceiling as submit-score
const SESSION_RE = /^[a-z0-9]{16,40}$/;
const TTL_SECONDS = 90 * 24 * 60 * 60; // 7,776,000

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

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export function onRequest() {
  return json({ error: 'Method not allowed — use POST.' }, 405, { Allow: 'POST, OPTIONS' });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Request body must be a JSON object.' }, 400);
  }

  const { sessionId, score } = body;
  if (typeof sessionId !== 'string' || !SESSION_RE.test(sessionId)) {
    return json({ error: '"sessionId" is invalid.' }, 400);
  }
  if (typeof score !== 'number' || !Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
    return json({ error: '"score" must be a whole number in range.' }, 400);
  }

  const kv = env && env.chicken_wing_fun_leaderboard;
  if (!kv) return json({ error: 'Service unavailable.' }, 500);

  const ts = Date.now();
  const key = `round:${String(ts).padStart(16, '0')}:${crypto.randomUUID()}`;
  try {
    await kv.put(key, '1', {
      expirationTtl: TTL_SECONDS,
      metadata: { s: sessionId, p: score, t: ts },
    });
  } catch {
    return json({ error: 'Could not log the round.' }, 500);
  }
  return json({ ok: true }, 201);
}
