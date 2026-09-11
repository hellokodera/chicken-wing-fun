import { GAME } from '../config.js';

// Shared UI bits for the end-of-round screens. Same visual language as the HUD
// pills and TutorialScene buttons: cream fill, bold ink outline, Fredoka text,
// flat colours.

const INK = 0x26313a;
const FONT = '"Fredoka", "Baloo 2", sans-serif';

// Real px floor for tap targets — Apple HIG's 44pt / Material's 48dp
// minimum, the same standard applied to the fullscreen toggle (see
// util/fullscreenButton.js's HIT_MIN_PX). Padding a hit box purely in WORLD
// units can look generous at the game's 1280x720 design resolution but
// still land under 48 real CSS px once Scale.FIT scales the canvas down for
// a phone screen (commonly ~0.5-0.6x in landscape) — so this converts the
// floor into world units using the scene's current live scale before it's
// applied, and grows w/h in place (never shrinks a box already bigger).
export function hitFloor(scene, w, h, minPx = 48) {
  const ds = scene && scene.scale && scene.scale.displayScale;
  const scaleX = (ds && ds.x) || 1;
  const scaleY = (ds && ds.y) || 1;
  return {
    w: scaleX > 0 ? Math.max(w, minPx / scaleX) : w,
    h: scaleY > 0 ? Math.max(h, minPx / scaleY) : h,
  };
}

// A rounded "pill" drawn in code and centred on (cx, cy). Matches the HUD SCORE
// pill (cream 0xf3f7f2 fill, 5px ink outline). The corner radius defaults to
// half the height, so the ends are always full semicircles no matter how tall
// the pill is — pass an explicit `radius` only for a deliberate non-pill shape.
// Returns the graphics object.
export function drawPill(scene, cx, cy, w, h, opts = {}) {
  const {
    fill = 0xf3f7f2,
    fillAlpha = 1,
    stroke = INK,
    strokeWidth = 5,
    radius = h / 2,
    depth = 10,
  } = opts;

  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, radius);
  if (strokeWidth > 0) {
    g.lineStyle(strokeWidth, stroke, 1);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, radius);
  }
  return g;
}

// A tappable pill button: a non-interactive visual container plus a separate,
// slightly-oversized invisible Rectangle as the hit target (a Shape GameObject
// gives Phaser a clean hit test from frame one — same pattern as
// TutorialScene.makeButton). Press/hover feedback scales the visual only.
// Corner radius defaults to half the height so the ends stay fully rounded.
// Returns { view, hit, setEnabled(on) }.
export function pillButton(scene, x, y, opts) {
  const {
    w = 190,
    h = 60,
    label = '',
    fill = GAME.PALETTE.coral,
    textColor = '#ffffff',
    fontSize = '26px',
    radius = h / 2,
    depth = 20,
    onClick = () => {},
  } = opts;

  const view = scene.add.container(x, y).setDepth(depth);
  const g = scene.add.graphics();
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.lineStyle(5, INK, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  const text = scene.add
    .text(0, 1, label, {
      fontFamily: FONT,
      fontSize,
      fontStyle: '700',
      color: textColor,
    })
    .setOrigin(0.5);
  view.add([g, text]);

  const { w: hw, h: hh } = hitFloor(scene, w + 22, h + 16);
  const hit = scene.add.rectangle(x, y, hw, hh).setDepth(depth + 1);
  hit.setInteractive({
    hitArea: new Phaser.Geom.Rectangle(0, 0, hw, hh),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    useHandCursor: true,
  });
  hit.on('pointerdown', () => {
    view.setScale(0.95);
    onClick();
  });
  hit.on('pointerover', () => view.setScale(1.04));
  hit.on('pointerout', () => view.setScale(1));
  hit.on('pointerup', () => view.setScale(1));
  hit.on('pointerupoutside', () => view.setScale(1));

  return {
    view,
    hit,
    setEnabled(on) {
      hit.input.enabled = on;
      hit.setVisible(on);
      view.setVisible(on).setScale(1);
    },
  };
}
