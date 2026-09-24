# Deflektor

A neon remake of **Deflektor** (Costa Panayi / Gremlin Graphics, 1987). You rotate mirrors to steer a laser through every cell, then into the receiver, while managing energy and overload. The levels are the first 15 of the Commodore 64 original, extracted from screenshots (`levels.png`).

Built with TypeScript, PixiJS v8 (with bloom from pixi-filters) and Vite. All sound is synthesized with Web Audio.

## Play

- **Mouse / touch:** click or tap a mirror to rotate it clockwise. Right-click rotates it counter-clockwise, holding spins it, and the wheel also works.
- **Keyboard:** arrows / WASD jump between mirrors, Space / X rotate, Z rotates back, P / Esc pause, M mutes.

## Develop

```bash
npm install
npm run dev        # http://localhost:5190
npm test           # Vitest: engine, levels (solver-verified), progress, layout
python3 scripts/extract_levels.py 15   # regenerate src/engine/levels.ts from levels.png (needs Pillow)
npm run test:e2e   # Playwright: menus, controls, pause, clearing a sector, losing a life
npm run build
```

## Layout

- `src/engine/`: pure game rules (beam tracing over quarter-tile bricks, 16 directions, moving parts, meters, levels). No DOM.
- `src/render/`: Pixi views (board, beam, particles).
- `src/input/`: pointer and keyboard controls.
- `src/audio/`: Web Audio synth.
- `src/app/`: screen flow, HUD, saved progress.
- `scripts/extract_levels.py`: turns the C64 screenshots into level maps.
- `tests/support/solver.ts`: proves every level is solvable. Unit tests fail if a level edit breaks that.
- `docs/specs/`: design notes and the map legend for writing levels.

## Deploy

Deploys to Fly.io as a static nginx container (`Dockerfile`, `nginx.conf`, `fly.toml`):

```bash
fly launch --no-deploy   # first time only, if the app name needs claiming
fly deploy
```
