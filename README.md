# Chicken Wing Fun

A browser game for ages ~5–9. A penguin flings chicken wings, Angry-Birds-style
drag-to-aim, into a bathtub that slides side to side. 120-second round, no way to
lose — when the timer hits zero you get your score and a **Play Again** button.

Built with **Phaser 3** (loaded from CDN). No build step.

## Run it

The game uses ES modules, so it needs to be served over HTTP (opening
`index.html` from `file://` won't work).

```bash
npm install      # one-time: pulls in a tiny static server
npm start        # serves at http://localhost:8080
```

No Node? Anything that serves static files works, e.g.:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>.

## Controls

Press, drag, release — anywhere on the screen. Drag direction sets the angle,
drag distance sets the power (both capped). The wing auto-reloads after ~0.4 s.
`Space` / `Enter` also work on the Start and Leaderboard screens (`Enter`
submits the name on the Final Score screen).

## Project layout

```
index.html            # loads Phaser + src/main.js
src/
  main.js             # Phaser game config + scene list
  config.js           # ALL tuning knobs (physics, layout, timings, colours)
  scenes/
    BootScene.js      # web-font load
    PreloadScene.js   # loads every image
    StartScene.js     # title screen + live "CHICKEN WING FUN" text
    GameScene.js      # gameplay: aim, throw, scoring, HUD, juice
    ScoreEntryScene.js  # end-of-round screen 1: final score + name entry
    LeaderboardScene.js # end-of-round screen 2: top-10 board + your rank
  objects/
    Penguin.js        # 3-pose thrower (neutral / windup / release)
    Tub.js            # the moving target
    Wing.js           # a thrown wing (gravity arc, tumble, bounce, catch)
  ui/
    Hud.js            # SCORE + TIME pills, drawn in code
    widgets.js        # shared pill / pill-button helpers for the end screens
  data/
    mockLeaderboard.js  # placeholder top-scores (real backend comes later)
  util/
    scoring.js        # the 5 ring hit-zones (see note below)
    trajectory.js     # aim-guide arc sim
    display.js        # cover-scale a background image
    textures.js       # runtime-generated sparkle texture
    sfx.js            # audio stubs — no-ops until files exist
```

## Scoring rings

Zones score **1 / 5 / 10 / 15 / 20** (bullseye = 20). The tub art is drawn in
3/4 perspective, so the rings are **not concentric circles** — each is an oval
with its own centre and radii. Those ovals were measured by analysing the pixels
of `assets/images/tub/tub.png` and live in `src/util/scoring.js`, along with a
per-ring `gen` (generosity) multiplier — the bullseye is deliberately inflated
(`1.30`) so young kids can land it.

## Audio

Not wired yet. `src/util/sfx.js` has named stubs (`throw`, `bounce`, `boop`,
`sparkle`, `button`). Drop files into `assets/audio/`, `this.load.audio(...)`
them in `PreloadScene`, and `Sfx.play()` starts using them — no other changes.

## Tuning cheat-sheet (`src/config.js`)

| Knob | Effect |
| --- | --- |
| `GRAVITY` | Higher = wings drop faster / flatter arcs |
| `MAX_SPEED` / `MAX_DRAG` | Throw power ceiling and how far you drag to reach it |
| `COOLDOWN` | Auto-reload delay (ms) |
| `TUB_SPEED` / `TUB_MIN_X` / `TUB_MAX_X` | Target speed and travel range |
| `ROUND_SECONDS` | Round length |
| `END_SCORE_POS` | Where the final score prints on the end screen |
