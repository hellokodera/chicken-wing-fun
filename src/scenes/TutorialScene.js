import { GAME } from '../config.js';
import { addCover } from '../util/display.js';
import { Sfx } from '../util/sfx.js';
import { hitFloor } from '../ui/widgets.js';

// Three-step how-to-play screen, between StartScene and GameScene. Same look as
// the rest of the game: bathroom bg, a tile-coloured card with a bold ink
// outline, Fredoka/Baloo text, flat colours. Each step has a heading, a line of
// kid-friendly copy, and a small looping animation. Nav is deliberately plain:
// Back / Next (Play Now on the last step) and an always-there Skip.
const STEPS = [
  {
    heading: 'Grab the wing',
    body: "Tap and hold the chicken wing in the penguin's flipper.",
  },
  {
    heading: 'Aim your throw',
    body: 'Pull the wing the way you want it to go, then let go. Pull farther to throw farther!',
  },
  {
    heading: 'Get a bonus!',
    body: 'Splash the tub 3 times in a row for a bonus! Hit the middle 3 times for an even bigger one!',
    // Line 1 measures ~937px unwrapped at the shared 24px body font — wider
    // than the other steps' 860px wrap, so it would wrap to 2 lines there.
    // Scoped to this step only (still well inside CARD's 1000px width) so
    // steps 1 & 2 keep their original wrap untouched.
    bodyWrapWidth: 960,
    // second line, below the paragraph above — rendered as separate Text
    // segments (see showStep()) so only "90 seconds" can be bold while the
    // rest matches the paragraph's normal weight/color.
    body2: [{ text: "You'll have " }, { text: '90 seconds', bold: true }, { text: ', throw as many wings as you can!' }],
  },
];

const CARD = { x: GAME.WIDTH / 2, y: 92, w: 1000, h: 500 };
const INK = 0x26313a;
const TILE = 0xf3f7f2;
const CORAL = 0xff6f59;

export default class TutorialScene extends Phaser.Scene {
  constructor() {
    super('TutorialScene');
  }

  create() {
    this._leaving = false;
    this._navBusy = false;

    addCover(this, 'bg');
    this.add
      .rectangle(GAME.WIDTH / 2, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, INK, 0.34)
      .setDepth(1);

    const card = this.add.graphics().setDepth(2);
    card.fillStyle(TILE, 0.97);
    card.fillRoundedRect(CARD.x - CARD.w / 2, CARD.y, CARD.w, CARD.h, 30);
    card.lineStyle(5, INK, 1);
    card.strokeRoundedRect(CARD.x - CARD.w / 2, CARD.y, CARD.w, CARD.h, 30);

    // Nav buttons are built ONCE and live for the whole scene — never inside the
    // per-step layer (which fades in) and never destroyed/recreated on a step
    // change. That keeps their hit areas live and stable from the first frame;
    // showStep() just toggles which ones are enabled. (The earlier version put
    // them in an alpha-tweened container and rebuilt them every step, which left
    // them briefly un-hittable — the "first click does nothing" bug.)
    this.nav = {
      // Bottom-middle, on the same baseline as Back / Next / Play Now but with a
      // wide gap on each side (nearest neighbour edges are ~230px away).
      skip: this.makeButton(GAME.WIDTH / 2, 652, {
        w: 124,
        h: 46,
        label: 'SKIP',
        fill: TILE,
        textCss: '#26313A',
        fontSize: '22px',
        onClick: () => this.go('skip'),
      }),
      back: this.makeButton(244, 652, {
        w: 176,
        h: 60,
        label: 'BACK',
        fill: TILE,
        textCss: '#26313A',
        arrow: 'left',
        arrowColor: INK,
        onClick: () => this.go('back'),
      }),
      next: this.makeButton(GAME.WIDTH - 250, 652, {
        w: 190,
        h: 60,
        label: 'NEXT',
        fill: CORAL,
        arrow: 'right',
        arrowColor: 0xffffff,
        onClick: () => this.go('fwd'),
      }),
      play: this.makeButton(GAME.WIDTH - 250, 652, {
        w: 240,
        h: 62,
        label: 'PLAY NOW',
        fill: CORAL,
        onClick: () => this.go('fwd'),
      }),
    };

    this.input.keyboard.on('keydown-RIGHT', () => this.go('fwd'));
    this.input.keyboard.on('keydown-LEFT', () => this.go('back'));
    this.input.keyboard.on('keydown-ENTER', () => this.go('fwd'));
    this.input.keyboard.on('keydown-SPACE', () => this.go('fwd'));
    this.input.keyboard.on('keydown-ESC', () => this.go('skip'));

    this.step = 1;
    this.stepTweens = [];
    this.showStep(1);
  }

  // --- navigation ----------------------------------------------------------

  // Every nav request (button or key) funnels through here. It debounces with a
  // flag and defers the actual work off the input callback with delayedCall(0),
  // so we never rebuild the scene / start another scene mid input-dispatch.
  go(action) {
    if (this._navBusy || this._leaving) return;
    this._navBusy = true;
    Sfx.play(this, 'button');
    this.time.delayedCall(0, () => {
      this._navBusy = false;
      if (this._leaving) return;
      if (action === 'skip') this.startGame();
      else if (action === 'back') {
        if (this.step > 1) this.showStep(this.step - 1);
      } else if (this.step >= STEPS.length) this.startGame(); // 'fwd' on last step
      else this.showStep(this.step + 1);
    });
  }

  startGame() {
    if (this._leaving) return;
    this._leaving = true;
    this.clearStep();
    this.scene.start('GameScene');
  }

  // --- step lifecycle ----------------------------------------------------

  clearStep() {
    (this.stepTweens || []).forEach((t) => t && t.remove && t.remove());
    this.stepTweens = [];
    if (this.stepLayer) {
      this.stepLayer.destroy(); // holds only non-interactive content
      this.stepLayer = null;
    }
  }

  setNavForStep(n) {
    this.nav.skip.setEnabled(true);
    this.nav.back.setEnabled(n > 1);
    this.nav.next.setEnabled(n < STEPS.length);
    this.nav.play.setEnabled(n >= STEPS.length);
  }

  showStep(n) {
    n = Phaser.Math.Clamp(n, 1, STEPS.length);
    this.clearStep();
    this.step = n;
    const layer = this.add.container(0, 0).setDepth(10);
    this.stepLayer = layer;
    this.stepTweens = [];

    const s = STEPS[n - 1];
    const head = this.add
      .text(GAME.WIDTH / 2, 166, s.heading, {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: '42px',
        fontStyle: '700',
        color: '#26313A',
      })
      .setOrigin(0.5);
    const body = this.add
      .text(GAME.WIDTH / 2, 214, s.body, {
        fontFamily: '"Baloo 2", "Fredoka", sans-serif',
        fontSize: '24px',
        fontStyle: '600',
        color: '#3D474F',
        align: 'center',
        wordWrap: { width: s.bodyWrapWidth || 860 },
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0);
    layer.add([head, body]);

    // Optional second line below the body paragraph — a run of Text
    // segments laid out left-to-right and centred as a group, so a subset
    // (marked `bold`) can be bold while the rest keeps the paragraph's own
    // size/weight/color. Positioned off body's own rendered height so it
    // sits right under it regardless of how many lines the paragraph wraps to.
    if (s.body2) {
      const LINE_GAP = 8; // matches body's own lineSpacing between wrapped lines
      const lineY = body.y + body.height + LINE_GAP;
      const pieces = s.body2.map((seg) =>
        this.add
          .text(0, lineY, seg.text, {
            fontFamily: '"Baloo 2", "Fredoka", sans-serif',
            fontSize: '24px',
            fontStyle: seg.bold ? '700' : '600',
            color: '#3D474F',
          })
          .setOrigin(0, 0)
      );
      const totalW = pieces.reduce((w, p) => w + p.width, 0);
      let x = GAME.WIDTH / 2 - totalW / 2;
      pieces.forEach((p) => {
        p.x = x;
        x += p.width;
      });
      layer.add(pieces);
    }

    if (n === 1) this.buildStep1(layer);
    else if (n === 2) this.buildStep2(layer);
    else this.buildStep3(layer);

    this.setNavForStep(n);

    // fade only the (non-interactive) content
    layer.setAlpha(0);
    this.stepTweens.push(
      this.tweens.add({ targets: layer, alpha: 1, duration: 150, ease: 'Sine.Out' })
    );
  }

  // --- shared pieces ---------------------------------------------------

  // A small penguin that can swap poses (neutral / windup / release) exactly the
  // way `objects/Penguin.js` does in gameplay: each pose's art is aligned by its
  // measured opaque bbox so the feet always sit on (feetX, feetY). Returns the
  // feet + flipper points and a `setPose(name)`.
  miniPenguin(layer, feetX, feetY) {
    const DISP_H = 202; // on-screen content height (gameplay uses 300)
    const R = DISP_H / GAME.PENGUIN_POSES.neutral.dispH; // scale vs the real penguin

    const img = this.add
      .image(feetX, feetY, GAME.PENGUIN_POSES.neutral.key)
      .setOrigin(0.5, 1)
      .setDepth(5);
    layer.add(img);

    let pose = null;
    const setPose = (name) => {
      if (name === pose) return;
      pose = name;
      const p = GAME.PENGUIN_POSES[name];
      const [x0, y0, x1, y1] = p.ob;
      const obW = x1 - x0;
      const obH = y1 - y0;
      const scale = DISP_H / obH;
      img.setTexture(p.key).setScale(scale);
      // opaque-bbox bottom -> feetY, opaque-bbox h-centre -> feetX
      img.x = feetX - (x0 + obW / 2 - p.W / 2) * scale;
      img.y = feetY + (p.H - y1) * scale;
    };
    setPose('neutral');

    return {
      feetX,
      feetY,
      // flipper/wing point — GAME.HAND relative to PENGUIN_BASE, at this scale
      wingX: feetX + (GAME.HAND.x - GAME.PENGUIN_BASE.x) * R,
      wingY: feetY + (GAME.HAND.y - GAME.PENGUIN_BASE.y) * R,
      setPose,
    };
  }

  flipperWing(layer, x, y, size = 66) {
    const w = this.add.image(x, y, 'wing').setDisplaySize(size, size).setDepth(6);
    layer.add(w);
    return w;
  }

  cursor(layer, x, y) {
    const c = this.add.image(x, y, 'cursor').setOrigin(0.14, 0.08).setDepth(8);
    layer.add(c);
    return c;
  }

  clickPing(layer, x, y) {
    const ring = this.add.circle(x, y, 12).setStrokeStyle(4, INK, 1).setDepth(7);
    layer.add(ring);
    const t = this.tweens.add({
      targets: ring,
      scale: 2.8,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    this.stepTweens.push(t);
  }

  // faux-gravity preview curve, same shape as the real aim guide
  arcPoints(x0, y0, ang, speed, steps) {
    const g = 900;
    const dt = 1 / 40;
    const pts = [];
    let x = x0;
    let y = y0;
    let vx = Math.cos(ang) * speed;
    let vy = Math.sin(ang) * speed;
    for (let i = 0; i < steps; i++) {
      vy += g * dt;
      x += vx * dt;
      y += vy * dt;
      pts.push({ x, y });
    }
    return pts;
  }

  // --- step 1: grab the wing — the aim preview appears --------------
  // The wing does NOT move on this step: it stays put in the flipper. When the
  // hand grabs it, the white dotted aim line (exact same look as real gameplay
  // aiming) draws itself in and then fades — showing that holding the wing is
  // what starts the aim preview.

  buildStep1(layer) {
    const a = this.miniPenguin(layer, 430, 552);
    this.s1 = {
      pen: a,
      home: { x: a.wingX, y: a.wingY },
      start: { x: a.wingX + 150, y: a.wingY - 96 },
      ang: -0.5,
    };
    this.s1gfx = this.add.graphics().setDepth(6);
    layer.add(this.s1gfx);
    this.s1wing = this.flipperWing(layer, a.wingX, a.wingY); // fixed — never moved
    this.s1cursor = this.cursor(layer, this.s1.start.x, this.s1.start.y);

    this.s1t = { v: 0 };
    const tw = this.tweens.add({
      targets: this.s1t,
      v: 1,
      duration: 2600,
      ease: 'Linear',
      repeat: -1,
      repeatDelay: 500,
      onUpdate: () => this.renderStep1(),
      onRepeat: () => {
        this.s1t.v = 0;
        this.renderStep1();
      },
    });
    this.stepTweens.push(tw);
    this.renderStep1();
  }

  renderStep1() {
    const { home, start, ang, pen } = this.s1;
    const t = this.s1t.v;
    const g = this.s1gfx;
    g.clear();

    // penguin pose, same as gameplay: neutral until grabbed, wind-up while held
    pen.setPose(t >= 0.22 && t < 0.86 ? 'windup' : 'neutral');

    // cursor: glide to the wing, press, then lift away at the end
    let cx;
    let cy;
    let cScale = 1;
    let cAlpha = 1;
    if (t < 0.22) {
      const p = t / 0.22;
      cx = Phaser.Math.Linear(start.x, home.x + 12, p);
      cy = Phaser.Math.Linear(start.y, home.y + 14, p);
      this._s1pinged = false;
    } else if (t < 0.86) {
      cx = home.x + 12;
      cy = home.y + 14;
      cScale = 0.86;
      if (!this._s1pinged) {
        this._s1pinged = true;
        this.clickPing(this.stepLayer, home.x, home.y);
      }
    } else {
      const p = (t - 0.86) / 0.14;
      cx = home.x + 12 + 12 * p;
      cy = home.y + 14 - 16 * p;
      cAlpha = 1 - p;
    }
    this.s1cursor.setScale(cScale).setAlpha(cAlpha).setPosition(cx, cy);

    // white dotted aim preview — same dot style as GameScene.drawAim. Draws
    // outward from the (stationary) wing once grabbed, holds, fades on release.
    let arcAlpha = 0;
    let drawFrac = 0;
    if (t >= 0.24 && t < 0.52) {
      drawFrac = (t - 0.24) / 0.28;
      arcAlpha = 1;
    } else if (t >= 0.52 && t < 0.82) {
      drawFrac = 1;
      arcAlpha = 1;
    } else if (t >= 0.82) {
      drawFrac = 1;
      arcAlpha = Math.max(0, 1 - (t - 0.82) / 0.14);
    }
    if (arcAlpha > 0.01) {
      const pts = this.arcPoints(home.x, home.y, ang, 640, 30);
      const shown = Math.max(2, Math.round(pts.length * drawFrac));
      for (let i = 0; i < shown; i += 2) {
        const f = i / pts.length;
        g.fillStyle(0xffffff, (0.9 * (1 - f) + 0.12) * arcAlpha);
        g.fillCircle(pts[i].x, pts[i].y, 6 * (1 - f) + 2);
      }
    }
  }

  // --- step 2: pull to aim, then release --------------------------
  // The wing STAYS PUT in the flipper (just like step 1 and real gameplay,
  // where it only nudges a hair). What animates is the HAND pulling out/in and
  // the white dotted aim line reaching further/closer with it — drag distance =
  // power — then a release at the end.

  buildStep2(layer) {
    const a = this.miniPenguin(layer, 430, 552);
    this.s2 = {
      pen: a,
      home: { x: a.wingX, y: a.wingY },
      ang: -0.52,
      reach: 120, // how far the CURSOR pulls; the wing never moves
      cd: Math.cos(-0.52),
      sd: Math.sin(-0.52),
    };
    this.s2gfx = this.add.graphics().setDepth(6);
    layer.add(this.s2gfx);
    this.s2wing = this.flipperWing(layer, a.wingX, a.wingY); // fixed — never moved
    this.s2fly = this.flipperWing(layer, a.wingX, a.wingY, 50).setVisible(false);
    this.s2cursor = this.cursor(layer, a.wingX + 12, a.wingY + 16).setScale(0.9);

    this.s2t = { v: 0 };
    const tw = this.tweens.add({
      targets: this.s2t,
      v: 1,
      duration: 3000,
      ease: 'Linear',
      repeat: -1,
      repeatDelay: 300,
      onUpdate: () => this.renderStep2(),
      onRepeat: () => {
        this.s2t.v = 0;
        this.renderStep2();
      },
    });
    this.stepTweens.push(tw);
    this.renderStep2();
  }

  renderStep2() {
    const { home, ang, reach, cd, sd, pen } = this.s2;
    const t = this.s2t.v;
    const g = this.s2gfx;
    g.clear();

    // drag amount 0..1 — pulls out and in a couple of times, holds, then releases
    let drag;
    let releasing = false;
    let rp = 0;
    if (t < 0.64) {
      drag = 0.12 + 0.88 * (0.5 - 0.5 * Math.cos((t / 0.64) * Math.PI * 3));
    } else if (t < 0.8) {
      drag = 1; // hold, fully aimed
    } else {
      releasing = true;
      rp = (t - 0.8) / 0.2;
      drag = 1; // hand lets go from the full-pull spot
    }

    // penguin pose + wing visibility, same as gameplay: wind-up while aiming,
    // release pose for the throw, back to neutral once it's away.
    const throwing = t >= 0.8 && t < 0.94;
    pen.setPose(t < 0.8 ? 'windup' : throwing ? 'release' : 'neutral');
    this.s2wing.setVisible(!throwing); // rest-wing hidden only while the thrown one flies

    // the HAND is what pulls (the drag gesture); the wing stays in the flipper
    const hx = home.x + cd * reach * drag;
    const hy = home.y + sd * reach * drag;
    if (!releasing) {
      this.s2cursor.setPosition(hx + 12, hy + 16).setScale(0.86).setAlpha(1);
    } else {
      // let go: hand lifts away from the full-pull spot and fades
      this.s2cursor
        .setPosition(hx + 12 + 16 * rp, hy + 16 - 20 * rp)
        .setAlpha(1 - rp);
    }

    // The ONLY aim indicator (matches gameplay): a white dotted line from the
    // stationary wing — it reaches FURTHER the more the hand pulls. Same dot
    // style as GameScene.drawAim.
    const speed = 300 + 470 * drag;
    const pts = this.arcPoints(home.x, home.y, ang, speed, releasing ? 34 : 28);
    if (!releasing) {
      for (let i = 0; i < pts.length; i += 2) {
        const f = i / pts.length;
        g.fillStyle(0xffffff, 0.9 * (1 - f) + 0.12);
        g.fillCircle(pts[i].x, pts[i].y, 5 * (1 - f) + 2);
      }
    } else {
      g.fillStyle(0xffffff, 0.22 * (1 - rp));
      for (let i = 0; i < pts.length; i += 3) g.fillCircle(pts[i].x, pts[i].y, 3);
    }

    // on release a wing flies the full-power arc; the resting wing stays put
    if (releasing) {
      const idx = Math.min(pts.length - 1, Math.floor(rp * (pts.length - 1)));
      this.s2fly
        .setVisible(true)
        .setPosition(pts[idx].x, pts[idx].y)
        .setAlpha(1 - Math.max(0, rp - 0.7) / 0.3);
      this.s2fly.rotation += 0.3;
    } else {
      this.s2fly.setVisible(false);
    }
  }

  // --- step 3: streak bonus -------------------------------------

  buildStep3(layer) {
    const a = this.miniPenguin(layer, 360, 552);
    this.s3pen = a;
    // The volley launches from the flipper (a.wingX/wingY = GAME.HAND scaled to
    // this mini penguin) — the same spot the wing rests, NOT the tummy.
    this.s3origin = { x: a.wingX, y: a.wingY };
    // A wing waiting in the flipper before the burst (and reloaded after it),
    // matching how a normal throw looks.
    this.s3rest = this.flipperWing(layer, a.wingX, a.wingY, 50);
    this.s3wings = [];
    for (let i = 0; i < 5; i++) {
      const w = this.flipperWing(layer, this.s3origin.x, this.s3origin.y, 50).setVisible(false);
      this.s3wings.push(w);
    }
    this.s3label = this.add
      .text(a.feetX + 200, a.feetY - 224, 'BONUS!', {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: '46px',
        fontStyle: '700',
        color: '#FFC93C',
        stroke: '#26313A',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);
    layer.add(this.s3label);

    const proxy = { t: 0 };
    const tw = this.tweens.add({
      targets: proxy,
      t: 1,
      duration: 2000,
      repeat: -1,
      repeatDelay: 300,
      onUpdate: () => this.renderStep3(proxy.t),
      onRepeat: () => {
        proxy.t = 0;
        this.renderStep3(0);
      },
    });
    this.stepTweens.push(tw);
    this.renderStep3(0);
  }

  renderStep3(t) {
    const armed = t < 0.22; // wing waiting in the flipper, burst not fired yet
    const spent = t >= 0.95; // burst finished, fresh wing back in the flipper

    // penguin pose: neutral with a wing ready, release pose while the volley flies
    this.s3pen.setPose(armed || spent ? 'neutral' : 'release');

    // rest wing: visible before the burst and again once it's over
    this.s3rest.setVisible(armed || spent);

    // "BONUS!" appears with the burst, then lingers and fades through the tail
    if (armed) {
      this.s3label.setVisible(false);
    } else {
      const lp = (t - 0.22) / 0.78;
      this.s3label
        .setVisible(true)
        .setAlpha(1 - Math.max(0, lp - 0.55) / 0.45)
        .setScale(Phaser.Math.Linear(0.4, 1, Math.min(1, lp * 5)));
    }

    if (armed || spent) {
      this.s3wings.forEach((w) => w.setVisible(false));
      return;
    }

    // a quick volley: the five wings leave the flipper one after another and
    // stream up and forward — a rapid multi-throw, not a static fan
    const { x: ox, y: oy } = this.s3origin;
    this.s3wings.forEach((w, i) => {
      const local = Phaser.Math.Clamp((t - 0.22 - i * 0.05) / 0.5, 0, 1);
      if (local <= 0) {
        w.setVisible(false);
        return;
      }
      const ang = -0.52 + i * 0.06;
      const d = 20 + 252 * local;
      w.setVisible(true)
        .setPosition(ox + Math.cos(ang) * d, oy + Math.sin(ang) * d + 0.16 * d * local)
        .setAlpha(1 - Math.max(0, local - 0.75) / 0.25);
      w.rotation = ang + local * 4;
    });
  }

  // --- button factory -----------------------------------------------

  // A button = an invisible `Rectangle` GameObject as the hit target (Shapes
  // have proper origin/size so Phaser's input handles them reliably from frame
  // one — unlike a bare Container with a hand-rolled hit area) plus a separate
  // non-interactive `view` container for the pill visuals. Press/hover feedback
  // scales `view` only, so it never perturbs the hit test. Nothing here is ever
  // parented to a faded layer.
  makeButton(x, y, opts) {
    const w = opts.w || 190;
    const h = opts.h || 60;
    const r = Math.min(h / 2, 26);

    const view = this.add.container(x, y).setDepth(20);
    const g = this.add.graphics();
    g.fillStyle(opts.fill != null ? opts.fill : CORAL, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(5, INK, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    let textDX = 0;
    if (opts.arrow) {
      const dir = opts.arrow === 'left' ? -1 : 1;
      const ax = opts.arrow === 'left' ? -w / 2 + 26 : w / 2 - 26;
      g.fillStyle(opts.arrowColor != null ? opts.arrowColor : 0xffffff, 1);
      g.beginPath();
      g.moveTo(ax - dir * 8, -11);
      g.lineTo(ax - dir * 8, 11);
      g.lineTo(ax + dir * 10, 0); // tip points the way we travel
      g.closePath();
      g.fillPath();
      textDX = -dir * 13;
    }

    const label = this.add
      .text(textDX, 1, opts.label, {
        fontFamily: '"Fredoka", "Baloo 2", sans-serif',
        fontSize: opts.fontSize || '26px',
        fontStyle: '700',
        color: opts.textCss || '#ffffff',
      })
      .setOrigin(0.5);
    view.add([g, label]);

    // Generous hit target (a little bigger than the pill for small hands), drawn
    // by nothing so it stays invisible but visible:true / alpha:1 -> hit-testable.
    // A Rectangle GameObject (origin 0.5, real size) gives Phaser's input a
    // clean, reliable hit test from the first frame. Hit area stated explicitly
    // so there's no reliance on texture/size inference. Floored to the same
    // 48px real-px touch-target minimum as every other button (see
    // ui/widgets.js hitFloor) — these buttons sit far enough apart (nearest
    // neighbour edges ~230px away at design scale) that the floor can never
    // make two of them overlap.
    const { w: hw, h: hh } = hitFloor(this, w + 24, h + 18);
    const hit = this.add.rectangle(x, y, hw, hh).setDepth(21);
    hit.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, hw, hh),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    // Act on pointerDOWN — instant response, and immune to a tap that drifts a
    // few px off the button before release (which would swallow a pointerup).
    // go() debounces, so a stray double-tap can't double-fire.
    hit.on('pointerdown', () => {
      view.setScale(0.95);
      opts.onClick();
    });
    hit.on('pointerover', () => view.setScale(1.04));
    hit.on('pointerout', () => view.setScale(1));
    hit.on('pointerup', () => view.setScale(1));
    hit.on('pointerupoutside', () => view.setScale(1));

    return {
      hit,
      view,
      setEnabled(on) {
        hit.input.enabled = on;
        hit.setVisible(on);
        view.setVisible(on).setScale(1);
      },
    };
  }
}
