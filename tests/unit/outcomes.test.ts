import { describe, expect, it } from 'vitest';
import { explainFailure, formatSeconds, starText, summarizeLevel } from '../../src/app/outcomes';

describe('summarizeLevel', () => {
  const stats = { rotations: 12, seconds: 41.4, podsDestroyed: 5 };
  const par = { rotations: 15, seconds: 45 };

  it('breaks the score down into cells and energy bonus and compares against par', () => {
    const summary = summarizeLevel(stats, 820, par, 3, { score: false, time: false, stars: false });
    expect(summary.lines).toEqual([
      { label: 'Cells', value: '+500' },
      { label: 'Energy bonus', value: '+820' },
      { label: 'Level score', value: '1,320', record: false },
      { label: 'Time', value: '0:41 / par 0:45', record: false },
      { label: 'Turns', value: '12 / par 15' },
    ]);
    expect(summary.recordNote).toBeUndefined();
  });

  it('calls out new personal bests', () => {
    const summary = summarizeLevel(stats, 820, par, 2, { score: true, time: true, stars: false });
    expect(summary.recordNote).toBe('New best score, time!');
    expect(summary.lines.filter((line) => line.record).map((line) => line.label)).toEqual(['Level score', 'Time']);
  });
});

describe('explainFailure', () => {
  it('gives each way of failing its own title, explanation and advice', () => {
    const titles = (['mine', 'feedback', 'energy'] as const).map((reason) => explainFailure(reason).title);
    expect(titles).toEqual(['Mine overload', 'Feedback overload', 'Out of energy']);
    expect(explainFailure('feedback').explanation).toContain('back into the laser');
    expect(explainFailure('energy').advice.length).toBeGreaterThan(10);
  });
});

describe('formatting', () => {
  it('shows stars and times compactly', () => {
    expect(starText(2)).toBe('★★☆');
    expect(formatSeconds(125.4)).toBe('2:05');
  });
});
