import { findTiles } from '../engine/level';
import type { Board, Point, Tile } from '../engine/types';

/** Mirrors the player turns (not self-rotating ones), including one-way mirrors. */
export function isPlayerTurnable(tile: Tile): boolean {
  return tile.kind === 'oneWay' || (tile.kind === 'mirror' && !tile.auto);
}

export function playerMirrors(board: Board): Point[] {
  const mirrors: Point[] = [];
  board.tiles.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (isPlayerTurnable(tile)) mirrors.push({ x, y });
    }),
  );
  return mirrors;
}

/** The nearest player mirror in the pressed direction, favouring ones lined up with the cursor. */
export function mirrorInDirection(board: Board, from: Point, step: Point): Point | undefined {
  let best: Point | undefined;
  let bestScore = Infinity;
  for (const mirror of playerMirrors(board)) {
    const dx = mirror.x - from.x;
    const dy = mirror.y - from.y;
    const along = dx * step.x + dy * step.y;
    if (along <= 0) continue;
    const across = Math.abs(dx * step.y - dy * step.x);
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = mirror;
    }
  }
  return best;
}

/** Where the keyboard cursor lands first: the player mirror closest to the emitter. */
export function startingMirror(board: Board): Point | undefined {
  const emitter = findTiles(board, 'emitter')[0];
  const distance = (tile: Point) => Math.hypot(tile.x - emitter.x, tile.y - emitter.y);
  return playerMirrors(board).sort((a, b) => distance(a) - distance(b))[0];
}
