# Deflektor (modern clone): design

A web remake of Deflektor (Costa Panayi, Gremlin Graphics, 1987): the same puzzle with a neon/synthwave presentation.

## Decisions

| Topic | Decision |
|---|---|
| Levels | The first 15 original C64 levels, extracted from `levels.png` |
| Look | Neon glow on a dark board, bloom on the beam, particles |
| Stack | Vite + TypeScript + PixiJS v8 (+ pixi-filters bloom); DOM overlay for menus/HUD |
| Controls | Mouse/touch (click/tap = clockwise, right-click = counter-clockwise, hold = spin, wheel) and a keyboard cursor (arrows/WASD, Space/X = cw, Z = ccw) |
| Extras | Web Audio synth SFX + ambient music, localStorage progress, lives & score |
| Deploy | Fly.io, nginx static container (same pattern as sibling projects) |

## Board and beam geometry

- The board is 15 × 9 tiles. Walls sit on a 30 × 18 grid of quarter tiles, like the original's 8px bricks.
- Beam coordinates are in quarter-tile units from the board's top-left corner. Tile `(x, y)` is centred on `(2x + 1, 2y + 1)`.
- 16 directions, index 0 = up, clockwise. Like the original, they are steps of `(0,2) (1,2) (2,2) (2,1)…` rather than exact 22.5° angles. The C64 screenshots show a beam leaving a mirror at about 1:2.
- Reflection off a mirror with rotation `m`: `out = (m − in) mod 16`. If `out == in`, the beam is parallel to the mirror and passes through.
- The ray is followed cell by cell across the quarter-tile grid:
  - **Walls.** Entering a brick reflects the beam (purple) or absorbs it (light blue). A ray lying exactly on a brick seam is blocked only if the bricks on both sides are solid. At a grid corner, a flat face flips the axis it faces, a lone brick corner deflects the beam sideways, and a concave corner sends it back.
  - **Objects.** An object reacts only when the ray crosses the central half of its tile. Mirrors, refractors and reflecting polarisers send the beam on from the tile centre.
- The trace ends at an absorbing piece, the board edge, or a repeated state (refractors can create loops).

These collision rules were chosen by testing variants against the solver: they are the ones under which the original layouts play as intended.

## Pieces

Tile map (15 × 9):

| Char | Piece | Beam behaviour |
|---|---|---|
| `.` | empty | passes |
| `E` | laser (direction in level meta) | origin; beam returning into it → overload |
| `R` | receiver | absorbs; once all cells are gone, a beam reaching it completes the level |
| `0-9a-f` | mirror with that rotation | reflects; the player rotates it |
| `@` | rotating mirror | reflects; turns by itself |
| `o` | cell | absorbs; destroyed on contact (+score) |
| `x` | mine | absorbs; raises overload quickly |
| `*` | refractor (prism) | sends the beam on in a random direction that changes every 0.6 s |
| `p` / `q` | polariser, absorbing / reflecting | rotates through 8 axes (0.5 s per step); passes beams along its axis, otherwise absorbs (`p`) or reflects like a mirror on its axis (`q`) |
| `T` `U` | fibre-optic pair | beam enters one and leaves the other with the same direction |
| `#` `=` `+` | shorthand for a whole tile of purple bricks, light-blue bricks or gate | see walls |

Wall map (30 × 18, optional): `#` purple brick (reflects), `=` light-blue brick (absorbs), `+` gate (reflects until the last cell is destroyed, then vanishes).

## Meters and flow

- **Charging:** each level starts with the laser charging for 2 s (the original's "CHARGING LAZER"). The beam shows as an aiming guide, mirrors can be turned, and nothing burns, overloads or drains yet.
- **Energy** drains over the level's `energySeconds`. At zero you lose a life.
- **Overload** rises while the beam ends on a mine or back in the laser, and decays otherwise. When it's full you lose a life.
- Losing a life restarts the level. Zero lives means game over.
- Score: +100 per cell, and a bonus of `round(energy × 1000)` for completing a level.
- A run starts with 3 lives. Completing a level unlocks the next (saved in localStorage along with the high score and mute setting).

## Level extraction

`scripts/extract_levels.py` reads `levels.png` (a sheet of 320 × 200 C64 screens) and writes `src/engine/levels.ts`:

- The playfield starts at pixel (40, 24) of each screen.
- Mirrors are matched against the 16 mirror sprites (nearest pixel distance, which tolerates the cursor or beam drawn over them).
- Other objects are classified by colour; the emitter's barrel side gives its direction.
- Each 8px quarter is classified as a purple brick, a light-blue brick or empty.
- Light-blue bricks in the tiles around the receiver become gates.
- A second "receiver" detection is the cursor bracket, which is drawn in the same red.

Our model can't reproduce the original's pixel-exact grazing everywhere. Levels 2, 3 and 8 each had one brick right beside a target that made them unfinishable. `SOLVABILITY_PATCHES` removes those bricks, and a unit test solves every level.

Not recoverable from screenshots: which static mirrors actually rotate on their own, polariser starting angles, and time limits (all levels use 150 s).

## Architecture

- `src/engine/`: pure TS with no DOM/Pixi: types, level parser, `traceBeam`, `Machinery` (moving parts), `Game`.
- `src/render/`: Pixi views (`BoardView`, `WallsView`, `BeamView`, `Effects`).
- `src/input/`: pointer + keyboard → `game.rotateMirror()`.
- `src/audio/`: Web Audio synth.
- `src/app/`: screen flow (DOM overlay), HUD, progress storage.
- `tests/support/solver.ts`: breadth-first search over (piece, incoming direction) with verification. It proves every level is solvable and feeds the e2e tests.
- In dev builds, `window.__deflektor` exposes the app for Playwright.

## Challenge pieces

Parameterised pieces live in a level file's `pieces` list (see `levels/README.md`) and are implemented as
behaviours in `src/engine/pieces.ts`; the tracer only knows pass / turn / split / stop / teleport:

- **Splitter**: the beam continues and a reflected branch starts at the tile centre (up to 16 branches).
- **One-way mirror**: reflects off its bright face, passes from behind; player-rotatable.
- **Limited turns / fragile mirrors**: turns run out (undo refunds them); fragile mirrors shatter after
  1.5 s of reflecting the beam.
- **Moving cells**: patrol a row or column, turning round at anything but empty space.
- **Timed levels**: `timeLimitSeconds` costs a life when it runs out.

## Scoring and replay

Par comes from the solver (fewest clicks × 1.5 + 1; time from the work involved). Stars: ★ solved,
★★ within the turn limit, ★★★ also within the time limit with no restarts or hints. Best score, time and
stars, plays and completions are saved per level. The daily challenge (`src/engine/challenge.ts`) draws a
layout from a seeded random source and keeps it only if it is valid and solvable, so a seed always gives
the same level; results can be shared as a code in the challenge link.

## Not yet done

Levels 16–60, gremlins, and overload from an overly long beam.
