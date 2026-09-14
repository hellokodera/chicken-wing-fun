// Central tuning knobs. Almost every "feel" tweak lives here.

export const GAME = {
  WIDTH: 1280,
  HEIGHT: 720,

  GRAVITY: 820, // arcade world gravity — floaty, cartoonish arc (not realistic)
  ROUND_SECONDS: 90, // countdown length; no win/lose, just "time's up"
  COOLDOWN: 420, // ms auto-reload between throws (no manual reload)

  // --- throw tuning (reverse slingshot: grab the wing, drag it toward the tub;
  //     the wing flies the same way you drag, power grows with drag distance) ---
  MIN_DRAG: 14, // px — below this a press counts as a tap, not a throw
  MAX_DRAG: 230, // px — drag distance is capped here (max power)
  MIN_SPEED: 260, // launch speed at the tiniest drag
  MAX_SPEED: 1180, // launch speed at full drag

  // --- combo / scatter-shot reward ---
  // Two streak counters run in parallel, both reset by ANY miss:
  //   Tier B advances on every hit; Tier A only on a hit worth TIER_A_MIN+.
  // Reaching NEED in a row arms the next throw as a scatter shot (Tier A wins
  // ties → bigger shot). Both counters wipe once a scatter throw finishes.
  COMBO: {
    NEED: 3, // consecutive hits to arm a bonus throw
    TIER_A_MIN: 15, // hit value that also counts toward Tier A
    SCATTER_A: 5, // wings on a Tier-A bonus throw (main + 4)
    SCATTER_B: 3, // wings on a Tier-B bonus throw (main + 2)
    SPREAD_DEG: 5, // launch-angle gap between neighbouring scatter wings
    SPEED_STEP: 0.04, // each step out from the main wing trims launch speed by this
  },

  // --- layout, in the 1280x720 design space ---
  PENGUIN_BASE: { x: 180, y: 652 }, // where the penguin's feet are planted
  // Wings spawn here; the ready-wing hovers here. Rests right at the tip of the
  // penguin's NEAR (viewer-facing / screen-left) flipper in the neutral pose —
  // it hangs off the flipper's end, not up along its middle.
  HAND: { x: 74, y: 536 },
  GROUND_Y: 620, // floor line a missed wing bounces off

  TUB_W: 540, // on-screen tub width (height follows the art's aspect). ~17% up from 460.
  // y of the tub sprite's CENTRE. The tub art is a 3/4 top-down view, so its
  // visual floor-contact sits well above the sprite's bbox bottom; TUB_Y is
  // pushed down past bbox-bottom alignment until the tub's *base* reads level
  // with the penguin's feet plane (y 652). scoreAt() takes tubY/scale live, so
  // the rings follow. Was 525 @ TUB_W 460.
  TUB_Y: 566,
  TUB_MIN_X: 500, // nudged right from 470 so the larger tub clears the penguin at its leftmost
  TUB_MAX_X: 1040,
  TUB_SPEED: 110, // px/sec, constant — never escalates

  // Per-pose content bounding boxes (opaque pixels) measured from the art, so
  // every pose plants its feet at PENGUIN_BASE regardless of image padding.
  // ob = [x0, y0, x1, y1] in the source image's own pixels.
  PENGUIN_POSES: {
    neutral: { key: 'penguin_neutral', W: 1792, H: 2390, ob: [115, 227, 1677, 2175], dispH: 300 },
    windup: { key: 'penguin_throw1', W: 1500, H: 1409, ob: [177, 212, 1438, 1326], dispH: 300 },
    release: { key: 'penguin_throw2', W: 1500, H: 979, ob: [98, 124, 1003, 883], dispH: 300 },
  },

  // End screen, world coords. The art's top-left pill had a baked-in "SCORE"
  // word — that's been painted out (pristine art in raw-assets/ui/). Now the
  // live number goes INSIDE the pill (END_SCORE_POS = pill centre) and "SCORE"
  // is a plain label just above it (END_LABEL_POS).
  END_SCORE_POS: { x: 251, y: 180 },
  END_LABEL_POS: { x: 251, y: 82 },

  PALETTE: {
    sky: 0xbfe3ec,
    skyDeep: 0x8fcbda,
    tile: 0xf3f7f2,
    ink: 0x26313a,
    yellow: 0xffc93c,
    coral: 0xff6f59,
    coralDeep: 0xe85a46,
    white: 0xffffff,
  },

  // Title letters, each a different pastel (soft blue, dusty pink, pale yellow,
  // muted orange, sage green, coral) with a black outline per letter.
  TITLE_COLORS: ['#9DC3E6', '#E8B4C8', '#F5E1A4', '#F2B482', '#A9C5A0', '#FF8C7A'],
};
