import { describe, expect, it } from 'vitest';
import { mirrorPlateRotation, nearestPlateAngle } from '../../src/render/mirrorAngle';

describe('mirrorPlateRotation', () => {
  it('draws rotation 0 as a vertical plate', () => {
    expect(Math.abs(Math.sin(mirrorPlateRotation(0)))).toBeCloseTo(1);
  });

  it('draws rotation 4 as a "/" plate (up-right diagonal)', () => {
    expect(mirrorPlateRotation(4)).toBeCloseTo(-Math.PI / 4);
  });

  it('draws rotation 8 as a horizontal plate', () => {
    expect(Math.sin(mirrorPlateRotation(8))).toBeCloseTo(0);
  });

  it('turns the plate the same way for every step so animation never jumps', () => {
    for (let rotation = 0; rotation < 15; rotation++) {
      const step = mirrorPlateRotation(rotation + 1) - mirrorPlateRotation(rotation);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(Math.PI / 4);
    }
  });
});

describe('nearestPlateAngle', () => {
  it('chooses the half-turn equivalent closest to the current angle', () => {
    expect(nearestPlateAngle(3, 0)).toBeCloseTo(Math.PI);
    expect(nearestPlateAngle(-0.1, 0.2)).toBeCloseTo(0.2);
  });
});
