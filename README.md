# Deflektor

A neon remake of **Deflektor** (Costa Panayi / Gremlin Graphics, 1987). You rotate mirrors to steer a laser through every cell, then into the receiver, while managing energy and overload. The levels are the first 15 of the Commodore 64 original, extracted from screenshots (`levels.png`).

Built with TypeScript, PixiJS v8 (with bloom from pixi-filters) and Vite. All sound is synthesized with Web Audio.

## Play

New players start with **Training**: five short lessons with contextual tips.

- **Mouse:** click a mirror to rotate it clockwise, right-click to turn it back, hold to spin; the wheel also works. Hovering previews where the next turn sends the beam.
- **Touch:** tap the right half of a mirror to turn it clockwise, the left half to turn it back; hold to spin.
- **Difficulty:** Relaxed (default: twice the energy, overload builds at half speed), Normal, or Classic (tuned like the original). The level layouts and hit rules are the same on every setting.
- **Keyboard:** arrows / WASD jump between mirrors, Space / X rotate, Z rotates back. Ctrl+Z / Ctrl+Shift+Z undo and redo, H shows a hint, R restarts, P / Esc pause, M mutes.
- **Stars:** ★ solve it, ★★ within the turn limit, ★★★ within the turn and time limits with no restarts or hints. Best score, time and stars are saved per level.
- **Daily challenge:** a new generated level every day (the same for everyone), with modifiers such as beam splitters, one-way mirrors, limited-turn or fragile mirrors, moving targets and a clock. Share your result as a link; `?challenge=<seed>` opens any seed.
- **Settings:** separate music and effects volume, tips, reduced motion, high contrast, and effects quality (automatically lighter on slow devices).

## Develop

```bash
npm install
npm run dev        # http://localhost:5190
npm test           # Vitest: engine, levels (solver-verified), progress, layout
npm run check-levels   # validate every level file and prove it solvable
python3 scripts/extract_levels.py 15   # regenerate levels/original/*.json from levels.png (needs Pillow)
npm run test:e2e   # Playwright: menus, controls, pause, clearing a sector, losing a life
npm run build
```

## Layout

- `src/engine/`: pure game rules (beam tracing over quarter-tile bricks, 16 directions, moving parts, meters, levels). No DOM.
- `src/render/`: Pixi views (board, beam, particles).
- `src/input/`: pointer and keyboard controls.
- `src/audio/`: Web Audio synth.
- `src/app/`: screen flow, HUD, hint coach, outcomes, settings, versioned save.
- `levels/`: level files (JSON), picked up automatically; see `levels/README.md` for the format and the editor (`/?editor` in dev).
- `scripts/extract_levels.py`: turns the C64 screenshots into level files.
- `tests/support/solver.ts`: proves every level is solvable. Unit tests fail if a level edit breaks that.
- `docs/specs/`: design notes and the map legend for writing levels.

## Deploy

Deploys to Fly.io as a static nginx container (`Dockerfile`, `nginx.conf`, `fly.toml`):

```bash
fly launch --no-deploy   # first time only, if the app name needs claiming
fly deploy
```
