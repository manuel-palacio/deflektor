import { format, formatSeconds, starText } from './outcomes';

/** A finished challenge, as it travels in a share code. */
export interface SharedResult {
  seed: string;
  score: number;
  seconds: number;
  stars: 1 | 2 | 3;
}

/** A link that opens the given challenge seed. */
export function challengeLink(origin: string, seed: string): string {
  return `${origin}/?challenge=${encodeURIComponent(seed)}`;
}

/** A compact, URL-safe code for a result, so it can be pasted and verified by others. */
export function encodeResult(result: SharedResult): string {
  const json = JSON.stringify([result.seed, Math.round(result.score), Math.round(result.seconds * 10), result.stars]);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reads a result code back; returns undefined for anything that is not a valid code. */
export function decodeResult(code: string): SharedResult | undefined {
  try {
    const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const [seed, score, tenths, stars] = JSON.parse(decodeURIComponent(escape(atob(base64))));
    const valid = typeof seed === 'string' && Number.isFinite(score) && Number.isFinite(tenths) && [1, 2, 3].includes(stars);
    return valid ? { seed, score, seconds: tenths / 10, stars } : undefined;
  } catch {
    return undefined;
  }
}

/** The text copied by the Share button. */
export function shareText(result: SharedResult, origin: string): string {
  const name = result.seed.startsWith('daily-') ? `Deflektor daily ${result.seed.slice(6)}` : `Deflektor challenge "${result.seed}"`;
  return `${name}: ${starText(result.stars)} ${format(result.score)} in ${formatSeconds(result.seconds)}. Beat it: ${challengeLink(origin, result.seed)}&result=${encodeResult(result)}`;
}
