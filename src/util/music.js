// Background music that never stops. A track is picked at random from the pool
// and plays THREE times in a row, then a new track is picked at random (repeats
// allowed — the same one can come up again) and plays three times, and so on for
// the whole session. The Sound is owned by the game-global sound manager, not
// any scene, so scene transitions don't touch it. StartScene.create() calls
// startRandom() each time it loads, so the pick is re-rolled on a fresh load /
// return to the menu.

export const BGM_KEYS = ['bgm1', 'bgm2', 'bgm3'];

// Sits comfortably under the swoosh (0.4) and pop (0.38) SFX, and stays gentle
// for young kids. One number to tweak if it needs to come down or up.
const BGM_VOLUME = 0.22;

// How many consecutive plays of a track before re-rolling.
const PLAYS_PER_TRACK = 3;

let current = null; // the Sound playing right now
let currentKey = null; // which track that is
let playsLeft = 0; // plays remaining for currentKey, including the one running
let mgr = null; // game-global sound manager
let cache = null; // game-global asset cache

function loadedKeys() {
  return BGM_KEYS.filter((k) => cache && cache.audio.exists(k));
}

function playKey(key) {
  if (current) {
    current.destroy(); // stops it + removes its listeners
    current = null;
  }
  if (!mgr) return;

  currentKey = key;
  const snd = mgr.add(key, { volume: BGM_VOLUME }); // no per-track loop — we chain
  current = snd;
  snd.once('complete', () => {
    if (current !== snd) return; // a fresh pick already took over
    playsLeft -= 1;
    if (playsLeft > 0) playKey(currentKey); // same track again
    else rollFreshTrack(); // that was the 3rd play — pick a new one
  });
  // If the audio context is still locked (no user gesture yet on a fresh page),
  // Phaser queues this and starts it on the first tap/keypress.
  snd.play();
}

function rollFreshTrack() {
  const keys = loadedKeys();
  if (!keys.length) {
    if (current) {
      current.destroy();
      current = null;
    }
    return; // nothing loaded — stay silent
  }
  playsLeft = PLAYS_PER_TRACK;
  playKey(keys[Math.floor(Math.random() * keys.length)]); // repeats are fine
}

export const Music = {
  startRandom(scene) {
    mgr = scene.sound;
    cache = scene.cache;
    rollFreshTrack();
  },
};
