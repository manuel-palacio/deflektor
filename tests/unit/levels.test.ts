import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/engine/level';
import { LEVELS } from '../../src/engine/levels';
import { solveLevel } from '../../src/engine/solver';

describe('campaign levels', () => {
  it('loads the first fifteen original levels', () => {
    expect(LEVELS).toHaveLength(15);
  });

  describe.each(LEVELS.map((level, index) => [index + 1, level] as const))('level %i', (_, level) => {
    it('parses', () => {
      expect(() => parseLevel(level)).not.toThrow();
    });

    it('is solvable', () => {
      expect(solveLevel(level).at(-1)!.target).toBeDefined();
    });
  });
});
