import { GAME } from '../config.js';
import { scoreAt } from '../util/scoring.js';
import { Sfx } from '../util/sfx.js';

// A thrown chicken wing. Arcade body for the gravity arc; collisions with the
// tub and floor are handled manually in tick() so we can use the perspective
// ring ovals rather than a bounding box.
export default class Wing extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y) {
    super(scene, x, y, 'wing');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(40);
    // Matches the ready-wing's 2x size so there's no pop between the wing you
    // grab and the wing that flies. Scoring is point-based, so size is cosmetic.
    this.setDisplaySize(80, 80);
    this.body.setAllowGravity(true);

    this.phase = 'flight'; // flight -> bounced -> settled
    this.bounces = 0;
    this.spin = 0; // rad/sec tumble
    this.bonus = false; // set true for wings that are part of a scatter shot
  }

  launch(vx, vy) {
    this.body.setVelocity(vx, vy);
    this.spin = (vx >= 0 ? 1 : -1) * Phaser.Math.FloatBetween(6, 11);
  }

  // Called every frame by GameScene.
  tick(dtMs, tub, scene) {
    if (!this.active) return;

    this.rotation += this.spin * (dtMs / 1000); // tumble
    const v = this.body.velocity;

    // Catch test — only while descending, and only once we've dropped near the
    // rim. The -48 gate is scaled to the larger tub (was -40 at TUB_W 460).
    if (this.phase === 'flight' && v.y > 0 && this.y > tub.worldY - 48) {
      const zone = scoreAt(this.x, this.y, tub.worldX, tub.worldY, tub.scaleFactor);
      if (zone > 0) {
        scene.onWingCaught(this, zone);
        return;
      }
    }

    // Floor: one bounce, then it settles and fades. First floor contact is a
    // definitive miss (the catch test above only runs while phase === 'flight').
    if (this.y >= GAME.GROUND_Y && this.phase !== 'settled') {
      if (this.bounces === 0) {
        this.bounces = 1;
        this.phase = 'bounced';
        this.y = GAME.GROUND_Y - 1;
        this.body.setVelocity(v.x * 0.55, -Math.abs(v.y) * 0.42);
        this.spin *= 0.5;
        Sfx.play(scene, 'bounce');
        scene.onWingMissed(this);
        scene.time.delayedCall(2000, () => this.fadeAway());
      } else {
        this.phase = 'settled';
        this.y = GAME.GROUND_Y - 1;
        this.body.setVelocity(0, 0);
        this.body.setAllowGravity(false);
        this.spin = 0;
      }
    }

    // Gone off the edges — clean up. If it never landed, that's a miss too.
    if (this.x < -80 || this.x > GAME.WIDTH + 80 || this.y > GAME.HEIGHT + 150) {
      if (this.phase === 'flight') scene.onWingMissed(this);
      this.destroy();
    }
  }

  fadeAway() {
    if (!this.active) return;
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      y: this.y - 12,
      duration: 450,
      ease: 'Sine.In',
      onComplete: () => this.destroy(),
    });
  }
}
