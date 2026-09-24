import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/engine/level';
import { LEVELS } from '../../src/engine/levels';
import { clickDistance, computePar, rateStars } from '../../src/engine/scoring';
import { nextHint } from '../../src/engine/solver';
import { TRAINING_LEVELS } from '../../src/engine/training';

const par = { rotations: 10, seconds: 30 };
const perfect = { rotations: 8, seconds: 20, restarts: 0, hintsUsed: 0 };

describe('rateStars', () => {
  it('awards three stars within both limits, unaided', () => {
    expect(rateStars(perfect, par)).toBe(3);
  });

  it('drops to two stars when slow, restarted or helped by a hint, but within the rotation limit', () => {
    expect(rateStars({ ...perfect, seconds: 31 }, par)).toBe(2);
    expect(rateStars({ ...perfect, restarts: 1 }, par)).toBe(2);
    expect(rateStars({ ...perfect, hintsUsed: 1 }, par)).toBe(2);
  });

  it('gives one star for any solve over the rotation limit', () => {
    expect(rateStars({ ...perfect, rotations: 11 }, par)).toBe(1);
  });
});

describe('computePar', () => {
  it('turns the solver solution into click and time targets', () => {
    const first = computePar(TRAINING_LEVELS[0]);
    // Mirror starts at 8; the cell above needs 4 (4 clicks), the receiver below needs 12 (8 more, the short way: 8).
    expect(first.rotations).toBeGreaterThanOrEqual(8);
    expect(first.seconds).toBeGreaterThan(10);
  });

  it('is deterministic and defined for every original level', () => {
    for (const level of LEVELS) {
      const a = computePar(level);
      expect(computePar(level)).toEqual(a);
      expect(a.rotations).toBeGreaterThan(0);
    }
  });

  it('measures the shorter way round the dial', () => {
    expect(clickDistance(15, 1)).toBe(2);
    expect(clickDistance(2, 10)).toBe(8);
  });
});

describe('nextHint', () => {
  it('names a mirror to turn and where to, from the current board', () => {
    const board = parseLevel(TRAINING_LEVELS[0]);
    const hint = nextHint(board)!;
    expect(hint.tile).toEqual({ x: 7, y: 4 });
    expect(hint.rotation).not.toBe(8);
  });
});
