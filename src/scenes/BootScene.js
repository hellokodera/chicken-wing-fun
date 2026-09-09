// Loads web fonts before anything renders text, then hands off to Preload.
// No loading screen for v1 — the assets are tiny.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      this.scene.start('PreloadScene');
    };

    if (window.WebFont) {
      window.WebFont.load({
        google: { families: ['Fredoka:500,600,700', 'Baloo 2:600,700'] },
        active: go,
        inactive: go,
      });
      // Safety net in case the font CDN is slow or blocked.
      this.time.delayedCall(3500, go);
    } else {
      go();
    }
  }
}
