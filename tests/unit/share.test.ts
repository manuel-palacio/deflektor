import { describe, expect, it } from 'vitest';
import { challengeLink, decodeResult, encodeResult, shareText } from '../../src/app/share';

const result = { seed: 'daily-2026-09-24', score: 1320, seconds: 41.4, stars: 2 as const };

describe('share codes', () => {
  it('round-trips a result through a URL-safe code', () => {
    const code = encodeResult(result);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeResult(code)).toEqual(result);
  });

  it('rejects codes that are garbled or tampered with', () => {
    expect(decodeResult('not a code!')).toBeUndefined();
    expect(decodeResult(encodeResult({ ...result, stars: 5 as never }))).toBeUndefined();
  });

  it('links to the challenge by seed', () => {
    expect(challengeLink('https://deflektor.fly.dev', 'my seed')).toBe('https://deflektor.fly.dev/?challenge=my%20seed');
  });

  it('writes a friendly share line with stars, score, time and a link', () => {
    expect(shareText(result, 'https://x.dev')).toMatch(
      /^Deflektor daily 2026-09-24: ★★☆ 1,320 in 0:41\. Beat it: https:\/\/x\.dev\/\?challenge=daily-2026-09-24&result=/,
    );
  });
});
