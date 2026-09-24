import { describe, expect, it } from 'vitest';
import { QualityGovernor } from '../../src/render/quality';

function run(governor: QualityGovernor, framesPerSecond: number, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / framesPerSecond) governor.sample(1 / framesPerSecond);
  return governor.level;
}

describe('QualityGovernor', () => {
  it('keeps full effects on a device that holds 60 fps', () => {
    expect(run(new QualityGovernor(), 60, 20)).toBe('high');
  });

  it('switches to light effects when the frame rate stays low', () => {
    expect(run(new QualityGovernor(), 30, 8)).toBe('low');
  });

  it('ignores slow frames while the game is warming up', () => {
    const governor = new QualityGovernor();
    run(governor, 20, 2.5);
    expect(run(governor, 60, 10)).toBe('high');
  });

  it('stays light once degraded, and obeys an explicit choice', () => {
    const governor = new QualityGovernor();
    run(governor, 30, 8);
    expect(run(governor, 60, 10)).toBe('low');
    governor.setPreference('high');
    expect(governor.level).toBe('high');
    expect(run(new QualityGovernor('low'), 60, 5)).toBe('low');
  });
});
