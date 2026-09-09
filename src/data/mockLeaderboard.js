// Placeholder leaderboard data. Hardcoded fake name+score entries so the
// end-of-round Leaderboard screen has something to render — real backend
// integration replaces this later. Kept unsorted-agnostic: LeaderboardScene
// merges the live player in and sorts, so order here doesn't matter.
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
