import { GAME } from './config.js';
import { installOrientationGuard } from './util/orientationGuard.js';
import { installFullscreenButton } from './util/fullscreenButton.js';
import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import StartScene from './scenes/StartScene.js';
import TutorialScene from './scenes/TutorialScene.js';
import GameScene from './scenes/GameScene.js';
import ScoreEntryScene from './scenes/ScoreEntryScene.js';
import LeaderboardScene from './scenes/LeaderboardScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  backgroundColor: '#BFE3EC',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: GAME.GRAVITY }, debug: false },
  },
  // DOM container so the name-entry screen can use a real <input> (mobile soft
  // keyboard); Phaser keeps it aligned with the FIT-scaled canvas.
  dom: { createContainer: true },
  scene: [
    BootScene,
    PreloadScene,
    StartScene,
    TutorialScene,
    GameScene,
    ScoreEntryScene,
    LeaderboardScene,
  ],
};

const game = new Phaser.Game(config);

// Landscape-only: pause scenes + show a "rotate your device" overlay in portrait.
// A DOM layer on top of Scale.FIT; does not change the scale config above.
installOrientationGuard(game);

// Bottom-right fullscreen toggle — Start + Game screens, plus any scene while
// portrait (as an alternative to the rotate overlay above). A DOM layer, not
// a Scale.FIT change — see util/fullscreenButton.js.
installFullscreenButton(game);
