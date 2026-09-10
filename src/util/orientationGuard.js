// Portrait-orientation guard.
//
// The game is landscape-only (1280x720, Scale.FIT + CENTER_BOTH). This drops a
// full-screen DOM overlay whenever the device is held in portrait and freezes
// the running Phaser scenes so nothing progresses until it's rotated back.
//
// WHY game.scene.pause() (not game.pause(), not a manual per-scene flag):
//   Pausing a scene sets it to PAUSED, which stops *that scene's* update loop,
//   its Tween manager (e.g. GameScene.idleBob), its Clock — this.time, so the
//   round-countdown time.addEvent and every delayedCall freeze — and its Arcade
//   physics step. It does NOT touch the game-global sound manager. The music in
//   util/music.js is added via game.sound (it isn't owned by any scene — see the
//   comment there: "scene transitions don't touch it"), so it keeps playing
//   straight through a pause/resume cycle. game.pause() is avoided precisely
//   because it halts the whole game, sound manager included. No scene code
//   changes are needed.
//
// This is a layer on top of Scale.FIT — the scale mode is not touched.

const ID = 'cwf-orientation-guard';
const FADE_MS = 250;

const CSS = `
#${ID}{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;
 justify-content:center;background:rgba(38,49,58,.66);opacity:0;pointer-events:none;
 transition:opacity ${FADE_MS}ms ease;-webkit-tap-highlight-color:transparent;}
#${ID}.is-on{opacity:1;pointer-events:auto;}
#${ID} .og-card{display:flex;flex-direction:column;align-items:center;gap:20px;
 padding:32px 44px;background:#f3f7f2;border:5px solid #26313a;border-radius:36px;
 box-shadow:0 12px 40px rgba(0,0,0,.3);max-width:80vw;}
#${ID} .og-icon{width:96px;height:96px;transform-origin:50% 58%;
 animation:og-rock 1.9s ease-in-out infinite;}
#${ID} .og-text{margin:0;text-align:center;color:#26313a;
 font-family:"Fredoka","Baloo 2",system-ui,-apple-system,sans-serif;
 font-weight:700;font-size:23px;line-height:1.25;}
@keyframes og-rock{0%,100%{transform:rotate(-14deg)}55%{transform:rotate(76deg)}}
@media (prefers-reduced-motion:reduce){
 #${ID}{transition:none}#${ID} .og-icon{animation:none}}
`;

// Flat cartoon: a pastel phone that rocks between orientations, with a coral
// rotate-arrow. Matches the game's ink-outline / rounded / pastel language.
const ICON = `
<svg class="og-icon" viewBox="0 0 100 100" fill="none" aria-hidden="true">
  <path d="M22 41a30 30 0 0 1 16-19" stroke="#ff6f59" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M39 17l3.6 12.4-12.7 2.6z" fill="#ff6f59"/>
  <rect x="35" y="16" width="30" height="58" rx="8.5" fill="#bfe3ec" stroke="#26313a" stroke-width="5"/>
  <rect x="41" y="24" width="18" height="33" rx="3" fill="#ffffff"/>
  <circle cx="50" cy="65.5" r="3.2" fill="#26313a"/>
</svg>`;

// Primary signal: matchMedia. Complement: raw viewport ratio, for browsers whose
// (orientation: portrait) query lags or misreports (some Android WebViews,
// desktop device-emulation modes). Either signal saying "portrait" wins — a
// false negative (game running sideways) is worse than a brief false positive.
function portraitNow() {
  const mm =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(orientation: portrait)').matches;
  const ratio = window.innerHeight > window.innerWidth;
  return Boolean(mm || ratio);
}

export function installOrientationGuard(game) {
  if (typeof document === 'undefined' || !game) return null;

  // --- overlay DOM (built once) ---
  if (!document.getElementById(ID + '-css')) {
    const st = document.createElement('style');
    st.id = ID + '-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  let el = document.getElementById(ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ID;
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-label', 'Turn your device to play');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="og-card">${ICON}<p class="og-text">Turn your device<br>to play!</p></div>`;
    // Absorb anything that lands on the overlay so it can't reach the canvas.
    // (The overlay also physically covers the canvas, so input is blocked
    // regardless — this is belt-and-braces.)
    [
      'pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend',
      'touchmove', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu',
    ].forEach((t) =>
      el.addEventListener(
        t,
        (e) => {
          e.stopPropagation();
          if (t === 'contextmenu') e.preventDefault();
        },
        { passive: false }
      )
    );
    document.body.appendChild(el);
  }

  // --- pause / resume bookkeeping ---
  const pausedByGuard = new Set();
  let isPortrait = false;

  function pauseActiveScenes() {
    game.scene.getScenes(true).forEach((s) => {
      const key = s.scene.key;
      if (game.scene.isPaused(key) || pausedByGuard.has(key)) return;
      game.scene.pause(key);
      pausedByGuard.add(key);
    });
  }
  function resumePausedScenes() {
    pausedByGuard.forEach((key) => {
      if (game.scene.isPaused(key)) game.scene.resume(key);
    });
    pausedByGuard.clear();
  }

  function evaluate() {
    const p = portraitNow();
    if (p === isPortrait) return;
    isPortrait = p;
    el.setAttribute('aria-hidden', p ? 'false' : 'true');
    if (p) {
      el.classList.add('is-on');
      pauseActiveScenes();
    } else {
      el.classList.remove('is-on');
      resumePausedScenes();
    }
  }

  // Coalesce a burst of resize / orientation events into one check per frame.
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      evaluate();
    });
  };

  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(orientation: portrait)');
    if (mq.addEventListener) mq.addEventListener('change', schedule);
    else if (mq.addListener) mq.addListener(schedule); // Safari < 14
  }
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });

  // Safety net: while portrait, keep pausing any scene that starts DURING the
  // hold (e.g. a scene transition that was already in flight when rotation
  // happened). Cheap — a short loop over the handful of active scenes, and only
  // while portrait. The game loop keeps ticking even with every scene paused.
  const PRE_STEP =
    (window.Phaser && Phaser.Core && Phaser.Core.Events && Phaser.Core.Events.PRE_STEP) ||
    'prestep';
  game.events.on(PRE_STEP, () => {
    if (isPortrait) pauseActiveScenes();
  });

  evaluate(); // set the initial state
  return { evaluate };
}
