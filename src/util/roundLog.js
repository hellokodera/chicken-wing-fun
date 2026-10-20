// Anonymous round logging. One POST per finished round (timer ran to zero) so we
// can see how often kids replay. Sends only { sessionId, score }; the server adds
// the timestamp. The session ID lives in sessionStorage (survives a refresh,
// resets when the tab closes) — no cookies, no localStorage, no fingerprinting.

const STORAGE_KEY = 'cwf_session';
let memoryId = null; // fallback for this page load if sessionStorage is unavailable

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function sessionId() {
  try {
    let id = sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    if (!memoryId) memoryId = randomId();
    return memoryId;
  }
}

/** Fire-and-forget: never throws, never blocks, never shows anything. */
export function logRound(score) {
  try {
    fetch('/api/log-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId(), score }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never affect the game */
  }
}
