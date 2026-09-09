import { GAME } from '../config.js';
import { addCover } from '../util/display.js';
import { simulateArc } from '../util/trajectory.js';
import { ZONE_TEXT_COLOR } from '../util/scoring.js';
import { Sfx } from '../util/sfx.js';
import Penguin from '../objects/Penguin.js';
import Tub from '../objects/Tub.js';
import Wing from '../objects/Wing.js';
import Hud from '../ui/Hud.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    addCover(this, 'bg');

    this.score = 0;
    this.remaining = GAME.ROUND_SECONDS;
    this.canThrow = true;
    this.aiming = false;
    this.roundOver = false;
    this.wings = [];
    this.aimStart = new Phaser.Math.Vector2();

    // combo / scatter-shot state
    this.comboA = 0; // consecutive hits worth TIER_A_MIN+
    this.comboB = 0; // consecutive hits of any value
    this.bonusArmed = 0; // 0, or the wing count for the next (scatter) throw
    this.bonusActive = false; // a scatter throw is in the air
    this.bonusWingsLeft = 0; // how many of its wings still need to resolve
    this.bonusTimeout = null;

    this.tub = new Tub(this);
    this.penguin = new Penguin(this);

    this.readyWing = this.add
      .image(GAME.HAND.x, GAME.HAND.y, 'wing')
      .setDepth(41)
      .setDisplaySize(80, 80);
    // A throw can only START on the wing. Give it a circular grab zone a bit
    // bigger than the sprite (~56px radius vs the 40px half-size) so young kids
    // don't need pixel precision, without being cartoonishly oversized now that
    // the wing itself is large. The radius is in the texture's own pixels;
    // Phaser undoes the sprite's scale when hit-testing, so width*0.7 with an
    // 80px display size lands at ~56px on screen.
    this.readyWing.setInteractive(
      new Phaser.Geom.Circle(
        this.readyWing.width / 2,
        this.readyWing.height / 2,
        this.readyWing.width * 0.7
      ),
      Phaser.Geom.Circle.Contains
    );
    this.readyWing.on('pointerdown', this.onWingDown, this);

    this.idleBob = this.tweens.add({
      targets: this.readyWing,
      y: GAME.HAND.y - 6,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    this.aimGfx = this.add.graphics().setDepth(70);

    this.hud = new Hud(this);
    this.hud.setScore(0);
    this.hud.setTime(this.remaining);

    // No global pointerdown: the throw is armed only by onWingDown (a press that
    // lands on the wing). move/up stay global so the drag keeps tracking after
    // the pointer leaves the wing.
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.roundOver) return;
        this.remaining -= 1;
        this.hud.setTime(Math.max(0, this.remaining));
        if (this.remaining <= 0) this.endRound();
      },
    });
  }

  // --- input -------------------------------------------------------------

  // A press that lands on the ready wing (and nowhere else) arms a throw.
  onWingDown(pointer) {
    if (!this.canThrow || this.roundOver || this.aiming) return;
    this.aiming = true;
    this.aimStart.set(pointer.x, pointer.y);
    this.idleBob.pause(); // stop the hover so it doesn't fight the drag
    this.penguin.windup();
  }

  onMove(pointer) {
    if (!this.aiming) return;
    const { dir, len } = this.aimVectors(pointer.x, pointer.y);
    // Nudge the wing a little way along the drag for tactile feedback; the throw
    // launches from wherever the wing ends up.
    const pull = Math.min(len, 22);
    this.readyWing.setPosition(GAME.HAND.x + dir.x * pull, GAME.HAND.y + dir.y * pull);
    this.drawAim(pointer.x, pointer.y);
  }

  onUp(pointer) {
    if (!this.aiming) return;
    this.aiming = false;
    this.aimGfx.clear();

    const { dir, speed, len } = this.aimVectors(pointer.x, pointer.y);
    if (len < GAME.MIN_DRAG) {
      this.resetReadyWing();
      this.penguin.neutral();
      return;
    }
    this.throwWing(this.readyWing.x, this.readyWing.y, dir, speed);
  }

  // Reverse slingshot: the wing flies the SAME way you drag it. Drag farther
  // forward for more power, capped at MAX_DRAG.
  aimVectors(px, py) {
    const drag = new Phaser.Math.Vector2(px - this.aimStart.x, py - this.aimStart.y);
    const len = drag.length();
    const power = Math.min(len, GAME.MAX_DRAG) / GAME.MAX_DRAG;
    const speed = GAME.MIN_SPEED + power * (GAME.MAX_SPEED - GAME.MIN_SPEED);
    const dir = len > 0 ? drag.clone().scale(1 / len) : new Phaser.Math.Vector2(1, 0);
    return { dir, power, speed, len };
  }

  drawAim(px, py) {
    const { dir, speed } = this.aimVectors(px, py);
    const ox = this.readyWing.x;
    const oy = this.readyWing.y;
    const g = this.aimGfx;
    g.clear();

    // The ONLY aim indicator: a dotted predicted arc in the drag direction —
    // dots shrink and fade with distance, ending near the landing spot.
    const pts = simulateArc(ox, oy, dir.x * speed, dir.y * speed);
    for (let i = 0; i < pts.length; i += 2) {
      const f = i / pts.length;
      g.fillStyle(0xffffff, 0.9 * (1 - f) + 0.12);
      g.fillCircle(pts[i].x, pts[i].y, 6 * (1 - f) + 2);
    }
  }

  // --- throwing --------------------------------------------------------

  throwWing(ox, oy, dir, speed) {
    this.canThrow = false;
    this.idleBob.pause();
    this.readyWing.setVisible(false);
    this.penguin.release();

    const scatter = this.bonusArmed; // 0 | SCATTER_B | SCATTER_A
    this.bonusArmed = 0;
    const baseAng = Math.atan2(dir.y, dir.x);

    if (scatter >= 2) {
      this.fireScatter(ox, oy, baseAng, speed, scatter);
      return;
    }

    this.spawnWing(ox, oy, baseAng, speed, false);
    Sfx.play(this, 'throw');
    this.time.delayedCall(GAME.COOLDOWN, () => {
      this.canThrow = true;
      this.resetReadyWing();
      if (!this.aiming) this.penguin.neutral();
    });
  }

  spawnWing(ox, oy, ang, speed, bonus) {
    const wing = new Wing(this, ox, oy);
    wing.bonus = bonus;
    wing.launch(Math.cos(ang) * speed, Math.sin(ang) * speed);
    this.wings.push(wing);
    return wing;
  }

  // Bonus throw: the aimed wing plus (count - 1) more, launched together at
  // angles bracketing the main arc so they land scattered around its spot.
  // Throwing stays locked until every one of them resolves (see endBonus).
  fireScatter(ox, oy, baseAng, speed, count) {
    this.bonusActive = true;
    this.bonusWingsLeft = count;

    const step = Phaser.Math.DegToRad(GAME.COMBO.SPREAD_DEG);
    const half = (count - 1) / 2; // 1 for the 3-wing, 2 for the 5-wing
    for (let i = 0; i < count; i++) {
      const k = i - half; // ..-2,-1,0,1,2..  (k === 0 is the true aimed shot)
      const jitter = k === 0 ? 0 : Phaser.Math.FloatBetween(-0.02, 0.02);
      const ang = baseAng + k * step + jitter;
      const sp = speed * (1 - Math.abs(k) * GAME.COMBO.SPEED_STEP);
      this.spawnWing(ox, oy, ang, sp, true);
    }

    const mega = count >= GAME.COMBO.SCATTER_A;
    Sfx.play(this, 'throw');
    Sfx.play(this, 'combo');
    Sfx.play(this, 'sparkle');
    this.cameras.main.flash(200, 255, 244, 194);
    this.cameras.main.shake(180, mega ? 0.006 : 0.004);
    this.scatterBanner(mega);
    this.hud.pulseCombo();

    this.time.delayedCall(GAME.COOLDOWN, () => {
      if (!this.aiming && this.bonusActive) this.penguin.neutral();
    });
    // safety net in case a wing never reports (wedged at an edge, etc.)
    this.bonusTimeout = this.time.delayedCall(5000, () => this.endBonus());
  }

  noteBonusResolved() {
    if (!this.bonusActive) return;
    this.bonusWingsLeft -= 1;
    if (this.bonusWingsLeft <= 0) this.endBonus();
  }

  // Every scatter wing has landed or missed: wipe BOTH streaks and hand over a
  // fresh wing so the next streak starts from scratch.
  endBonus() {
    if (!this.bonusActive) return;
    this.bonusActive = false;
    this.bonusWingsLeft = 0;
    if (this.bonusTimeout) {
      this.bonusTimeout.remove(false);
      this.bonusTimeout = null;
    }
    this.comboA = 0;
    this.comboB = 0;
    this.hud.setCombo(0, 0);

    if (this.roundOver) return;
    this.canThrow = true;
    this.resetReadyWing();
    if (!this.aiming) this.penguin.neutral();
  }

  // Drop a fresh wing back into the penguin's flipper, ready to be grabbed.
  resetReadyWing() {
    this.readyWing.setPosition(GAME.HAND.x, GAME.HAND.y).setVisible(true);
    this.idleBob.restart();
  }

  onWingCaught(wing, zone) {
    const x = wing.x;
    const y = wing.y;
    const bonus = wing.bonus;
    wing.destroy();

    this.score += zone;
    this.hud.setScore(this.score);
    this.splash(x, y);
    this.popScore(x, y, zone);
    Sfx.play(this, 'boop');
    Sfx.play(this, 'bounce'); // the "landed" pop — plays for a tub hit too, not just a floor miss

    if (zone >= 15) {
      this.sparkle(x, y);
      Sfx.play(this, 'sparkle');
    }

    if (bonus) {
      this.noteBonusResolved();
      return;
    }
    if (this.bonusActive || this.roundOver) return;

    // A normal throw scored — extend the streaks.
    this.comboB += 1;
    if (zone >= GAME.COMBO.TIER_A_MIN) this.comboA += 1;
    this.afterHit();
  }

  // A miss (from Wing: first floor bounce, or flew off-screen without landing).
  onWingMissed(wing) {
    if (wing.bonus) {
      this.noteBonusResolved();
      return;
    }
    if (this.bonusActive || this.roundOver) return;
    if (this.comboA === 0 && this.comboB === 0) return;
    this.comboA = 0;
    this.comboB = 0;
    this.hud.setCombo(0, 0);
  }

  // After a normal hit bumps a streak: refresh the HUD and, once a streak hits
  // NEED, arm the next throw as a scatter shot. Tier A wins ties (bigger shot).
  afterHit() {
    if (this.comboA >= GAME.COMBO.NEED) this.bonusArmed = GAME.COMBO.SCATTER_A;
    else if (this.comboB >= GAME.COMBO.NEED) this.bonusArmed = GAME.COMBO.SCATTER_B;

    this.hud.setCombo(this.comboB, this.bonusArmed);
    this.hud.bumpCombo();
  }

  scatterBanner(mega) {
    const label = this.add
      .text(GAME.WIDTH / 2, 232, mega ? 'MEGA SCATTER!' : 'SCATTER SHOT!', {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: mega ? '68px' : '58px',
        fontStyle: '700',
        color: mega ? '#FF6F59' : '#FFC93C',
        stroke: '#26313A',
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(80)
      .setScale(0.4);
    this.tweens.add({ targets: label, scale: 1, duration: 300, ease: 'Back.Out' });
    this.tweens.add({
      targets: label,
      alpha: 0,
      y: 196,
      delay: 650,
      duration: 450,
      ease: 'Cubic.In',
      onComplete: () => label.destroy(),
    });
  }

  // --- juice ----------------------------------------------------------

  splash(x, y) {
    const ripple = this.add
      .ellipse(x, y, 32, 16, GAME.PALETTE.skyDeep)
      .setStrokeStyle(4, GAME.PALETTE.ink)
      .setDepth(50);
    this.tweens.add({
      targets: ripple,
      scaleX: 3.2,
      scaleY: 2.6,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.Out',
      onComplete: () => ripple.destroy(),
    });

    const ring = this.add.ellipse(x, y, 26, 13).setStrokeStyle(4, GAME.PALETTE.white).setDepth(50);
    this.tweens.add({
      targets: ring,
      scaleX: 4.2,
      scaleY: 3.2,
      alpha: 0,
      duration: 560,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
  }

  popScore(x, y, zone) {
    const big = zone >= 15;
    const label = this.add
      .text(x, y, `+${zone}`, {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: big ? '54px' : '36px',
        fontStyle: '700',
        color: ZONE_TEXT_COLOR[zone] || '#ffffff',
        stroke: '#26313A',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({
      targets: label,
      y: y - 90,
      alpha: 0,
      scale: big ? 1.5 : 1.15,
      duration: 900,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  sparkle(x, y) {
    const emitter = this.add
      .particles(x, y, 'spark', {
        speed: { min: 130, max: 340 },
        lifespan: 620,
        quantity: 18,
        scale: { start: 1, end: 0 },
        rotate: { start: 0, end: 220 },
        tint: [0xffc93c, 0xff6f59, 0xffffff, 0x9dc3e6, 0xa9c5a0],
        emitting: false,
      })
      .setDepth(58);
    emitter.explode(18);
    this.time.delayedCall(750, () => emitter.destroy());
  }

  // --- round flow ---------------------------------------------------

  // delayMs 600 = the "time's up" beat when the clock runs out; the HUD X button
  // passes 0 so it feels instant.
  endRound(delayMs = 600) {
    if (this.roundOver) return;
    this.roundOver = true;
    this.aiming = false;
    this.aimGfx.clear();
    this.time.delayedCall(delayMs, () =>
      this.scene.start('ScoreEntryScene', { score: this.score })
    );
  }

  update(time, delta) {
    this.tub.update(delta);
    for (const wing of this.wings) wing.tick(delta, this.tub, this);
    this.wings = this.wings.filter((w) => w.active);
  }
}
