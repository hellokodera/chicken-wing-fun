import { GAME } from '../config.js';
import { addCover } from '../util/display.js';
import { Sfx } from '../util/sfx.js';
import { drawPill, pillButton } from '../ui/widgets.js';

// Screen 1 of the end-of-round flow. Shows the final score, takes a name and an
// optional preset message for Ethan (picked from a dropdown), then hands off to
// LeaderboardScene. "Play Again" bails straight back into a fresh game — no
// save, no leaderboard. No "Game Over" copy anywhere.
//
// Composition: the FINAL SCORE caption and the big score number hug their text
// and centre on the screen. The name field + Submit, the message dropdown and
// Play Again form a left-aligned column: the name field and dropdown share one
// width (sized to the placeholder) and one left edge; Submit sits beside the
// field; Play Again is flush to that same left edge. Every pill's radius is
// half its own height.
const INK = '#26313a';
const INK_HEX = 0x26313a;
const MUTED = '#8fa0ac';
const CORAL_HEX = 0xff6f59;
const FONT = '"Fredoka", "Baloo 2", sans-serif';
const PLACEHOLDER = 'Save your name to see the leaderboard';
const MSG_PLACEHOLDER = 'Leave a message for Ethan';
const MSG_MAX_LEN = 50; // keep in sync with submit-score.js (server is authoritative)
const MESSAGES = [
  'You made this so fun!',
  'Best game ever!',
  'I love this game!',
  'So much fun, Ethan!',
  "Can't stop playing!",
];

const CX = GAME.WIDTH / 2; // caption + score centre on this
const STROKE = 5; // shared outline / border weight
const FIELD_H = 60; // visual height of the name / dropdown pills
const FIELD_PAD_X = 21; // inner horizontal padding in the field pills
const BTN_H = 46; // Play Again + Submit share this height (matched pair)
const BTN_PAD_X = 20; // horizontal padding around each bottom-button label
const HEAD_PAD_X = 30; // padding inside the FINAL SCORE caption pill, per side
const SCORE_PAD_X = 46; // padding around the number inside the score pill

export default class ScoreEntryScene extends Phaser.Scene {
  constructor() {
    super('ScoreEntryScene');
  }

  init(data) {
    this.finalScore = (data && data.score) || 0;
    this._leaving = false;
    this.selectedMessage = null;
    this._ddOpen = false;
  }

  create() {
    addCover(this, 'bg');

    // Field column width = the placeholder text + modest padding, so the pill
    // ends just after "leaderboard". The name field and dropdown share it.
    const measure = this.add
      .text(0, 0, PLACEHOLDER, { fontFamily: FONT, fontSize: '19px', fontStyle: '600' })
      .setVisible(false);
    const fieldW = Math.ceil(measure.width) + (FIELD_PAD_X + STROKE) * 2 + 4;
    measure.destroy();
    const colX = Math.round((GAME.WIDTH - fieldW) / 2);

    // Even, loose vertical rhythm, measured between VISUAL edges. Caption and
    // score sit as a tight pair; everything else gets the full GAP.
    const GAP = 28;
    const PAIR_GAP = 14;
    const H_LABEL = 48;
    const H_SCORE = 116;
    const topVis = 224; // caption pill visual top — clears the window (~y210)

    const halfLabel = H_LABEL / 2 + STROKE / 2;
    const halfScore = H_SCORE / 2 + STROKE / 2;
    const halfRow = FIELD_H / 2;
    const halfPlay = BTN_H / 2 + STROKE / 2;

    const labelCy = topVis + halfLabel;
    const scoreCy = labelCy + halfLabel + PAIR_GAP + halfScore;
    const rowY = scoreCy + halfScore + GAP + halfRow;
    const ddCy = rowY + halfRow + GAP + halfRow;
    const playCy = ddCy + halfRow + GAP + halfPlay;

    // --- FINAL SCORE caption — small pill that hugs its text, centred ---
    const capText = this.add
      .text(CX, labelCy, 'FINAL SCORE', {
        fontFamily: FONT,
        fontSize: '24px',
        fontStyle: '700',
        color: INK,
      })
      .setOrigin(0.5)
      .setDepth(11);
    drawPill(this, CX, labelCy, Math.ceil(capText.width) + HEAD_PAD_X * 2, H_LABEL, {
      strokeWidth: STROKE,
      depth: 10,
    });

    // --- score — the headline: big dark number in a snug pill ---
    const scoreText = this.add
      .text(CX, scoreCy, String(this.finalScore || 0), {
        fontFamily: FONT,
        fontSize: '84px',
        fontStyle: '700',
        color: INK,
        stroke: '#ffffff',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(11);
    const scorePillW = Math.max(200, Math.ceil(scoreText.width) + SCORE_PAD_X * 2);
    drawPill(this, CX, scoreCy, scorePillW, H_SCORE, { strokeWidth: STROKE, depth: 10 });
    scoreText.setText('0');

    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: this.finalScore,
      duration: 800,
      ease: 'Cubic.Out',
      onUpdate: () => scoreText.setText(String(Math.round(counter.v))),
      onComplete: () => scoreText.setText(String(this.finalScore)),
    });
    this.tweens.add({
      targets: scoreText,
      scale: { from: 0.4, to: 1 },
      duration: 500,
      ease: 'Back.Out',
    });

    // --- name field (alone; Enter or the Submit button below both submit) ---
    const input = this.buildInput(fieldW);
    this._input = input;
    this.add.dom(colX + fieldW / 2, rowY, input);

    // --- message dropdown — same width + left edge as the name field ---
    this.buildMessageDropdown(colX + fieldW / 2, ddCy, fieldW);

    // --- bottom row: Play Again flush-left; Submit flush-right so its right
    //     edge lines up with the name field / dropdown pills above ---
    const paW = this.measureBtn('Play Again');
    const suW = this.measureBtn('Submit');
    pillButton(this, colX + paW / 2, playCy, {
      w: paW,
      h: BTN_H,
      label: 'Play Again',
      fill: 0xffffff,
      textColor: INK,
      fontSize: '19px',
      onClick: () => this.playAgain(),
    });
    pillButton(this, colX + fieldW - suW / 2, playCy, {
      w: suW,
      h: BTN_H,
      label: 'Submit',
      fill: CORAL_HEX,
      fontSize: '19px',
      onClick: () => this.submit(input.value),
    });

    this.input.keyboard.on('keydown-ENTER', () => this.submit(this._input.value));
    this.events.once('shutdown', () => {
      if (this._input && this._input.parentNode) {
        this._input.parentNode.removeChild(this._input);
      }
    });
  }

  // Width for a bottom-row button: its label at the row's font + modest padding.
  measureBtn(label) {
    const probe = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: '19px', fontStyle: '700' })
      .setVisible(false);
    const w = Math.ceil(probe.width) + BTN_PAD_X * 2;
    probe.destroy();
    return w;
  }

  // --- message dropdown -------------------------------------------------
  // Closed: a field pill styled like the name input, grey placeholder until a
  // choice is made. Tapping it opens a centred picker (dimmed backdrop) with
  // the 5 presets. Pick one → it shows in the field; pick it again → cleared;
  // or just leave it blank.
  buildMessageDropdown(cx, cy, w) {
    const VIS_H = FIELD_H - STROKE;
    const FIELD_R = VIS_H / 2;
    const RECT_W = w - STROKE; // + STROKE outline ≈ w (matches the input's box)
    const textLeft = -w / 2 + STROKE + FIELD_PAD_X; // == the input's text start

    const field = this.add.container(cx, cy).setDepth(12);
    const fg = this.add.graphics();
    fg.fillStyle(0xf3f7f2, 1);
    fg.fillRoundedRect(-RECT_W / 2, -VIS_H / 2, RECT_W, VIS_H, FIELD_R);
    fg.lineStyle(STROKE, INK_HEX, 1);
    fg.strokeRoundedRect(-RECT_W / 2, -VIS_H / 2, RECT_W, VIS_H, FIELD_R);
    const label = this.add
      .text(textLeft, 1, MSG_PLACEHOLDER, {
        fontFamily: FONT,
        fontSize: '19px',
        fontStyle: '600',
        color: MUTED,
      })
      .setOrigin(0, 0.5);
    const chev = this.add.graphics();
    field.add([fg, label, chev]);

    const drawChev = (up) => {
      chev.clear();
      chev.fillStyle(0x8fa0ac, 1);
      const bx = w / 2 - STROKE - FIELD_PAD_X;
      if (up) chev.fillTriangle(bx - 7, 4, bx + 7, 4, bx, -6);
      else chev.fillTriangle(bx - 7, -4, bx + 7, -4, bx, 6);
    };
    drawChev(false);

    // --- centred picker (backdrop + panel), built once, toggled ---
    const PW = 460;
    const HEAD_H = 44;
    const OPT_H = 46;
    const PAD = 14;
    const panelH = HEAD_H + MESSAGES.length * OPT_H + PAD;
    const panelCy = 356;

    const backdrop = this.add
      .rectangle(CX, GAME.HEIGHT / 2, GAME.WIDTH, GAME.HEIGHT, INK_HEX, 0.4)
      .setDepth(39)
      .setVisible(false);
    backdrop.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    });
    backdrop.input.enabled = false;
    backdrop.on('pointerdown', () => this.closeDropdown());

    const panel = this.add.container(CX, panelCy).setDepth(40).setVisible(false);
    const pg = this.add.graphics();
    pg.fillStyle(0xffffff, 1);
    pg.fillRoundedRect(-PW / 2, -panelH / 2, PW, panelH, 22);
    pg.lineStyle(STROKE, INK_HEX, 1);
    pg.strokeRoundedRect(-PW / 2, -panelH / 2, PW, panelH, 22);
    panel.add(pg);
    panel.add(
      this.add
        .text(0, -panelH / 2 + HEAD_H / 2, MSG_PLACEHOLDER, {
          fontFamily: FONT,
          fontSize: '17px',
          fontStyle: '700',
          color: MUTED,
        })
        .setOrigin(0.5)
    );
    const divider = this.add.graphics();
    divider.lineStyle(2, 0xe3e6e2, 1);
    divider.lineBetween(-PW / 2 + 16, -panelH / 2 + HEAD_H, PW / 2 - 16, -panelH / 2 + HEAD_H);
    panel.add(divider);

    const optTop = -panelH / 2 + HEAD_H;
    const rowHls = [];
    const paintRow = (i, on) => {
      const g = rowHls[i];
      g.clear();
      if (!on) return;
      const oy = optTop + i * OPT_H + OPT_H / 2;
      g.fillStyle(0xffe7a6, 1);
      g.fillRoundedRect(-PW / 2 + 10, oy - OPT_H / 2 + 3, PW - 20, OPT_H - 6, 12);
    };
    MESSAGES.forEach((m, i) => {
      const oy = optTop + i * OPT_H + OPT_H / 2;
      const g = this.add.graphics();
      rowHls.push(g);
      panel.add(g);
      panel.add(
        this.add
          .text(-PW / 2 + 30, oy + 0.5, m, {
            fontFamily: FONT,
            fontSize: '18px',
            fontStyle: '600',
            color: INK,
          })
          .setOrigin(0, 0.5)
      );
    });

    const optionHits = MESSAGES.map((m, i) => {
      const wy = panelCy + optTop + i * OPT_H + OPT_H / 2;
      const r = this.add.rectangle(CX, wy, PW - 20, OPT_H).setDepth(42).setVisible(false);
      r.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(0, 0, PW - 20, OPT_H),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      });
      r.input.enabled = false;
      r.on('pointerover', () => paintRow(i, true));
      r.on('pointerout', () => paintRow(i, this.selectedMessage === m));
      r.on('pointerdown', () => this.selectMessage(m));
      return r;
    });

    const fh = this.add.rectangle(cx, cy, w, FIELD_H).setDepth(13);
    fh.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, w, FIELD_H),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    fh.on('pointerdown', () => this.toggleDropdown());

    const refreshLabel = () => {
      if (this.selectedMessage) label.setText(this.selectedMessage).setColor(INK);
      else label.setText(MSG_PLACEHOLDER).setColor(MUTED);
    };
    const refreshHighlights = () =>
      MESSAGES.forEach((m, i) => paintRow(i, this.selectedMessage === m));

    this._dd = { panel, backdrop, optionHits, drawChev, refreshLabel, refreshHighlights };
    refreshHighlights();
  }

  openDropdown() {
    if (this._ddOpen || this._leaving) return;
    this._ddOpen = true;
    Sfx.play(this, 'button');
    // the DOM input renders above the canvas, so it would punch through the
    // dimmed picker — hide it while the picker is up.
    if (this._input) this._input.style.visibility = 'hidden';
    this._dd.backdrop.setVisible(true);
    this._dd.backdrop.input.enabled = true;
    this._dd.panel.setVisible(true);
    this._dd.optionHits.forEach((r) => {
      r.setVisible(true);
      r.input.enabled = true;
    });
    this._dd.drawChev(true);
  }

  closeDropdown() {
    if (!this._ddOpen) return;
    this._ddOpen = false;
    if (this._input) this._input.style.visibility = 'visible';
    this._dd.backdrop.setVisible(false);
    this._dd.backdrop.input.enabled = false;
    this._dd.panel.setVisible(false);
    this._dd.optionHits.forEach((r) => {
      r.setVisible(false);
      r.input.enabled = false;
    });
    this._dd.drawChev(false);
  }

  toggleDropdown() {
    if (this._ddOpen) this.closeDropdown();
    else this.openDropdown();
  }

  selectMessage(m) {
    Sfx.play(this, 'button');
    this.selectedMessage = this.selectedMessage === m ? null : m;
    this._dd.refreshLabel();
    this._dd.refreshHighlights();
    this.closeDropdown();
  }

  // A real DOM <input> (mobile soft keyboard), styled to match the column
  // pills: a full pill, shared border weight and inner text inset.
  buildInput(fieldW) {
    if (!document.getElementById('cwf-input-style')) {
      const s = document.createElement('style');
      s.id = 'cwf-input-style';
      s.textContent = '.cwf-name-input::placeholder{color:#8fa0ac;opacity:1;}';
      document.head.appendChild(s);
    }
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 16;
    el.className = 'cwf-name-input';
    el.setAttribute('aria-label', 'Your name');
    el.placeholder = PLACEHOLDER;
    el.style.cssText = [
      `width:${fieldW}px`,
      `height:${FIELD_H}px`,
      'box-sizing:border-box',
      'margin:0',
      `padding:0 ${FIELD_PAD_X}px`,
      `border:${STROKE}px solid #26313a`,
      `border-radius:${FIELD_H / 2}px`,
      'background:#f3f7f2',
      'color:#26313a',
      'outline:none',
      'font-family:"Fredoka", "Baloo 2", sans-serif',
      'font-size:19px',
      'font-weight:600',
    ].join(';');
    this.time.delayedCall(80, () => {
      try {
        el.focus();
      } catch (e) {
        /* no-op */
      }
    });
    return el;
  }

  // POST the round to /api/submit-score, then go to the leaderboard. The write
  // is confirmed on success; on any failure (bad response, network, timeout) we
  // still continue to the leaderboard — play is never blocked — and pass a
  // `saveError` flag so that screen can show a small "couldn't save" note.
  // On success we also hand the leaderboard the server's stored record so it
  // can show the player's row immediately, before KV's list() catches up.
  async submit(rawName) {
    if (this._leaving) return;
    this._leaving = true;
    Sfx.play(this, 'button');

    const name = (String(rawName || '').trim() || 'Player').slice(0, 16);
    const score = Math.max(0, Math.round(Number(this.finalScore) || 0));
    // client-side clamp (the message dropdown only offers safe presets today,
    // but never send an unbounded string); submit-score.js re-validates + sanitises.
    const message = this.selectedMessage
      ? String(this.selectedMessage).slice(0, MSG_MAX_LEN)
      : null;

    // brief inline note so a slow network isn't a silent freeze
    const saving = this.add
      .text(GAME.WIDTH / 2, GAME.HEIGHT - 34, 'Saving…', {
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: '700',
        color: MUTED,
      })
      .setOrigin(0.5)
      .setDepth(50);

    let saveError = false;
    let justSubmitted = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      // submit-score always stamps the time server-side, so no timestamp is sent.
      const res = await fetch('/api/submit-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score, message }),
        signal: controller.signal,
      });
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        const rec = payload && payload.record;
        justSubmitted =
          rec && typeof rec.score === 'number' && typeof rec.name === 'string'
            ? {
                name: rec.name,
                score: rec.score,
                ts: typeof rec.ts === 'number' ? rec.ts : Date.now(),
                // prefer the server's sanitised message
                message: typeof rec.message === 'string' ? rec.message : message,
              }
            : { name, score, ts: Date.now(), message };
      } else {
        saveError = true;
        const detail = await res.text().catch(() => '');
        // eslint-disable-next-line no-console
        console.warn('[submit-score] HTTP', res.status, detail);
      }
    } catch (err) {
      saveError = true;
      // eslint-disable-next-line no-console
      console.warn('[submit-score] request failed:', (err && err.message) || err);
    } finally {
      clearTimeout(timeout);
    }

    if (saving.scene) saving.destroy();
    this.scene.start('LeaderboardScene', {
      score,
      name,
      message,
      saveError,
      justSubmitted,
    });
  }

  playAgain() {
    if (this._leaving) return;
    this._leaving = true;
    Sfx.play(this, 'button');
    this.scene.start('GameScene');
  }
}
