import { GAME } from '../config.js';
import { addCover } from '../util/display.js';
import { Sfx } from '../util/sfx.js';
import { drawPill } from '../ui/widgets.js';
import { MOCK_LEADERBOARD } from '../data/mockLeaderboard.js';

// Screen 2 of the end-of-round flow. Merges the live player into the (mock)
// standings, shows the top 10, and always shows the player's own row — in its
// natural slot if it lands in the top 10, otherwise as a highlighted extra row
// below the top 10. Every row has the same "badge  name  score" format and the
// same solid border; the player's row is distinguished only by its highlight
// fill — no YOU badge, no dashed outline. If they picked a preset message on
// Screen 1 it shows compactly after the name. The panel height is derived from
// the row count so every row fits with margin to spare.
// "Play Again" is the real bathtub asset (play_again_tub.png).
const INK = 0x26313a;
const INK_CSS = '#26313a';
const FONT = '"Fredoka", "Baloo 2", sans-serif';

const PINK = 0xf0a9c8;
const ROW_LIGHT = 0xffffff;
const ROW_CREAM = 0xf6efe1;
const YOU_ROW = 0xffe7a6; // highlight fill for the player's own row
const BADGE_BY_RANK = [0xffc93c, 0xbcd7ef, 0xff9f7a]; // 1st gold, 2nd blue, 3rd coral

const PANEL_X = 56;
const PANEL_W = 700;
const HEAD_BAND = 66; // clear space under the overlapping "Top Scores" pill
const ROW_PITCH = 46;
const ROW_H = 40;
const BOT_PAD = 34; // generous clear space below the last row
const EXTRA_GAP = 16; // extra breathing room above the out-of-top-10 player row

export default class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('LeaderboardScene');
  }

  init(data) {
    this.finalScore = (data && data.score) || 0;
    this.playerName = (data && data.name) || 'Player';
    this.playerMessage = (data && data.message) || null;
    this._leaving = false;
  }

  create() {
    addCover(this, 'bg');

    const { rows, playerInTop10 } = this.buildStandings();
    const extraRow = playerInTop10 ? 0 : 1;

    // --- panel, sized to fit every row (incl. the 11th player row) ---
    const panelH =
      HEAD_BAND + rows.length * ROW_PITCH + extraRow * EXTRA_GAP + BOT_PAD;
    const panelY = Math.max(16, Math.round((GAME.HEIGHT - panelH) / 2));
    const panelCX = PANEL_X + PANEL_W / 2;

    drawPill(this, panelCX, panelY + panelH / 2, PANEL_W, panelH, {
      radius: 34,
      strokeWidth: 6,
      depth: 5,
    });

    // "Top Scores" header pill, straddling the panel's top edge
    drawPill(this, panelCX, panelY, 244, 62, { fill: PINK, radius: 31, depth: 8 });
    this.add
      .text(panelCX, panelY, 'Top Scores', {
        fontFamily: FONT,
        fontSize: '30px',
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(0.5)
      .setDepth(9);

    // --- rows ---
    const contentTop = panelY + HEAD_BAND;
    const rowW = PANEL_W - 40;
    const rowX = PANEL_X + 20;
    rows.forEach((entry, i) => {
      const cy =
        contentTop + i * ROW_PITCH + ROW_H / 2 + (entry.extra ? EXTRA_GAP : 0);
      const rc = this.buildRow(rowX, cy, rowW, ROW_H, i, entry);
      rc.setAlpha(0);
      this.tweens.add({
        targets: rc,
        alpha: 1,
        y: { from: 8, to: 0 },
        duration: 220,
        delay: 60 + i * 42,
        ease: 'Sine.Out',
      });
    });

    // --- "YOUR SCORE" pill on the right ---
    const rx = 1016;
    drawPill(this, rx, 150, 250, 150, { radius: 40, strokeWidth: 6, depth: 8 });
    this.add
      .text(rx, 150 - 40, 'YOUR SCORE', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: '700',
        color: '#8fa0ac',
      })
      .setOrigin(0.5)
      .setDepth(9);
    const yourScore = this.add
      .text(rx, 150 + 20, '0', {
        fontFamily: FONT,
        fontSize: '60px',
        fontStyle: '700',
        color: INK_CSS,
        stroke: '#ffffff',
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(9);
    const counter = { v: 0 };
    this.tweens.add({
      targets: counter,
      v: this.finalScore,
      duration: 700,
      ease: 'Cubic.Out',
      onUpdate: () => yourScore.setText(String(Math.round(counter.v))),
      onComplete: () => yourScore.setText(String(this.finalScore)),
    });

    // --- Play Again — the isolated bathtub asset, scaled down ---
    this.buildPlayAgain(rx, 486);

    // --- Share the fun! — small secondary pill in the floor tile below the
    //     tub, centred on the tub's own axis (rx). Tub feet bottom ≈ y613;
    //     the floor grout lines sit at y≈609 and y≈697, so this row is
    //     609–697 and the pill sits near its top: centre y646 → visual top
    //     ≈ y622, an ~9px gap under the feet.
    this.buildShareButton(rx, 646);
  }

  // A compact rounded pill (cream fill, ink outline) with a small share glyph
  // and single-colour label — deliberately quiet so it doesn't rival the tub.
  buildShareButton(cx, cy) {
    const H = 44;
    const R = H / 2;
    const PAD_X = 17;
    const ICON_W = 18;
    const ICON_GAP = 8;
    const LABEL = 'Share the fun!';

    const measure = this.add
      .text(0, 0, LABEL, { fontFamily: FONT, fontSize: '19px', fontStyle: '700' })
      .setVisible(false);
    const textW = Math.ceil(measure.width);
    measure.destroy();

    const contentW = ICON_W + ICON_GAP + textW;
    const W = contentW + PAD_X * 2;
    const view = this.add.container(cx, cy).setDepth(11);

    const g = this.add.graphics();
    g.fillStyle(0xf3f7f2, 1);
    g.fillRoundedRect(-W / 2, -H / 2, W, H, R);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(-W / 2, -H / 2, W, H, R);

    // share glyph: three dots joined from a left node — drawn at the icon slot
    const icx = -contentW / 2 + ICON_W / 2;
    const dL = { x: icx - 6.5, y: 0 };
    const dTR = { x: icx + 6.5, y: -6.5 };
    const dBR = { x: icx + 6.5, y: 6.5 };
    const ig = this.add.graphics();
    ig.lineStyle(2.4, INK, 1);
    ig.lineBetween(dL.x, dL.y, dTR.x, dTR.y);
    ig.lineBetween(dL.x, dL.y, dBR.x, dBR.y);
    ig.fillStyle(INK, 1);
    ig.fillCircle(dL.x, dL.y, 3);
    ig.fillCircle(dTR.x, dTR.y, 3);
    ig.fillCircle(dBR.x, dBR.y, 3);

    const txt = this.add
      .text(-contentW / 2 + ICON_W + ICON_GAP, 1, LABEL, {
        fontFamily: FONT,
        fontSize: '19px',
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(0, 0.5);

    view.add([g, ig, txt]);

    const hitW = W + 16;
    const hitH = H + 14;
    const hit = this.add.rectangle(cx, cy, hitW, hitH).setDepth(12);
    hit.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, hitW, hitH),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    hit.on('pointerover', () => view.setScale(1.04));
    hit.on('pointerout', () => view.setScale(1));
    hit.on('pointerdown', () => {
      view.setScale(0.96);
      this.onShare();
    });
    hit.on('pointerup', () => view.setScale(1));
    hit.on('pointerupoutside', () => view.setScale(1));
  }

  // Placeholder — the native share sheet / copy-link fallback is wired later.
  onShare() {
    Sfx.play(this, 'button');
    // eslint-disable-next-line no-console
    console.log('[Leaderboard] Share the fun! — stub', {
      score: this.finalScore,
      name: this.playerName,
      message: this.playerMessage,
    });
  }

  // Merge the live player into the mock board, sort, and decide which rows to
  // render. Ties keep the existing (mock) entries ahead of the player.
  buildStandings() {
    const player = {
      name: this.playerName,
      score: this.finalScore,
      message: this.playerMessage,
      isPlayer: true,
      order: 999,
    };
    const combined = MOCK_LEADERBOARD.map((e, i) => ({ ...e, order: i }));
    combined.push(player);
    combined.sort((a, b) => b.score - a.score || a.order - b.order);

    const playerRank = combined.findIndex((e) => e.isPlayer) + 1;
    const playerInTop10 = playerRank <= 10;

    const rows = combined.slice(0, 10).map((e, i) => ({ ...e, rank: i + 1 }));
    if (!playerInTop10) {
      rows.push({ ...player, rank: playerRank, extra: true });
    }
    return { rows, playerRank, playerInTop10 };
  }

  // Row format is identical for every row: a numbered circle badge, then name,
  // then score right-aligned — "1  Mia  640". The player's row is set apart
  // only by its highlight fill (and dashed outline when it sits outside the top
  // 10); no YOU badge. If they left a preset message it shows compactly after
  // the name ("Player — 'Best game ever!'").
  buildRow(x, cy, w, h, i, entry) {
    const rc = this.add.container(0, 0).setDepth(6);
    const isYou = entry.isPlayer;
    const fill = isYou ? YOU_ROW : i % 2 ? ROW_CREAM : ROW_LIGHT;

    // Same solid border as every other row; the player's row is set apart by
    // its highlight fill alone.
    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, cy - h / 2, w, h, 20);
    g.lineStyle(3, INK, 1);
    g.strokeRoundedRect(x, cy - h / 2, w, h, 20);
    rc.add(g);

    // numbered rank badge — every row
    const bx = x + 26;
    const badge = this.add.graphics();
    badge.fillStyle(BADGE_BY_RANK[entry.rank - 1] || 0xd6e4f0, 1);
    badge.fillCircle(bx, cy, 14);
    badge.lineStyle(2.5, INK, 1);
    badge.strokeCircle(bx, cy, 14);
    rc.add(badge);
    rc.add(
      this.add
        .text(bx, cy + 0.5, String(entry.rank), {
          fontFamily: FONT,
          fontSize: '15px',
          fontStyle: '700',
          color: INK_CSS,
        })
        .setOrigin(0.5)
    );

    const nameX = x + 52;

    // score, right-aligned
    const scoreText = this.add
      .text(x + w - 24, cy + 0.5, String(entry.score), {
        fontFamily: FONT,
        fontSize: '21px',
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(1, 0.5);
    rc.add(scoreText);

    // name
    const nameText = this.add
      .text(nameX, cy + 0.5, entry.name, {
        fontFamily: FONT,
        fontSize: '21px',
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(0, 0.5);
    rc.add(nameText);

    // preset message (player only) — compact, muted, ellipsis if it would run
    // into the score. Presets are short so this rarely truncates.
    if (entry.message) {
      const msgX = nameX + nameText.width + 10;
      const avail = x + w - 24 - scoreText.width - 16 - msgX;
      const msg = this.add
        .text(msgX, cy + 0.5, `— '${entry.message}'`, {
          fontFamily: FONT,
          fontSize: '16px',
          fontStyle: '600',
          color: '#6a7580',
        })
        .setOrigin(0, 0.5);
      if (msg.width > avail) {
        let s = entry.message;
        while (s.length > 0 && msg.width > avail) {
          s = s.slice(0, -1);
          msg.setText(s ? `— '${s.replace(/\s+$/, '')}…'` : '—');
        }
      }
      rc.add(msg);
    }

    return rc;
  }

  buildPlayAgain(cx, cy) {
    // Pre-isolated tub PNG (transparent background) — just scale it down and
    // drop it in; it's the secondary action here, so keep it modest.
    const img = this.add.image(cx, cy, 'play_again_tub').setDepth(10);
    const scale = 452 / img.width;
    img.setScale(scale);
    img.setInteractive({ useHandCursor: true });

    const restart = () => {
      if (this._leaving) return;
      this._leaving = true;
      Sfx.play(this, 'button');
      this.scene.start('GameScene');
    };
    img.on('pointerover', () => img.setScale(scale * 1.03));
    img.on('pointerout', () => img.setScale(scale));
    img.on('pointerdown', restart);

    this.time.delayedCall(250, () => {
      this.input.keyboard.on('keydown-SPACE', restart);
      this.input.keyboard.on('keydown-ENTER', restart);
    });
  }
}
