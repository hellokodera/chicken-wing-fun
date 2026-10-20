/**
 * Cloudflare Pages Function — GET /api/stats?key=<STATS_KEY>
 *
 * Private round summary. Wrong, missing or unconfigured key -> bare 404.
 * The secret is the `STATS_KEY` environment variable (never in the repo).
 *
 * Everything is counted from kv.list() alone — no per-record get():
 *   - `round:` keys carry {s: sessionId, p: score, t: ts} as key metadata.
 *   - `score:` keys (leaderboard submissions) are counted by name only; their
 *     timestamp is embedded in the key (`score:<ts16>:<uuid>`), so only those at
 *     or after the first surviving round record are counted. That keeps older
 *     leaderboard entries from skewing the comparison.
 * Cost: one list operation per 1,000 keys of each prefix (free plan: 1,000
 * list requests/day).
 *
 * Caveats: round records expire after 90 days, so "first round" moves forward
 * over time. Early exits via the HUD X button are never logged as rounds but can
 * still be submitted, so `roundsNotSubmitted` can understate (even go negative).
 * list() can lag a fresh write by up to ~60s.
 */

const PAGE_SIZE = 1000;
const MAX_PAGES = 50; // safety cap per prefix (50,000 keys)

async function listAll(kv, prefix) {
  const keys = [];
  let cursor;
  let pages = 0;
  let truncated = false;
  do {
    const res = await kv.list({ prefix, limit: PAGE_SIZE, cursor });
    keys.push(...res.keys);
    cursor = res.list_complete ? undefined : res.cursor;
    if (cursor && ++pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
  } while (cursor);
  return { keys, truncated };
}

function notFound() {
  return new Response('Not found', { status: 404 });
}

export async function onRequestGet({ request, env }) {
  const expected = env && env.STATS_KEY;
  const given = new URL(request.url).searchParams.get('key');
  if (!expected || !given || given !== expected) return notFound();

  const kv = env.chicken_wing_fun_leaderboard;
  if (!kv) return new Response('Service unavailable', { status: 500 });

  try {
    const [rounds, scores] = await Promise.all([listAll(kv, 'round:'), listAll(kv, 'score:')]);

    const sessions = new Set();
    for (const k of rounds.keys) {
      if (k.metadata && typeof k.metadata.s === 'string') sessions.add(k.metadata.s);
    }
    const totalRounds = rounds.keys.length;
    const distinctSessions = sessions.size;

    // list() is lexicographic and keys are zero-padded, so the first is the oldest.
    const firstRoundTs = totalRounds ? Number(rounds.keys[0].name.split(':')[1]) : null;
    let submissionsSinceFirstRound = null;
    let roundsNotSubmitted = null;
    if (firstRoundTs !== null) {
      submissionsSinceFirstRound = scores.keys.filter(
        (k) => Number(k.name.split(':')[1]) >= firstRoundTs
      ).length;
      roundsNotSubmitted = totalRounds - submissionsSinceFirstRound;
    }

    return new Response(
      JSON.stringify(
        {
          totalRounds,
          distinctSessions,
          avgRoundsPerSession: distinctSessions
            ? Math.round((totalRounds / distinctSessions) * 100) / 100
            : 0,
          firstRound: firstRoundTs ? new Date(firstRoundTs).toISOString() : null,
          submissionsSinceFirstRound,
          roundsNotSubmitted,
          truncated: rounds.truncated || scores.truncated,
        },
        null,
        2
      ),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      }
    );
  } catch {
    return new Response('Error', { status: 500 });
  }
}
