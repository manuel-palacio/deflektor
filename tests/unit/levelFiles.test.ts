import { describe, expect, it } from 'vitest';
import { levelsFromFiles } from '../../src/engine/levelFiles';
import { LEVELS } from '../../src/engine/levels';
import { TRAINING_LEVELS } from '../../src/engine/training';
import { level } from './helpers';

describe('level files', () => {
  it('orders files naturally by name, so 10 comes after 9', () => {
    const files = { 'x/10.json': level([], {}), 'x/2.json': level([], {}), 'x/1.json': level([], {}) };
    files['x/10.json'].name = 'ten';
    files['x/2.json'].name = 'two';
    files['x/1.json'].name = 'one';
    expect(levelsFromFiles(files).map((entry) => entry.name)).toEqual(['one', 'two', 'ten']);
  });

  it('loads the original levels and the training lessons from levels/*.json', () => {
    expect(LEVELS.map((entry) => entry.id)).toEqual(Array.from({ length: 15 }, (_, i) => `original-${String(i + 1).padStart(2, '0')}`));
    expect(TRAINING_LEVELS.map((entry) => entry.id)).toEqual(['training-1', 'training-2', 'training-3', 'training-4', 'training-5']);
    expect(TRAINING_LEVELS[0].lesson).toContain('mirror');
  });
});
