import { GAME } from '../config.js';
import { Sfx } from '../util/sfx.js';

// Two rounded pills, drawn in code: SCORE top-left, TIME top-right. Plus a small
// streak badge under the SCORE pill, and an X button in the top-right corner
// (right of the timer) that ends the round on the spot.
const CLOSE_SIZE = 54;
const CLOSE_GAP = 14; // between the timer pill and the X

export default class Hud {
  constructor(scene) {
    this.scene = scene;
    this.scoreText = this.pill('left', 'SCORE');
    // pull the timer in from the edge to leave room for the X in the corner
    this.timeText = this.pill('right', 'TIME', 20 + CLOSE_SIZE + CLOSE_GAP);
    this.buildCombo();
    this.buildCloseButton();
  }

  pill(anchor, label, edgeInset = 20) {
    const w = 216;
    const h = 62;
    const y = 18;
    const px = anchor === 'left' ? edgeInset : GAME.WIDTH - edgeInset - w;
    const s = this.scene;

    const g = s.add.graphics().setDepth(100);
    g.fillStyle(0xf3f7f2, 0.95);
    g.fillRoundedRect(px, y, w, h, 22);
    g.lineStyle(5, 0x26313a, 1);
    g.strokeRoundedRect(px, y, w, h, 22);

    s.add
      .text(px + 20, y + h / 2, label, {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: '19px',
        fontStyle: '700',
        color: '#8FA0AC',
      })
      .setOrigin(0, 0.5)
      .setDepth(101);

    return s.add
      .text(px + w - 18, y + h / 2, '0', {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: '34px',
        fontStyle: '700',
        color: '#26313A',
      })
      .setOrigin(1, 0.5)
      .setDepth(101);
  }

  // --- end-round X button -------------------------------------------
  // Rounded square in the top-right corner, just right of the TIME pill, styled
  // like the HUD pills. Tap = end the round now and go to the End screen with the
  // current score. No confirm.
  buildCloseButton() {
    const s = this.scene;
    const size = CLOSE_SIZE;
    const cy = 18 + 62 / 2; // 49 — same vertical centre as the pill row
    const cx = GAME.WIDTH - 20 - size / 2; // top-right corner, 20px from the edge

    const g = s.add.graphics().setDepth(100);
    g.fillStyle(0xf3f7f2, 0.95);
    g.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 16);
    g.lineStyle(5, 0x26313a, 1);
    g.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 16);
    const a = 12; // half-length of each X stroke
    g.lineStyle(6, 0x26313a, 1);
    g.beginPath();
    g.moveTo(cx - a, cy - a);
    g.lineTo(cx + a, cy + a);
    g.moveTo(cx + a, cy - a);
    g.lineTo(cx - a, cy + a);
    g.strokePath();

    const hitW = size + 18; // a bit generous for small fingers
    const hit = s.add.zone(cx, cy, hitW, hitW).setDepth(102);
    hit.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, hitW, hitW),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    hit.on('pointerdown', () => {
      if (this._closing) return;
      this._closing = true;
      Sfx.play(s, 'button');
      s.endRound(0);
    });
  }

  setScore(v) {
    this.scoreText.setText(String(v));
  }

  setTime(seconds) {
    this.timeText.setText(String(seconds));
    this.timeText.setColor(seconds <= 10 ? '#E85A46' : '#26313A');
  }

  // --- combo streak badge ---------------------------------------------

  buildCombo() {
    const s = this.scene;
    const w = 176;
    const h = 46;
    // centred container so the whole badge can scale/pulse as one unit
    const c = s.add.container(20 + w / 2, 90 + h / 2).setDepth(100).setVisible(false);
    const g = s.add.graphics();
    const t = s.add
      .text(0, 1, '', {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: '21px',
        fontStyle: '700',
        color: '#26313A',
      })
      .setOrigin(0.5);
    c.add([g, t]);
    this._combo = { c, g, t, w, h };
  }

  // streak = current Tier-B (any-hit) count; armed > 0 means the next throw is a
  // scatter shot.
  setCombo(streak, armed) {
    const { c, g, t, w, h } = this._combo;
    if (streak <= 0 && !armed) {
      c.setVisible(false);
      return;
    }
    c.setVisible(true);
    g.clear();
    g.fillStyle(armed ? 0xffc93c : 0xf3f7f2, 0.96);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    g.lineStyle(4, 0x26313a, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    t.setText(armed ? 'BONUS!' : `STREAK  ${streak}`);
  }

  bumpCombo() {
    this.scene.tweens.add({
      targets: this._combo.c,
      scale: { from: 1, to: 1.18 },
      yoyo: true,
      duration: 130,
    });
  }

  pulseCombo() {
    this.scene.tweens.add({
      targets: this._combo.c,
      scale: { from: 1, to: 1.4 },
      yoyo: true,
      duration: 170,
      repeat: 2,
    });
  }
}
