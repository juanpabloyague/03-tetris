# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A vanilla JavaScript Tetris implementation using HTML5 Canvas. No dependencies, no build step, no package.json.

## Running

Just open `index.html` in a browser, or serve it statically:

```bash
npx serve .
# or
python3 -m http.server 8000
```

There is no build, lint, or test tooling in this repo — changes to `game.js` take effect on page reload.

## Architecture

Three files, each with one responsibility:

- `index.html` — DOM structure: the `#board` canvas (300×600, 10×20 cells of 30px `BLOCK` each), the `#next-canvas` preview, HUD spans (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade visuals only.
- `game.js` — all game logic, single file, no modules. Top-level `let` variables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`) hold all mutable game state; there is no state container or class.

Key mechanics in `game.js`:

- **Board**: `ROWS × COLS` matrix of `0` (empty) or a color index `1–7` identifying the locked piece's type.
- **Pieces**: square matrices in `PIECES`; rotation is a transpose via `rotateCW`, not a lookup table.
- **Collision** (`collide`): checks board bounds and overlap with locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` until one doesn't collide.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates `dt` into `dropAccum` and advances the piece when it exceeds `dropInterval`.
- **Line clear** (`clearLines`): scans bottom-up, splices full rows out and unshifts empty rows in; re-checks the same row index after a splice.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level`; hard drop adds 2 pts/cell dropped, soft drop adds 1 pt/row.
- **Level/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level - 1) * 90)`.
- **Ghost piece**: `ghostY()` projects the current piece straight down and is drawn at `globalAlpha = 0.2` in `draw()`.

If you change `COLS`, `ROWS`, or `BLOCK`, also update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK`, `ROWS × BLOCK`) — they aren't computed at runtime.

All UI strings and comments in this codebase are in Spanish; match that convention if adding more.
