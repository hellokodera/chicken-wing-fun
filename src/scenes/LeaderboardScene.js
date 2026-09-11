import { GAME } from '../config.js';
import { addCover } from '../util/display.js';
import { Sfx } from '../util/sfx.js';
import { drawPill, hitFloor } from '../ui/widgets.js';

const SUPPORT_URL = 'https://ko-fi.com/ethansadventure';

// Screen 2 of the end-of-round flow. Fetches the real top scores from
// GET /api/leaderboard and renders them — "badge  name  score" per row, every
// row the same solid-bordered style. There is NO mock data: every score on the
// board is a real, server-stored record. Two client-side touches patch over KV
// list()'s eventual consistency (a fresh put() can take a few seconds to show
// up in list()) rather than leaving the player's own score to just vanish:
//   - mergeOwnRow() optimistically splices the just-submitted row into the top
//     10 by score if list() hasn't caught up yet.
//   - if the player's score doesn't place in the top 10 at all, their row is
//     still shown as an extra row below it (see computeExtraRow/renderBoard) —
//     ranked using the server's own full scan when available (GET
//     /api/leaderboard?playerId=), never guessed client-side.
// Empty API result -> an explicit "no scores yet" message; a failed fetch ->
// a "couldn't load" message. The player's own score is ALSO always shown
// separately in the "YOUR SCORE" pill on the right, regardless of any of the
// above. "Play Again" is the real bathtub asset.
const INK = 0x26313a;
const INK_CSS = '#26313a';
const MUTED_CSS = '#8fa0ac';
const FONT = '"Fredoka", "Baloo 2", sans-serif';

const PINK = 0xf0a9c8;
const ROW_LIGHT = 0xffffff;
const ROW_CREAM = 0xf6efe1;
const OWN_ROW_FILL = 0xffe7a6; // highlight fill for the player's own extra row
const EXTRA_ROW_GAP = 16; // extra breathing room above the out-of-top-10 player row
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
    let serverPlayer = null; // the submitter's true rank from the server's full
    // scan (GET /api/leaderboard?playerId=), or null — see computeExtraRow.
    try {
      const own = this.justSubmitted;
      const res = await this.fetchLeaderboard(BOARD_SIZE, own && own.id);
      entries = res.entries;
      serverPlayer = res.player;
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
    const extraRow = this.computeExtraRow(entries, serverPlayer);

    loading.destroy();
    this.renderBoard(entries, extraRow);
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

  // GET /api/leaderboard -> { entries, total, truncated, player }.
  // Returns { entries: cleaned array, player: { rank, name, score, message } |
  // null }. `playerId` (the just-submitted record's id, if any) asks the
  // server to also report that record's TRUE rank from its full scan, even
  // when it falls outside `limit` — player stays null if no id was given, or
  // if that record hasn't propagated to KV's list() yet. Throws on non-OK /
  // network / timeout so create() can distinguish "failed" from "empty".
  async fetchLeaderboard(limit, playerId) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const qs = playerId ? `&playerId=${encodeURIComponent(playerId)}` : '';
      const res = await fetch(`/api/leaderboard?limit=${limit}${qs}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = data && Array.isArray(data.entries) ? data.entries : [];
      const entries = list
        .filter((e) => e && typeof e.name === 'string' && typeof e.score === 'number')
        .map((e) => ({
          name: e.name,
          score: e.score,
          ts: typeof e.ts === 'number' ? e.ts : 0,
          message: typeof e.message === 'string' && e.message ? e.message : null,
        }))
        .slice(0, limit);
      const p = data && data.player;
      const player =
        p && typeof p.rank === 'number' && typeof p.name === 'string' && typeof p.score === 'number'
          ? { rank: p.rank, name: p.name, score: p.score, message: typeof p.message === 'string' && p.message ? p.message : null }
          : null;
      return { entries, player };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Identity check used by both mergeOwnRow and computeExtraRow: is `e` the
  // same submission as `own`? (No shared id on the client side pre-merge, so
  // this matches on name + score + a close timestamp, same as the server's
  // own dedup-adjacent logic would.)
  isOwnRow(e, own) {
    return (
      e.name === own.name && e.score === own.score && Math.abs((e.ts || 0) - (own.ts || 0)) <= 4000
    );
  }

  // Splice the player's just-submitted (real, server-stored) row into the
  // fetched list at its ranked position — unless KV's list() already returned
  // it. Same sort as the API: score desc, then earliest ts. Re-sliced to limit.
  mergeOwnRow(list, own, limit) {
    if (list.some((e) => this.isOwnRow(e, own))) return list;
    const merged = [
      ...list,
      { name: own.name, score: own.score, ts: own.ts, message: own.message || null },
    ];
    merged.sort((a, b) => b.score - a.score || (a.ts || 0) - (b.ts || 0));
    return merged.slice(0, limit);
  }

  // Decide whether the player's own row needs to be shown as an EXTRA row
  // below the top-10 list — i.e. it isn't already sitting inside `entries`
  // (genuinely ranked there, or optimistically placed there by mergeOwnRow).
  // Prefers the server's true rank (from its full, unsliced scan of every
  // record via ?playerId=); if that record hasn't propagated to list() yet
  // (KV eventual consistency can lag a fresh put() by a few seconds), falls
  // back to showing the row from what the client already knows — WITHOUT a
  // specific rank number, rather than guessing one. Returns null when there's
  // nothing to add (no submission this visit, load failed, or already shown).
  computeExtraRow(entries, serverPlayer) {
    const own = this.justSubmitted;
    if (!own || entries === null) return null;
    if (entries.some((e) => this.isOwnRow(e, own))) return null;
    if (serverPlayer) {
      return {
        name: serverPlayer.name,
        score: serverPlayer.score,
        message: serverPlayer.message,
        rank: serverPlayer.rank,
      };
    }
    return { name: own.name, score: own.score, message: own.message || null, rank: null };
  }

  // Builds the panel + rows from real data. `entries` is null on load failure,
  // [] when the API genuinely has nothing yet. `extraRow` (from
  // computeExtraRow) is the player's own { name, score, message, rank } when
  // their score doesn't place in `entries` — rendered as an 11th, highlighted
  // row below the top 10, same as before the real backend replaced the old
  // mock-data board's always-show-your-row behaviour.
  renderBoard(entries, extraRow = null) {
    const panelCX = PANEL_X + PANEL_W / 2;
    const failed = entries === null;
    const list = failed ? [] : entries;
    const showExtra = !failed && !!extraRow;

    const bodyRows = Math.max(list.length, MIN_BODY_ROWS) + (showExtra ? 1 : 0);
    const panelH = HEAD_BAND + bodyRows * ROW_PITCH + (showExtra ? EXTRA_ROW_GAP : 0) + BOT_PAD;
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

    if (showExtra) {
      const cy = contentTop + list.length * ROW_PITCH + EXTRA_ROW_GAP + ROW_H / 2;
      const rc = this.buildRow(rowX, cy, rowW, ROW_H, list.length, {
        name: extraRow.name,
        score: extraRow.score,
        message: extraRow.message || null,
        rank: extraRow.rank,
        // rank is null while the server's full scan hasn't found this record
        // yet (KV list() lag) — show a dash rather than a guessed number.
        rankLabel: extraRow.rank != null ? String(extraRow.rank) : '–',
        highlight: true,
      });
      rc.setAlpha(0);
      this.tweens.add({
        targets: rc,
        alpha: 1,
        y: { from: 8, to: 0 },
        duration: 220,
        delay: 60 + list.length * 42 + 80,
        ease: 'Sine.Out',
      });
    }
  }

  // Two compact rounded pills (cream fill, ink outline), same tier, side by
  // side, centred as a pair on (rx, cy) — deliberately quiet so neither rivals
  // the tub above them. Widths are measured from each label first so the pair
  // can be centred as a unit before either pill is actually drawn.
  //
  // Share stays a normal Phaser hit rectangle (drawActionPill). Support is
  // built differently (buildSupportPill) — its tap target is a real DOM <a>
  // anchor, not a Phaser hit test, because window.open() from a Phaser
  // pointer handler isn't safe from popup blockers (see buildSupportPill).
  buildActionRow(rx, cy) {
    const share = this.measureActionPill('Share the fun!');
    const support = this.measureActionPill('Support Ethan');
    const groupW = share.w + ACTION_GAP + support.w;
    const shareCx = rx - groupW / 2 + share.w / 2;
    const supportCx = rx + groupW / 2 - support.w / 2;

    // 'left': Share's hit box only ever grows outward (left), never toward
    // Support — see drawActionPill's growDir doc.
    this.drawActionPill(shareCx, cy, share, drawShareIcon, () => this.onShare(), 'left');
    this.buildSupportPill(supportCx, cy, support);
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
  //
  // `growDir` ('left' | 'right' | null): the base hit box (w+16 x H+14) was
  // sized so this pill and its neighbour meet exactly edge-to-edge with zero
  // gap AND zero overlap (see ACTION_GAP's own comment) — at ANY canvas
  // scale, since both pill widths and the gap between them are all in world
  // units, scaled uniformly together. That means flooring the hit box to the
  // 48px real-px minimum (ui/widgets.js hitFloor) symmetrically would push
  // it straight into the neighbour's territory on small screens. `growDir`
  // keeps the edge facing the neighbour fixed exactly where it already is,
  // and only grows the OUTER edge (away from the neighbour) to reach the
  // floor — so it can add real tap-target area but can never overlap.
  drawActionPill(cx, cy, spec, drawIcon, onClick, growDir = null) {
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

    const baseW = w + 16;
    const baseH = H + 14;
    const { w: hitW, h: hitH } = hitFloor(this, baseW, baseH);
    const extraW = hitW - baseW;
    let hitCx = cx;
    if (extraW > 0 && growDir === 'left') hitCx = cx - extraW / 2;
    else if (extraW > 0 && growDir === 'right') hitCx = cx + extraW / 2;

    const hit = this.add.rectangle(hitCx, cy, hitW, hitH).setDepth(12);
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

  // Same visuals as drawActionPill, but the tap target is a real DOM <a>
  // anchor overlaid on the canvas, not a Phaser hit rectangle + window.open().
  //
  // window.open() called from a Phaser pointerdown handler isn't safe: Phaser
  // queues the native touch/pointer event and only emits its OWN 'pointerdown'
  // on game objects during its input-processing step (not synchronously
  // inside the browser's trusted click/touch handler) — so by the time
  // onClick() runs, the call is no longer nested in a call stack the browser
  // recognises as "this IS the user's gesture," and strict popup blockers
  // (Safari especially; some Android WebViews too) silently block it as an
  // untrusted popup. A real anchor tag sidesteps the whole problem: clicking
  // it is native link navigation, which no popup blocker ever touches.
  //
  // Sized/positioned exactly like the fullscreen toggle's DOM overlay (see
  // util/fullscreenButton.js) — a fixed-position element in real CSS px,
  // derived each frame from the canvas's live on-screen rect — but floored
  // to 48px growing ONLY rightward/outward (never left, toward Share) so it
  // can't encroach on Share's own hit zone next to it (see drawActionPill's
  // growDir doc — the two pills' base hit boxes already meet edge-to-edge
  // with zero slack by design).
  buildSupportPill(cx, cy, spec) {
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
    drawHeartIcon(ig, icx);

    const txt = this.add
      .text(-contentW / 2 + ACTION_ICON_W + ACTION_ICON_GAP, 1, label, {
        fontFamily: FONT,
        fontSize: ACTION_FONT_SIZE,
        fontStyle: '700',
        color: INK_CSS,
      })
      .setOrigin(0, 0.5);
    view.add([g, ig, txt]);

    const baseW = w + 16;
    const baseH = H + 14;
    const leftWorld = cx - baseW / 2; // fixed — the edge shared with Share

    const link = document.createElement('a');
    link.href = SUPPORT_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Support Ethan — opens Ko-fi in a new tab');
    // z-index just needs to clear the canvas — nowhere near
    // orientationGuard's overlay (2147483000), so that overlay still covers
    // this exactly like it covers the canvas when the device is in portrait.
    link.style.cssText = `
      position:fixed; z-index:20; display:block; background:transparent;
      -webkit-tap-highlight-color:transparent; touch-action:manipulation;
    `;
    document.body.appendChild(link);

    const reposition = () => {
      const canvas = this.game.canvas;
      if (!canvas || !link.isConnected) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / GAME.WIDTH;
      const scaleY = rect.height / GAME.HEIGHT;

      const pxW = Math.max(baseW * scaleX, 48);
      const pxH = Math.max(baseH * scaleY, 48);
      const leftPx = rect.left + leftWorld * scaleX; // shared edge, unmoved
      const topPx = rect.top + (cy - baseH / 2) * scaleY - (pxH - baseH * scaleY) / 2;

      link.style.left = `${leftPx}px`;
      link.style.top = `${topPx}px`;
      link.style.width = `${pxW}px`;
      link.style.height = `${pxH}px`;
    };
    reposition();

    const pressDown = () => {
      view.setScale(0.96);
      Sfx.play(this, 'button');
    };
    const pressUp = () => view.setScale(1);
    link.addEventListener('pointerdown', pressDown);
    link.addEventListener('pointerup', pressUp);
    link.addEventListener('pointerleave', pressUp);
    link.addEventListener('mouseenter', () => view.setScale(1.04));
    link.addEventListener('mouseleave', () => view.setScale(1));

    window.addEventListener('resize', reposition, { passive: true });
    window.addEventListener('orientationchange', reposition, { passive: true });
    const PRE_STEP =
      (window.Phaser && Phaser.Core && Phaser.Core.Events && Phaser.Core.Events.PRE_STEP) ||
      'prestep';
    this.game.events.on(PRE_STEP, reposition);

    this.events.once('shutdown', () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('orientationchange', reposition);
      this.game.events.off(PRE_STEP, reposition);
      link.remove();
    });

    return { view, link };
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
  // { name, score, message, rank, rankLabel?, highlight? }. Rows alternate
  // white / cream, UNLESS `highlight` is set (the player's own row when it
  // falls outside the top 10) — then it gets the warm own-row fill instead,
  // same as every other row otherwise. `rankLabel` overrides the badge text
  // (falls back to `String(rank)`) — used to show "–" when the true rank
  // isn't known yet rather than a fabricated number.
  buildRow(x, cy, w, h, i, entry) {
    const rc = this.add.container(0, 0).setDepth(6);
    const fill = entry.highlight ? OWN_ROW_FILL : i % 2 ? ROW_CREAM : ROW_LIGHT;

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
        .text(bx, cy + 0.5, entry.rankLabel != null ? entry.rankLabel : String(entry.rank), {
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
