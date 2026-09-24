import { describe, expect, it } from 'vitest';
import { dailySeed, generateChallenge, MODIFIERS, seededRandom } from '../../src/engine/challenge';
import { solveLevel } from '../../src/engine/solver';
import { validateLevel } from '../../src/engine/validation';

describe('seeded challenges', () => {
  it('generates exactly the same level for the same seed', () => {
    expect(generateChallenge('daily-2026-09-24')).toEqual(generateChallenge('daily-2026-09-24'));
  });

  it('generates different levels for different seeds', () => {
    expect(generateChallenge('daily-2026-09-24').tiles).not.toEqual(generateChallenge('daily-2026-09-25').tiles);
  });

  it('only produces valid, solvable levels with one or two modifiers', () => {
    for (let day = 1; day <= 12; day++) {
      const level = generateChallenge(`test-${day}`);
      expect(validateLevel(level)).toEqual([]);
      expect(() => solveLevel(level)).not.toThrow();
      expect(level.modifiers.length).toBeGreaterThanOrEqual(1);
      expect(level.modifiers.length).toBeLessThanOrEqual(2);
      if (level.modifiers.includes('timed')) expect(level.timeLimitSeconds).toBeGreaterThan(0);
    }
  });

  it('uses every kind of modifier across a range of seeds', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, day) => generateChallenge(`spread-${day}`).modifiers).flat());
    expect([...seen].sort()).toEqual([...MODIFIERS].sort());
  });

  it('names the daily seed after the UTC date', () => {
    expect(dailySeed(new Date('2026-09-24T23:30:00Z'))).toBe('daily-2026-09-24');
  });

  it('has a random source that repeats for a seed', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
