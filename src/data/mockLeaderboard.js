// ⚠️ UNUSED as of the real-backend wiring (2026-09-09). LeaderboardScene now
// fetches GET /api/leaderboard and renders exactly what the API returns — no
// mock, no fallback. This file is kept only so the data isn't lost; nothing
// imports it. Do NOT re-import it as a fallback: an empty leaderboard must show
// the "no scores yet" empty state, not placeholder names.
export const MOCK_LEADERBOARD = [
  { name: 'Mia', score: 640 },
  { name: 'Leo', score: 585 },
  { name: 'Zoe', score: 520 },
  { name: 'Sam', score: 480 },
  { name: 'Ava', score: 435 },
  { name: 'Kai', score: 400 },
  { name: 'Nina', score: 360 },
  { name: 'Otis', score: 325 },
  { name: 'Rue', score: 300 },
  { name: 'Pip', score: 265 },
];
