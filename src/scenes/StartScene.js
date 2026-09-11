import { GAME } from '../config.js';
import { addCover } from '../util/display.js';
import { Sfx } from '../util/sfx.js';
import { Music } from '../util/music.js';

// Title screen. Uses start_screen.png as a full-canvas background (its title area
// is blank) and renders "CHICKEN WING FUN" as live, per-letter pastel text.
export default class StartScene extends Phaser.Scene {
  constructor() {
    super('StartScene');
  }

  create() {
    addCover(this, 'start_bg');
    // Re-roll and start looping background music. It keeps playing right through
    // Tutorial / Gameplay / End (it's a game-global sound, not scene-owned).
    Music.startRandom(this);
    this.buildCredit();
    this.buildTitle();

    const hint = this.add
      .text(GAME.WIDTH / 2, GAME.HEIGHT - 32, 'tap anywhere to play', {
        fontFamily: '"Baloo 2", "Fredoka", sans-serif',
        fontSize: '26px',
        fontStyle: '700',
        color: '#26313A',
      })
      .setOrigin(0.5)
      .setAlpha(0.85);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    const start = (pointer, currentlyOver) => {
      // TEMP DIAGNOSTIC — remove alongside fullscreenButton.js's dbg() once
      // the "fullscreen button does nothing on StartScene" bug is confirmed
      // fixed. This is a GLOBAL pointerdown listener (not tied to any game
      // object), and Phaser's window-level touch listener feeds taps on the
      // fullscreen button's DOM button (outside the canvas) into Phaser's
      // own pointer system too — so this can fire from a tap that was meant
      // for that button, not "the canvas." Logging the pointer's world
      // coords + what it's over lets us confirm whether that's happening.
      console.log('[fs-debug][StartScene] "tap anywhere" pointerdown', {
        x: pointer.x,
        y: pointer.y,
        eventTarget: pointer.event && pointer.event.target && pointer.event.target.tagName,
        currentlyOverCount: currentlyOver ? currentlyOver.length : null,
      });
      Sfx.play(this, 'button');
      this.scene.start('TutorialScene');
    };
    this.input.once('pointerdown', start);
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.keyboard.once('keydown-ENTER', start);
  }

  // Two-line credit, centred, sitting in the clear band above the title. Both
  // lines bigger than the "tap to play" hint and smaller than the title; the
  // name is the larger of the two. Plain dark grey, no outline. Sits high enough
  // to leave a comfortable gap above the title (~65px) and clear of the top edge.
  buildCredit() {
    this.add
      .text(GAME.WIDTH / 2, 150, 'Ethan Lee', {
        fontFamily: '"Baloo 2", "Fredoka", sans-serif',
        fontSize: '40px',
        fontStyle: '700',
        color: '#48525B',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME.WIDTH / 2, 192, 'presents', {
        fontFamily: '"Baloo 2", "Fredoka", sans-serif',
        fontSize: '28px',
        fontStyle: '600',
        color: '#48525B',
      })
      .setOrigin(0.5);
  }

  buildTitle() {
    const text = 'CHICKEN WING FUN';
    const size = 62;
    // Dropped from y98 into the clear band between the penguins' feet (~y273)
    // and the tub graphic (~y344) — clear of the decorative background blobs.
    const container = this.add.container(0, 312);
    let x = 0;
    let ci = 0;

    for (const ch of text) {
      if (ch === ' ') {
        x += size * 0.42;
        continue;
      }
      const letter = this.add
        .text(x, 0, ch, {
          fontFamily: '"Fredoka", "Baloo 2", sans-serif',
          fontSize: `${size}px`,
          fontStyle: '700',
          color: GAME.TITLE_COLORS[ci % GAME.TITLE_COLORS.length],
          stroke: '#26313A',
          strokeThickness: 10,
        })
        .setOrigin(0, 0.5);
      letter.setShadow(0, 6, 'rgba(0,0,0,0.18)', 0, true, true);
      container.add(letter);

      this.tweens.add({
        targets: letter,
        y: -10,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
        delay: ci * 60,
      });

      x += letter.width + 6;
      ci++;
    }

    container.x = (GAME.WIDTH - x) / 2;
  }
}
