import { GAME } from '../config.js';
import { addCover } from '../util/display.js';
import { Sfx } from '../util/sfx.js';
import { drawPill } from '../ui/widgets.js';

// Screen 2 of the end-of-round flow. Fetches the real top scores from
// GET /api/leaderboard and renders them — "badge  name  score" per row, every
// row the same solid-bordered style. There is NO mock data and no client-side
// merging: the board shows exactly what the API returns. Empty API result ->
// an explicit "no scores yet" message; a failed fetch -> a "couldn't load"
// message. The player's own score is always shown separately in the "YOUR
// SCORE" pill on the right. "Play Again" is the real bathtub asset.
const INK = 0x26313a;
const INK_CSS = '#26313a';
const MUTED_CSS = '#8fa0ac';
const FONT = '"Fredoka", "Baloo 2", sans-serif';

const PINK = 0xf0a9c8;
const ROW_LIGHT = 0xffffff;
const ROW_CREAM = 0xf6efe1;
const BADGE_BY_RANK = [0xffc93c, 0xbcd7ef, 0xff9f7a]; // 1st gold, 2nd blue, 3rd coral

const PANEL_X = 56;
const PANEL_W = 700;
const HEAD_BAND = 66; // clear space under the overlapping "Top Scores" pill
const ROW_PITCH = 46;
const ROW_H = 40;
const BOT_PAD = 34; // generous clear space below the last row
const MIN_BODY_ROWS = 3; // keep the panel from looking cramped on 0/1/2 results
const BOARD_SIZE = 10; // how many ranked rows the board shows
const API_TIMEOUT_MS = 8000;

// "Share the fun!" — deliberately no score, no competitive framing.
const SHARE_TEXT = 'This is such a fun game — come play with me!';
const SHARE_URL = 'https://chicken-wing-fun-game.pages.dev';

// Secondary-action pills under the tub: "Share the fun!" (left) and "Support
// Ethan" (right). Same tier, same height/font — only the label, icon and click
// handler differ. Padding is tightened from a single centred pill's 17px down
// to 13px so the pair sits side by side without touching height or font size.
const ACTION_H = 44;
const ACTION_PAD_X = 13;
const ACTION_ICON_W = 18;
const ACTION_ICON_GAP = 8;
const ACTION_GAP = 16; // between the two pills — sized so their (slightly
// oversized, for small fingers) hit zones meet edge-to-edge without overlapping
const ACTION_FONT_SIZE = '19px';
const HEART_PINK = 0xff6f9e;

// Icon glyphs for the action pills. Each draws into a fresh Graphics object at
// local coords with y=0 on the pill's vertical centre; `icx` is the icon slot's
// horizontal centre. Kept as free functions (no `this`) since they only touch
// the Graphics object passed in.
function drawShareIcon(g, icx) {
  // three dots joined from a left node — the original share-arrow glyph
  const dL = { x: icx - 6.5, y: 0 };
  const dTR = { x: icx + 6.5, y: -6.5 };
  const dBR = { x: icx + 6.5, y: 6.5 };
  g.lineStyle(2.4, INK, 1);
  g.lineBetween(dL.x, dL.y, dTR.x, dTR.y);
  g.lineBetween(dL.x, dL.y, dBR.x, dBR.y);
  g.fillStyle(INK, 1);
  g.fillCircle(dL.x, dL.y, 3);
  g.fillCircle(dTR.x, dTR.y, 3);
  g.fillCircle(dBR.x, dBR.y, 3);
}

function drawHeartIcon(g, icx) {
  // Flat pink heart: two lobes + a triangular point, same solid fill so the
  // three primitives merge into one silhouette with no visible seam. Sized to
  // roughly the same ~13-14px footprint as the share glyph above (proportional
  // icon weight, matching icon slot).
  g.fillStyle(HEART_PINK, 1);
  g.fillCircle(icx - 3.5, -2.5, 3.7);
  g.fillCircle(icx + 3.5, -2.5, 3.7);
  g.fillTriangle(icx - 6.6, -2, icx + 6.6, -2, icx, 6.2);
}

export default class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('LeaderboardScene');
  }

  init(data) {
    this.finalScore = (data && data.score) || 0;
    this.playerName = (data && data.name) || 'Player';
    this.saveError = !!(data && data.saveError);
    // the server's stored record for the round just submitted (or null): { name,
    // score, ts, message }. Used to show the player's own row immediately, with
    // its message, before KV list() propagates.
    this.justSubmitted = (data && data.justSubmitted) || null;
    this._leaving = false;
  }

  async create() {
    // guards a stale fetch from painting onto a later re-entry of this scene
    const token = (this._createToken = Symbol('create'));

    addCover(this, 'bg');

    const rx = 1016;
    this.buildYourScorePill(rx);
    this.buildPlayAgain(rx, 486);
    this.buildActionRow(rx, 646);

    // --- leaderboard: load, then render (or empty / error state) ---
    const panelCX = PANEL_X + PANEL_W / 2;
    const loading = this.add
      .text(panelCX, GAME.HEIGHT / 2, 'Loading leaderboard…', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: '700',
        color: MUTED_CSS,
      })
      .setOrigin(0.5)
      .setDepth(9);

    let entries = null; // null = load failed; [] = genuinely empty
    try {
      entries = await this.fetchLeaderboard(BOARD_SIZE);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[leaderboard] load failed:', (err && err.message) || err);
      entries = null;
    }

    // bail if the scene was left (Play Again) or superseded during the fetch
    if (token !== this._createToken || this._leaving || !this.scene.isActive()) return;

    // Optimistic self-insert: only when we actually have a list (even an empty
    // one) — on a hard load failure we keep the error state rather than showing
    // a board that's just the player.
    if (entries !== null && this.justSubmitted) {
      entries = this.mergeOwnRow(entries, this.justSubmitted, BOARD_SIZE);
    }

    loading.destroy();
    this.renderBoard(entries);
  }

  // "YOUR SCORE" pill on the right, with the count-up. Also shows a small
  // "couldn't save" note if the POST on the previous screen failed.
  buildYourScorePill(rx) {
    drawPill(this, rx, 150, 250, 150, { radius: 40, strokeWidth: 6, depth: 8 });
    this.add
      .text(rx, 150 - 40, 'YOUR SCORE', {
        fontFamily: FONT,
        fontSize: '20px',
        fontStyle: '700',
        color: MUTED_CSS,
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

    if (this.saveError) {
      this.add
        .text(rx, 150 + 92, "(couldn't save your score)", {
          fontFamily: FONT,
          fontSize: '15px',
          fontStyle: '600',
          color: '#c0705f',
        })
        .setOrigin(0.5)
        .setDepth(9);
    }
  }

  // GET /api/leaderboard -> { entries: [{ name, score, ts }], total, truncated }.
  // Returns the cleaned entries array. Throws on non-OK / network / timeout so
  // create() can distinguish "failed" from "empty".
  async fetchLeaderboard(limit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/leaderboard?limit=${limit}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = data && Array.isArray(data.entries) ? data.entries : [];
      return list
        .filter((e) => e && typeof e.name === 'string' && typeof e.score === 'number')
        .map((e) => ({
          name: e.name,
          score: e.score,
          ts: typeof e.ts === 'number' ? e.ts : 0,
          message: typeof e.message === 'string' && e.message ? e.message : null,
        }))
        .slice(0, limit);
    } finally {
      clearTimeout(timeout);
    }
  }

  // Splice the player's just-submitted (real, server-stored) row into the
  // fetched list at its ranked position — unless KV's list() already returned
  // it. Same sort as the API: score desc, then earliest ts. Re-sliced to limit.
  mergeOwnRow(list, own, limit) {
    const dupe = list.some(
      (e) =>
        e.name === own.name &&
        e.score === own.score &&
        Math.abs((e.ts || 0) - (own.ts || 0)) <= 4000
    );
    if (dupe) return list;
    const merged = [
      ...list,
      { name: own.name, score: own.score, ts: own.ts, message: own.message || null },
    ];
    merged.sort((a, b) => b.score - a.score || (a.ts || 0) - (b.ts || 0));
    return merged.slice(0, limit);
  }

  // Builds the panel + rows from real data. `entries` is null on load failure,
  // [] when the API genuinely has nothing yet.
  renderBoard(entries) {
    const panelCX = PANEL_X + PANEL_W / 2;
    const failed = entries === null;
    const list = failed ? [] : entries;

    const bodyRows = Math.max(list.length, MIN_BODY_ROWS);
    const panelH = HEAD_BAND + bodyRows * ROW_PITCH + BOT_PAD;
    const panelY = Math.max(16, Math.round((GAME.HEIGHT - panelH) / 2));

    drawPill(this, panelCX, panelY + panelH / 2, PANEL_W, panelH, {
      radius: 34,
      strokeWidth: 6,
      depth: 5,
    });
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

    const contentTop = panelY + HEAD_BAND;

    if (list.length === 0) {
      const msg = failed
        ? "Couldn't load the leaderboard.\nCheck your connection and try again."
        : 'No scores yet — be the first!';
      this.add
        .text(panelCX, contentTop + (bodyRows * ROW_PITCH) / 2 - 4, msg, {
          fontFamily: FONT,
          fontSize: '20px',
          fontStyle: '700',
          color: MUTED_CSS,
          align: 'center',
          lineSpacing: 7,
        })
        .setOrigin(0.5)
        .setDepth(9);
      return;
    }

    const rowW = PANEL_W - 40;
    const rowX = PANEL_X + 20;
    list.forEach((entry, i) => {
      const cy = contentTop + i * ROW_PITCH + ROW_H / 2;
      const rc = this.buildRow(rowX, cy, rowW, ROW_H, i, {
        name: entry.name,
        score: entry.score,
        message: entry.message || null,
        rank: i + 1,
      });
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
  }

  // Two compact rounded pills (cream fill, ink outline), same tier, side by
  // side, centred as a pair on (rx, cy) — deliberately quiet so neither rivals
  // the tub above them. Widths are measured from each label first so the pair
  // can be centred as a unit before either pill is actually drawn.
  buildActionRow(rx, cy) {
    const share = this.measureActionPill('Share the fun!');
    const support = this.measureActionPill('Support Ethan');
    const groupW = share.w + ACTION_GAP + support.w;
    const shareCx = rx - groupW / 2 + share.w / 2;
    const supportCx = rx + groupW / 2 - support.w / 2;

    this.drawActionPill(shareCx, cy, share, drawShareIcon, () => this.onShare());
    this.drawActionPill(supportCx, cy, support, drawHeartIcon, () => this.onSupport());
  }

  // Measures a label at the action-pill font and returns everything
  // drawActionPill needs: the content width (icon + gap + text) and the total
  // pill width (content + padding on both sides).
  measureActionPill(label) {
    const probe = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: ACTION_FONT_SIZE, fontStyle: '700' })
      .setVisible(false);
    const textW = Math.ceil(probe.width);
    probe.destroy();
    const contentW = ACTION_ICON_W + ACTION_ICON_GAP + textW;
    return { label, contentW, w: contentW + ACTION_PAD_X * 2 };
  }

  // Draws one action pill centred at (cx, cy) from a measureActionPill() spec.
  // `drawIcon(g, icx)` draws whatever glyph sits in the icon slot.
  drawActionPill(cx, cy, spec, drawIcon, onClick) {
    const { label, contentW, w } = spec;
    const H = ACTION_H;
    const R = H / 2;
    const view = this.add.container(cx, cy).setDepth(11);

    const g = this.add.graphics();
    g.fillStyle(0xf3f7f2, 1);
    g.fillRoundedRect(-w / 2, -H / 2, w, H, R);
    g.lineStyle(4, INK, 1);
    g.strokeRoundedRect(-w / 2, -H / 2, w, H, R);

    const icx = -contentW / 2 + ACTION_ICON_W / 2;
    const ig = this.add.graphics();
    drawIcon(ig, icx);

    const txt = this.add
      .text(-contentW / 2 + ACTION_ICON_W + ACTION_ICON_GAP, 1, label, {
        fontFamily: FONT,
        fontSize: ACTION_FONT_SIZE,
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(0, 0.5);

    view.add([g, ig, txt]);

    const hitW = w + 16;
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
      onClick();
    });
    hit.on('pointerup', () => view.setScale(1));
    hit.on('pointerupoutside', () => view.setScale(1));
  }

  // Primary: the Web Share API (opens the OS share sheet on mobile / supported
  // desktop). Fallback: copy the URL and flash a confirmation. Never a no-op.
  async onShare() {
    Sfx.play(this, 'button');

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: SHARE_TEXT, url: SHARE_URL });
        return; // shared, or the sheet handled it
      } catch (err) {
        // user dismissed the sheet -> leave it; any other error -> fall through
        if (err && err.name === 'AbortError') return;
      }
    }

    // Fallback: copy the link.
    try {
      await navigator.clipboard.writeText(SHARE_URL);
      this.flashToast(1016, 694, 'Link copied!');
    } catch (err) {
      // clipboard blocked (old browser / insecure context / no permission) —
      // at least surface the URL so it isn't a dead end.
      this.flashToast(1016, 694, SHARE_URL.replace(/^https?:\/\//, ''));
    }
  }

  // Opens Ethan's Ko-fi page in a new tab. `noopener,noreferrer` so the new tab
  // can't reach back into this window (standard hygiene for a target="_blank"-
  // style open) — window.open failing (popup blocker, older/odd browser) is a
  // silent no-op rather than an error; there's nothing useful to recover into.
  onSupport() {
    Sfx.play(this, 'button');
    window.open('https://ko-fi.com/ethansadventure', '_blank', 'noopener,noreferrer');
  }

  // Small pill toast, centred on (cx, cy): fades in, holds ~1.5s, fades out.
  flashToast(cx, cy, message) {
    const txt = this.add
      .text(cx, cy, message, {
        fontFamily: FONT,
        fontSize: '17px',
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(0.5)
      .setDepth(61);
    const w = Math.ceil(txt.width) + 34;
    const h = 34;
    const bg = this.add.graphics().setDepth(60);
    bg.fillStyle(0xf3f7f2, 1);
    bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    bg.lineStyle(3, INK, 1);
    bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);

    const parts = [bg, txt];
    parts.forEach((o) => o.setAlpha(0));
    this.tweens.add({
      targets: parts,
      alpha: 1,
      duration: 140,
      ease: 'Sine.Out',
      onComplete: () => {
        this.tweens.add({
          targets: parts,
          alpha: 0,
          delay: 1500,
          duration: 320,
          ease: 'Sine.In',
          onComplete: () => parts.forEach((o) => o.destroy()),
        });
      },
    });
  }

  // One leaderboard row: a numbered circle badge, the name, an optional message
  // ("— 'Best game ever!'"), and the score right-aligned. `entry` is
  // { name, score, message, rank }. Rows alternate white / cream.
  buildRow(x, cy, w, h, i, entry) {
    const rc = this.add.container(0, 0).setDepth(6);
    const fill = i % 2 ? ROW_CREAM : ROW_LIGHT;

    const g = this.add.graphics();
    g.fillStyle(fill, 1);
    g.fillRoundedRect(x, cy - h / 2, w, h, 20);
    g.lineStyle(3, INK, 1);
    g.strokeRoundedRect(x, cy - h / 2, w, h, 20);
    rc.add(g);

    // rank badge
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
    const nameX = x + 52;
    const nameText = this.add
      .text(nameX, cy + 0.5, String(entry.name), {
        fontFamily: FONT,
        fontSize: '21px',
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(0, 0.5);
    rc.add(nameText);

    // optional message — muted, after the name, ellipsised if it would collide
    // with the score. (The 50-char server cap makes overflow rare.)
    if (entry.message) {
      const msgX = nameX + nameText.width + 10;
      const avail = x + w - 24 - scoreText.width - 18 - msgX;
      const msg = this.add
        .text(msgX, cy + 0.5, `— '${entry.message}'`, {
          fontFamily: FONT,
          fontSize: '16px',
          fontStyle: '600',
          color: '#6a7580',
        })
        .setOrigin(0, 0.5);
      if (msg.width > avail && avail > 24) {
        let s = entry.message;
        while (s.length > 1 && msg.width > avail) {
          s = s.slice(0, -1);
          msg.setText(`— '${s.replace(/\s+$/, '')}…'`);
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
