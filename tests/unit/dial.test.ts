import { describe, expect, it } from 'vitest';
import { rotationTowards, stepsBetween } from '../../src/input/dial';

describe('rotationTowards', () => {
  it('points the plate along the finger: up is vertical, right is horizontal', () => {
    expect(rotationTowards({ x: 0, y: -10 })).toBe(0);
    expect(rotationTowards({ x: 10, y: 0 })).toBe(8);
    expect(rotationTowards({ x: 10, y: -10 })).toBe(4);
  });

  it('treats both ends of the plate alike', () => {
    expect(rotationTowards({ x: 0, y: 10 })).toBe(0);
    expect(rotationTowards({ x: -10, y: 10 })).toBe(rotationTowards({ x: 10, y: -10 }));
  });

  it('snaps to the nearest of the 16 rotations', () => {
    expect(rotationTowards({ x: Math.sin(0.2), y: -Math.cos(0.2) })).toBe(1);
  });
});

describe('stepsBetween', () => {
  it('takes the short way round', () => {
    expect(stepsBetween(2, 5)).toBe(3);
    expect(stepsBetween(1, 14)).toBe(-3);
    expect(stepsBetween(7, 7)).toBe(0);
  });
});
