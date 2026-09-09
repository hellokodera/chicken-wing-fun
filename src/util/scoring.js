// Hit-zones for the tub, derived by pixel analysis of assets/images/tub/tub.png
// (1376 x 768). The rings are drawn in 3/4 perspective, so they are NOT concentric
// circles — each colour band is an oval with its own centre and radii, and the
// centres drift up/left toward the back of the tub. All values below are in the
// tub image's own pixel space; the image centre is (688, 384).
//
// `gen` is a per-ring generosity multiplier on the radii — forgiving hit boxes
// for ages 5-9, with an extra-generous bullseye.
const RINGS = [
  { score: 20, cx: 689, cy: 384, rx: 123, ry: 64, gen: 1.30 }, // coral centre (bullseye)
  { score: 15, cx: 686, cy: 384, rx: 190, ry: 104, gen: 1.16 }, // sage green
  { score: 10, cx: 680, cy: 380, rx: 254, ry: 132, gen: 1.10 }, // dusty pink
  { score: 5, cx: 680, cy: 366, rx: 324, ry: 159, gen: 1.08 }, // orange
  { score: 1, cx: 685, cy: 336, rx: 388, ry: 176, gen: 1.06 }, // yellow (outer rim)
];

const IMG_CX = 688;
const IMG_CY = 384;

/**
 * Score for a wing landing at (worldX, worldY), given the tub sprite's current
 * world position and uniform scale. Returns 0 when the wing is outside every
 * ring (a miss).
 */
export function scoreAt(worldX, worldY, tubX, tubY, tubScale) {
  const ix = (worldX - tubX) / tubScale + IMG_CX;
  const iy = (worldY - tubY) / tubScale + IMG_CY;
  for (const r of RINGS) {
    const nx = (ix - r.cx) / (r.rx * r.gen);
    const ny = (iy - r.cy) / (r.ry * r.gen);
    if (nx * nx + ny * ny <= 1) return r.score;
  }
  return 0;
}

// Colours for the floating "+N" popup, keyed by zone score. Pulled from the
// requested ring palette (yellow -> coral) for visual cohesion.
export const ZONE_TEXT_COLOR = {
  1: '#FFE07A',
  5: '#FFC93C',
  10: '#FF9F45',
  15: '#FF6F59',
  20: '#E85A46',
};
