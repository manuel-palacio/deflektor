import { describe, expect, it } from 'vitest';
import { traceBeam } from '../../src/engine/beam';
import { parseLevel } from '../../src/engine/level';
import { TRAINING_LEVELS } from '../../src/engine/training';
import { solveLevel } from '../../src/engine/solver';

describe('training levels', () => {
  it('has five lessons, each with a one-line hint', () => {
    expect(TRAINING_LEVELS).toHaveLength(5);
    for (const level of TRAINING_LEVELS) expect(level.lesson.length).toBeGreaterThan(10);
  });

  describe.each(TRAINING_LEVELS.map((level) => [level.name, level] as const))('%s', (_, level) => {
    it('is solvable', () => {
      expect(solveLevel(level).length).toBeGreaterThan(1);
    });

    it('is not already solved when it starts', () => {
      const end = traceBeam(parseLevel(level)).end.kind;
      expect(end).not.toBe('pod');
    });
  });
});

describe('every lesson gives the player something to do', () => {
  it.each(TRAINING_LEVELS.map((level) => [level.name, level] as const))('%s has a mirror to turn', (_, level) => {
    const board = parseLevel(level);
    const turnable = board.tiles.flat().filter((tile) => tile.kind === 'oneWay' || (tile.kind === 'mirror' && !tile.auto));
    expect(turnable.length).toBeGreaterThan(0);
  });
});
