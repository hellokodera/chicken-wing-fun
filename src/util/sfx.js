// Sound hooks. Call Sfx.play(scene, key) anywhere in the game; it stays a no-op
// until a clip is loaded for that key in PreloadScene (this.load.audio(key, ...)),
// then it just works. Only 'throw' and 'bounce' have clips wired today.

export const SFX_KEYS = ['throw', 'bounce', 'boop', 'sparkle', 'button', 'combo'];

// Per-clip default volume (0..1). Keeps the airy/sharp ones gentle for young
// kids. Keys not listed default to 0.5; an explicit volume arg always wins.
const SFX_VOLUME = {
  throw: 0.4, // release swoosh — soft
  bounce: 0.38, // landing pop (tub or floor) — sharp, keep it low
};

export const Sfx = {
  play(scene, key, volume) {
    if (scene && scene.cache && scene.cache.audio.exists(key)) {
      const v = volume == null ? SFX_VOLUME[key] || 0.5 : volume;
      scene.sound.play(key, { volume: v });
    }
    // else: silently no-op (key has no loaded clip yet).
  },
};
