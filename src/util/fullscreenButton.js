// Fullscreen toggle button — bottom-right corner, video-player convention.
//
// A persistent DOM element (not a per-scene Phaser object) so it: (a) shows on
// every scene it's meant to appear on with no duplicated per-scene code, and
// (b) can sit, via z-index, ABOVE orientationGuard's portrait overlay
// (z-index 2147483000) so it stays reachable even while that overlay is
// blocking the canvas beneath it. Two fixed-position siblings appended
// directly to <body> — the browser hit-tests by stacking order regardless of
// DOM nesting, so the higher z-index simply wins the click; no coordination
// with orientationGuard.js is needed beyond that.
//
// Feature-detected: the button is only ever created where the Fullscreen API
// is supported (checked once, exported as fullscreenSupported() so
// orientationGuard.js can match its overlay copy to the same condition). iOS
// Safari on iPhone never defines requestFullscreen() on non-video elements,
// so it never appears there. iPad IS supported since iPadOS 16.4 — no
// device special-casing, the same check just naturally allows it through.
//
// Shown while a scene in VISIBLE_SCENES is active — currently StartScene and
// GameScene. (LeaderboardScene has its own Share/Support pills in this same
// corner; TutorialScene has its Next/Play nav nearby — both are otherwise left
// alone rather than risk overlapping existing UI there.) It's ALSO shown on
// every other scene while the device is in portrait — i.e. exactly when
// orientationGuard's "rotate your device" overlay is covering them — since
// that overlay explicitly offers this button as an alternative to rotating,
// and everything else on screen is already dimmed/paused underneath it.
//
// TWO POSITIONING MODES, chosen live in reposition() by portraitNow():
//
//   DOCKED (landscape — StartScene/GameScene as normally played): anchored to
//   game.canvas's own on-screen rect, in WORLD coordinates like every other
//   HUD element. Split into a visible CHIP and a bigger invisible HIT zone —
//   see the sizing comment below for why that split exists.
//
//   CORNER (portrait — the orientationGuard fallback): anchored to the
//   physical window corner instead, NOT the canvas. In portrait, Scale.FIT
//   shrinks the canvas to a small, vertically-centred strip — "docked to the
//   canvas" would land the button in the middle of the screen, right on top
//   of the overlay's centred card, not in the corner at all. That was a real
//   bug (found by hand-tracing reposition() against an actual portrait
//   viewport, not the icon/sizing work below). CORNER mode also explicitly
//   checks the card's own rect and nudges clear of it by CARD_GAP — belt and
//   suspenders on top of "anchor to the true corner", since a tall/wrapped
//   card on a short viewport could otherwise still end up close to it.
//
// SIZE/POSITION IN DOCKED MODE IS SPLIT IN TWO — a real-touch-target hit
// zone, and a smaller visible chip inside it — because a single box can't
// satisfy both "meets Apple HIG (44x44pt) / Material (48x48dp) touch-target
// minimums, with 16-24px clearance from the screen edge" AND "clear of the
// tub's full range of motion" on realistic phone screens. The tub's opaque
// silhouette (see assets/images/tub/tub.png) isn't shallowest right at the
// corner — it's deepest a bit further IN, and only tapers back down near the
// true edge — so pushing a same-sized box further from the corner (for edge
// clearance) walks it further INTO the tub's danger band, not away from it.
// Concretely, for a box anchored flush bottom-right, pixel analysis of the
// tub's full TUB_MIN_X..TUB_MAX_X sweep shows there's no margin/size
// combination above ~74 world units that clears it at all — and 74 world
// units is only ~30-40 real px on a typical phone, well under the 44-48px
// floor. So in DOCKED mode:
//   - HIT (invisible): sized/positioned purely in real CSS px — a floor of
//     48px (covers both guidelines) with 20px real clearance from the
//     canvas's actual edge, independent of game-world scale.
//   - CHIP (visible): sized/positioned in world units like every other HUD
//     element (scales with Scale.FIT), kept at the verified-safe spot from
//     the tub-clearance analysis. It's a child of the HIT element but
//     absolutely positioned by its own world-derived offset, NOT centered
//     within it — so on the smallest screens the chip may sit slightly
//     off-center inside its own tap zone rather than risk the tub. The click
//     listener is on the outer HIT element, so a tap anywhere on the visible
//     chip still registers via normal DOM bubbling even where it's offset.
// CORNER mode has no such conflict (no tub on screen, scene is paused) so
// chip and hit are simply the same box there.
//
// ICON PROPORTIONS: the bracket geometry (OUTER/INNER/ARM) and stroke width
// are defined as a ratio of REF_SIZE (54 — the chip size this look was
// originally tuned at), then scaled by CHIP_SIZE / REF_SIZE. Drawn into an
// SVG viewBox sized to CHIP_SIZE, so the whole icon scales uniformly with
// however big the chip actually renders — keeping the icon filling the same
// proportion of the chip regardless of chip size, exactly matching how the
// original Phaser-drawn version scaled (everything moved through one uniform
// canvas transform). The chip's border-width is scaled the same way, live in
// reposition() (chipSize * (5 / REF_SIZE)) — it's a CSS px value with no
// built-in equivalent to Phaser's automatic canvas scaling, so unlike
// border-radius (a %, which scales for free) it has to be recomputed
// whenever the chip's actual rendered size changes.

import { GAME } from '../config.js';
import { portraitNow, GUARD_ID } from './orientation.js';

const VISIBLE_SCENES = new Set(['StartScene', 'GameScene']);

// Chip (visible, DOCKED mode): world size 64, world margin 20 from the true
// corner — verified via pixel analysis of tub.png's opaque bounds against the
// tub's full sweep: worst-case tub reach in this x-range tops out at world
// y~=589.5, 46.5px clear of this chip's top edge (world y 636).
const CHIP_SIZE = 64;
const CHIP_MARGIN = 20;
const REF_SIZE = 54; // chip size the icon/border proportions below were tuned at
const ICON_SCALE = CHIP_SIZE / REF_SIZE;

// Hit target (invisible, DOCKED mode): real px, independent of world scale.
const HIT_MIN_PX = 48; // >= Material's 48dp and Apple HIG's 44pt
const HIT_MARGIN_PX = 20; // within the requested 16-24px edge clearance

// CORNER mode (portrait): a single real-px box, no chip/hit split needed.
const CORNER_SIZE_PX = 48;
const CORNER_MARGIN_PX = 20;
const CARD_GAP_PX = 20; // min clearance from the orientation-guard card

const OUTER = 12 * ICON_SCALE; // bracket pivot distance from centre, "expand" icon
const INNER = 6 * ICON_SCALE; // bracket pivot distance from centre, "compress" icon
const ARM = 8 * ICON_SCALE; // bracket arm length
const STROKE_W = 6 * ICON_SCALE;
const BORDER_RATIO = 5 / REF_SIZE; // chip border-width, as a fraction of chip size

export function fullscreenSupported() {
  return (
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function'
  );
}

export function installFullscreenButton(game) {
  if (typeof document === 'undefined' || !game || !fullscreenSupported()) return null;

  // Outer element = the actual tap target. No visible styling of its own.
  const hit = document.createElement('button');
  hit.type = 'button';
  hit.setAttribute('aria-label', 'Toggle fullscreen');
  hit.style.cssText = `
    position:fixed; z-index:2147483001; display:none; padding:0; margin:0;
    background:transparent; border:none; cursor:pointer;
    touch-action:manipulation; -webkit-tap-highlight-color:transparent;
  `;

  // Inner element = the visible chip (background, border, icon).
  const chip = document.createElement('div');
  chip.style.cssText = `
    position:absolute; box-sizing:border-box; pointer-events:none;
    background:rgba(243,247,242,.95); border-style:solid; border-color:#26313a;
    border-radius:${(16 / CHIP_SIZE) * 100}%;
  `;
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', `0 0 ${CHIP_SIZE} ${CHIP_SIZE}`);
  icon.style.cssText = 'width:100%;height:100%;display:block;';
  chip.appendChild(icon);
  hit.appendChild(chip);
  document.body.appendChild(hit);

  function drawIcon(isFullscreen) {
    const R = isFullscreen ? INNER : OUTER;
    const c = CHIP_SIZE / 2;
    let d = '';
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const px = c + dx * R;
      const py = c + dy * R;
      const ax = isFullscreen ? px + dx * ARM : px - dx * ARM;
      const ay = isFullscreen ? py + dy * ARM : py - dy * ARM;
      d += `M${px},${py} L${ax},${py} M${px},${py} L${px},${ay} `;
    }
    icon.innerHTML = `<path d="${d}" stroke="#26313a" stroke-width="${STROKE_W}" fill="none"/>`;
  }
  drawIcon(Boolean(document.fullscreenElement));

  function repositionDocked() {
    const canvas = game.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / GAME.WIDTH;
    const scaleY = rect.height / GAME.HEIGHT; // == scaleX — Scale.FIT preserves aspect

    const chipSize = CHIP_SIZE * scaleX;
    const chipLeft = rect.left + (GAME.WIDTH - CHIP_MARGIN - CHIP_SIZE) * scaleX;
    const chipTop = rect.top + (GAME.HEIGHT - CHIP_MARGIN - CHIP_SIZE) * scaleY;

    const hitSize = Math.max(chipSize, HIT_MIN_PX);
    const hitLeft = rect.right - HIT_MARGIN_PX - hitSize;
    const hitTop = rect.bottom - HIT_MARGIN_PX - hitSize;

    hit.style.width = `${hitSize}px`;
    hit.style.height = `${hitSize}px`;
    hit.style.left = `${hitLeft}px`;
    hit.style.top = `${hitTop}px`;

    chip.style.width = `${chipSize}px`;
    chip.style.height = `${chipSize}px`;
    chip.style.left = `${chipLeft - hitLeft}px`;
    chip.style.top = `${chipTop - hitTop}px`;
    chip.style.borderWidth = `${chipSize * BORDER_RATIO}px`;
  }

  function repositionCorner() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = CORNER_SIZE_PX;
    let left = vw - CORNER_MARGIN_PX - size;
    let top = vh - CORNER_MARGIN_PX - size;

    const card = document.querySelector(`#${GUARD_ID} .og-card`);
    if (card) {
      const c = card.getBoundingClientRect();
      const right = left + size;
      const bottom = top + size;
      const gapX = Math.max(c.left - right, left - c.right);
      const gapY = Math.max(c.top - bottom, top - c.bottom);
      const tooClose = !(gapX >= CARD_GAP_PX || gapY >= CARD_GAP_PX);
      if (tooClose) {
        // Prefer pushing down toward the true screen edge — that's where the
        // corner convention wants it anyway.
        const pushedDown = Math.min(vh - CORNER_MARGIN_PX - size, c.bottom + CARD_GAP_PX);
        if (pushedDown + size <= vh - CORNER_MARGIN_PX) {
          top = pushedDown;
        } else {
          // Card is tall enough that pushing down runs off-screen — nudge
          // right instead.
          const pushedRight = Math.min(vw - CORNER_MARGIN_PX - size, c.right + CARD_GAP_PX);
          left = pushedRight;
        }
      }
    }

    hit.style.width = `${size}px`;
    hit.style.height = `${size}px`;
    hit.style.left = `${left}px`;
    hit.style.top = `${top}px`;

    chip.style.width = `${size}px`;
    chip.style.height = `${size}px`;
    chip.style.left = '0px';
    chip.style.top = '0px';
    chip.style.borderWidth = `${size * BORDER_RATIO}px`;
  }

  function reposition() {
    if (hit.style.display === 'none') return;
    if (portraitNow()) repositionCorner();
    else repositionDocked();
  }

  // --- visibility: VISIBLE_SCENES active, or the device is in portrait ---
  let visible = false;
  function syncVisibility() {
    const onOwnScene = game.scene.getScenes(true).some((s) => VISIBLE_SCENES.has(s.scene.key));
    const active = onOwnScene || portraitNow();
    if (active === visible) return;
    visible = active;
    hit.style.display = active ? 'block' : 'none';
    if (active) reposition();
  }
  const PRE_STEP =
    (window.Phaser && Phaser.Core && Phaser.Core.Events && Phaser.Core.Events.PRE_STEP) ||
    'prestep';
  game.events.on(PRE_STEP, syncVisibility);

  window.addEventListener('resize', reposition, { passive: true });
  window.addEventListener('orientationchange', reposition, { passive: true });
  document.addEventListener('fullscreenchange', () => {
    drawIcon(Boolean(document.fullscreenElement));
    reposition();
  });

  hit.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        try {
          screen.orientation.unlock();
        } catch {
          // ignore — nothing useful to do if unlock itself throws
        }
      }
      return;
    }
    document.documentElement
      .requestFullscreen()
      .then(() => {
        // Best-effort: not universally supported, and can fail even when
        // fullscreen itself just succeeded — that's expected, not an error.
        // When it DOES succeed the browser actually rotates the rendered
        // viewport to landscape, which orientationGuard's own resize /
        // matchMedia listeners pick up on their own — no extra wiring needed
        // here to hide its overlay.
        if (screen.orientation && typeof screen.orientation.lock === 'function') {
          screen.orientation.lock('landscape').catch(() => {});
        }
      })
      .catch(() => {});
  });

  syncVisibility();
  return { reposition, syncVisibility };
}
