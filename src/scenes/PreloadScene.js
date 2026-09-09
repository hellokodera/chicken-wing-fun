import { makeRuntimeTextures } from '../util/textures.js';

// Loads every image (and the few wired sound effects) the game uses.
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    this.load.image('bg', 'assets/images/background/bg.png');
    this.load.image('tub', 'assets/images/tub/tub.png');
    this.load.image('wing', 'assets/images/wing/wing.png');
    this.load.image('penguin_neutral', 'assets/images/penguin/neutral.png');
    this.load.image('penguin_throw1', 'assets/images/penguin/throw1.png');
    this.load.image('penguin_throw2', 'assets/images/penguin/throw2.png');
    this.load.image('start_bg', 'assets/images/ui/start_screen.png');
    // Isolated bathtub "PLAY AGAIN" button (tub cut out of the full-scene art,
    // transparent background) — used as the Play Again button on the leaderboard.
    this.load.image('play_again_tub', 'assets/images/ui/play_again_tub.png');

    // SFX — keyed to the hooks already sprinkled through the game via Sfx.play().
    // 'throw' fires on wing release; 'bounce' fires when a wing lands, whether in
    // the tub or on the floor. Per-clip volumes live in src/util/sfx.js.
    this.load.audio('throw', 'assets/audio/z_c-swoosh-quick-swipe-460351.mp3');
    this.load.audio('bounce', 'assets/audio/creatorshome-sharp-pop-328170.mp3');

    // Background music tracks — StartScene picks one at random. See util/music.js.
    this.load.audio('bgm1', 'assets/audio/goldensoundlabs-bouncy-beats-cheerful-opening-501857.mp3');
    this.load.audio('bgm2', 'assets/audio/goldensoundlabs-days-of-fun-cheerful-opening-510269.mp3');
    this.load.audio('bgm3', 'assets/audio/oceanframemusic-comedy-474551.mp3');
  }

  create() {
    makeRuntimeTextures(this);
    this.scene.start('StartScene');
  }
}
