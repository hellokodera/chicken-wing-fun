import { GAME } from '../config.js';

// The moving target. Slides left<->right at a constant speed, forever.
export default class Tub {
  constructor(scene) {
    this.scene = scene;
    this.sprite = scene.add.image(GAME.TUB_MIN_X, GAME.TUB_Y, 'tub').setDepth(20);
    this.scaleFactor = GAME.TUB_W / this.sprite.width; // uniform; used by scoreAt()
    this.sprite.setScale(this.scaleFactor);
    this.dir = 1;
  }

  get worldX() {
    return this.sprite.x;
  }

  get worldY() {
    return this.sprite.y;
  }

  update(dtMs) {
    let nx = this.sprite.x + GAME.TUB_SPEED * (dtMs / 1000) * this.dir;
    if (nx <= GAME.TUB_MIN_X) {
      nx = GAME.TUB_MIN_X;
      this.dir = 1;
    } else if (nx >= GAME.TUB_MAX_X) {
      nx = GAME.TUB_MAX_X;
      this.dir = -1;
    }
    this.sprite.x = nx;
  }
}
