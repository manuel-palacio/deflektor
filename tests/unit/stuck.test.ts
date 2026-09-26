import { describe, expect, it } from 'vitest';
import { Game, RULES } from '../../src/engine/game';
import { parseLevel } from '../../src/engine/level';
import { LEVELS } from '../../src/engine/levels';
import { solveLevel } from '../../src/engine/solver';
import { canStillFinish } from '../../src/engine/stuck';
import { level } from './helpers';

describe('canStillFinish', () => {
  it('is true for every level as it starts', () => {
    for (const shipped of LEVELS) expect(canStillFinish(parseLevel(shipped))).toBe(true);
  });

  it('notices when a limited mirror has no turns left to reach the only route', () => {
    // The cell above the mirror needs rotation 4; the mirror starts at 8 with only 1 turn.
    const limited = { ...level(['', '', '', '', 'E......8......R', '', '', '', ''].map((row, y) => (y === 1 ? '.......o' : row))), pieces: [{ x: 7, y: 4, type: 'mirror' as const, rotation: 8, turns: 1 }] };
    expect(() => solveLevel(limited)).toThrow();
    const generous = { ...limited, pieces: [{ ...limited.pieces[0], turns: 4 }] };
    expect(canStillFinish(parseLevel(generous))).toBe(true);
  });

  it('notices when the fragile mirror the level needed has shattered', () => {
    // The fragile mirror at (3,0) turns the beam down onto the cell and then into the receiver.
    const fragile = {
      ...level(['E', '', '...o', '', '', '', '', '', '...R']),
      pieces: [{ x: 3, y: 0, type: 'mirror' as const, rotation: 12, fragile: true }],
    };
    const game = new Game([fragile], { chargeSeconds: 0 });
    expect(canStillFinish(game.board)).toBe(true);
    game.board.tiles[0][3] = { kind: 'empty' };
    expect(canStillFinish(game.board)).toBe(false);
  });

  it('gives moving cells the benefit of the doubt', () => {
    const moving = { ...level(['E#.....o', '', '', '', '', '', '', '', 'R']), pieces: [{ x: 7, y: 0, type: 'pod' as const, moves: 'horizontal' as const }] };
    expect(canStillFinish(parseLevel(moving))).toBe(true);
  });

  it('does not change the board it inspects', () => {
    const board = parseLevel(LEVELS[0]);
    const before = JSON.stringify(board);
    canStillFinish(board);
    expect(JSON.stringify(board)).toBe(before);
    expect(RULES.fragileSeconds).toBeGreaterThan(0);
  });
});
