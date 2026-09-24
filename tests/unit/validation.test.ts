import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/engine/levels';
import { TRAINING_LEVELS } from '../../src/engine/training';
import { formatDiagnostic, validateLevel } from '../../src/engine/validation';
import { level } from './helpers';

describe('validateLevel', () => {
  it('accepts every shipped level', () => {
    for (const shipped of [...LEVELS, ...TRAINING_LEVELS]) expect(validateLevel(shipped)).toEqual([]);
  });

  it('pinpoints an unknown tile by row and column', () => {
    const [problem] = validateLevel(level(['E..?R']));
    expect(problem).toMatchObject({ layer: 'tiles', row: 1, column: 4, message: "unknown tile '?'" });
    expect(formatDiagnostic(problem)).toBe(`Level "test": unknown tile '?' (tiles row 1, col 4)`);
  });

  it('names the row that has the wrong length', () => {
    const broken = level(['E...R']);
    broken.tiles[3] = '....';
    expect(validateLevel(broken)).toContainEqual(expect.objectContaining({ layer: 'tiles', row: 4, message: expect.stringContaining('15 characters (got 4)') }));
  });

  it('lists where the extra lasers are', () => {
    const [problem] = validateLevel(level(['E.E.R']));
    expect(problem.message).toBe('needs exactly one laser \'E\' (found 2: row 1 col 1, row 1 col 3)');
  });

  it('reports every problem at once instead of stopping at the first', () => {
    const problems = validateLevel({ ...level(['E?..?']), emitter: 'sideways' as never, energySeconds: 0 });
    expect(problems.map((problem) => problem.message)).toEqual([
      'emitter direction must be up, right, down or left (got "sideways")',
      'energySeconds must be a positive number (got 0)',
      "unknown tile '?'",
      "unknown tile '?'",
      "needs exactly one receiver 'R' (found 0)",
    ]);
  });

  it('checks the wall layer too', () => {
    expect(validateLevel(level(['E...R'], { walls: ['..x'] }))).toContainEqual(
      expect.objectContaining({ layer: 'walls', row: 1, column: 3, message: "unknown wall 'x'" }),
    );
  });

  it('flags an unpaired fibre end', () => {
    expect(validateLevel(level(['E.T.R']))[0]).toMatchObject({ row: 1, column: 3, message: expect.stringContaining("fibre 'T'") });
  });
});
