import { describe, expect, it } from 'vitest';
import { traceBeam } from '../../src/engine/beam';
import { dailySeed, generateChallenge } from '../../src/engine/challenge';
import { parseLevel } from '../../src/engine/level';
import { LEVELS } from '../../src/engine/levels';
import { solveLevel } from '../../src/engine/solver';
import { TRAINING_LEVELS } from '../../src/engine/training';
import type { LevelDefinition, Tile } from '../../src/engine/types';

/** A year of daily challenges from a fixed start date. */
const DAILY_SEEDS = Array.from({ length: 365 }, (_, day) => dailySeed(new Date(Date.UTC(2026, 8, 24 + day))));

/** A piece the player can actually turn (a limited mirror with no turns left does not count). */
function isPlayerTurnable(tile: Tile): boolean {
  return tile.kind === 'oneWay' || (tile.kind === 'mirror' && !tile.auto && tile.turnsLeft !== 0);
}

/** Problems that would leave a player with nothing useful to do. */
function stuckReasons(level: LevelDefinition): string[] {
  const reasons: string[] = [];
  const board = parseLevel(level);
  if (!board.tiles.flat().some(isPlayerTurnable)) reasons.push('nothing for the player to turn');
  try {
    solveLevel(level);
  } catch (error) {
    reasons.push(`not finishable: ${(error as Error).message}`);
  }
  const opening = traceBeam(board);
  const dangerous = opening.ends.some((end) => end.kind === 'mine' || end.kind === 'emitter');
  if (dangerous) {
    const beforeHazard = traceBeam(board, { stopAt: (tile) => isPlayerTurnable(board.tiles[tile.y][tile.x]) });
    if (!beforeHazard.ends.some((end) => end.kind === 'stopped')) {
      reasons.push('the opening beam overloads the laser and no player mirror can redirect it');
    }
  }
  return reasons;
}

describe('no level leaves the player stuck', () => {
  it.each([...LEVELS, ...TRAINING_LEVELS].map((level) => [level.name, level] as const))('%s', (_, level) => {
    expect(stuckReasons(level)).toEqual([]);
  });

  it('a whole year of daily challenges can be generated and played', () => {
    const problems = DAILY_SEEDS.flatMap((seed) => {
      try {
        return stuckReasons(generateChallenge(seed)).map((reason) => `${seed}: ${reason}`);
      } catch (error) {
        return [`${seed}: ${(error as Error).message}`];
      }
    });
    expect(problems).toEqual([]);
  }, 300_000);
});
