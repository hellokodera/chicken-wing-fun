import { GAME } from '../config.js';

// The thrower. Three still poses (neutral -> windup -> release) swapped on the
// same sprite. Each pose's art has different padding, so we align by the measured
// opaque bounding box: every pose lands its feet exactly on PENGUIN_BASE.
export default class Penguin {
  constructor(scene) {
    this.scene = scene;
    this.base = GAME.PENGUIN_BASE;
    this.sprite = scene.add
      .image(this.base.x, this.base.y, GAME.PENGUIN_POSES.neutral.key)
      .setOrigin(0.5, 1)
      .setDepth(30);
    this.setPose('neutral');
  }

  setPose(name) {
    const p = GAME.PENGUIN_POSES[name];
    const [x0, y0, x1, y1] = p.ob;
    const obW = x1 - x0;
    const obH = y1 - y0;
    const scale = p.dispH / obH;

    this.sprite.setTexture(p.key);
    this.sprite.setAngle(0);
    this.sprite.setScale(scale);
    // Shift so the pose's content-bbox bottom-centre sits on the fixed base point.
    this.sprite.x = this.base.x - ((x0 + obW / 2) - p.W / 2) * scale;
    this.sprite.y = this.base.y + (p.H - y1) * scale;
    this.pose = name;
  }

  neutral() {
    this.setPose('neutral');
  }

  windup() {
    this.setPose('windup');
  }

  release() {
    this.setPose('release');
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 0 },
      duration: 200,
      ease: 'Sine.Out',
    });
  }
}
