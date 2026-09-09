import { GAME } from '../config.js';

// Add an image scaled to *cover* the whole canvas (like CSS background-size: cover),
// centred. Used for the full-screen backgrounds.
export function addCover(scene, key, depth = 0) {
  const img = scene.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, key).setDepth(depth);
  img.setScale(Math.max(GAME.WIDTH / img.width, GAME.HEIGHT / img.height));
  return img;
}
