import { findTiles } from './level';
import { solveBoard } from './solver';
import type { Board } from './types';

/**
 * Whether the level can still be finished from the board as it is now: cells already popped stay
 * popped, shattered mirrors stay gone and limited mirrors only have the turns they have left.
 * Moving cells make the answer depend on where they will be, so such boards are given the benefit
 * of the doubt.
 */
export function canStillFinish(board: Board): boolean {
  const hasMovingCells = findTiles(board, 'pod').some((tile) => {
    const pod = board.tiles[tile.y][tile.x];
    return pod.kind === 'pod' && pod.moves !== undefined;
  });
  if (hasMovingCells) return true;
  try {
    solveBoard(structuredClone(board), 'current board');
    return true;
  } catch {
    return false;
  }
}
