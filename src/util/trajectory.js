import { GAME } from '../config.js';

// Cheap forward-Euler sim of the wing's flight, used only to draw the aim guide.
// Uses the same gravity as the real arcade body so the dotted preview matches
// where the wing actually goes.
export function simulateArc(x, y, vx, vy, steps = 55, dt = 1 / 40) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    vy += GAME.GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    pts.push({ x, y });
    if (y > GAME.GROUND_Y || x > GAME.WIDTH + 40 || x < -40) break;
  }
  return pts;
}
