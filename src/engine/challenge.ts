import { traceBeam } from './beam';
import { parseLevel } from './level';
import { computePar } from './scoring';
import { solveLevel } from './solver';
import { BOARD_COLS, BOARD_ROWS, type Cardinal, type LevelDefinition, type PieceSpec, type Point } from './types';
import { validateLevel } from './validation';

export type Modifier = 'splitter' | 'oneWay' | 'limitedTurns' | 'fragile' | 'movingTarget' | 'timed';

export const MODIFIERS: readonly Modifier[] = ['splitter', 'oneWay', 'limitedTurns', 'fragile', 'movingTarget', 'timed'];

export const MODIFIER_LABEL: Record<Modifier, string> = {
  splitter: 'Beam splitter',
  oneWay: 'One-way mirror',
  limitedTurns: 'Limited turns',
  fragile: 'Fragile mirror',
  movingTarget: 'Moving target',
  timed: 'Against the clock',
};

export interface ChallengeLevel extends LevelDefinition {
  seed: string;
  modifiers: Modifier[];
}

const MAX_ATTEMPTS = 200;

/** A small, fast, seedable random source (mulberry32). */
export function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed of the daily challenge for a date (the same everywhere, by UTC day). */
export function dailySeed(date: Date): string {
  return `daily-${date.toISOString().slice(0, 10)}`;
}

/**
 * Builds a solvable challenge level from a seed. The same seed always gives the same level:
 * layouts are drawn from a seeded random source, and a layout is kept only if it is valid, does not
 * start already solved or on a mine, and the solver can finish it; otherwise the next attempt is drawn.
 */
export function generateChallenge(seed: string): ChallengeLevel {
  const random = seededRandom(seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = drawLayout(seed, random);
    if (isPlayable(candidate)) return finish(candidate);
  }
  throw new Error(`No playable challenge found for seed "${seed}"`);
}

function drawLayout(seed: string, random: () => number): ChallengeLevel {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  const tiles = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => '.'));
  const free = () => {
    for (;;) {
      const tile = { x: between(1, BOARD_COLS - 2), y: between(1, BOARD_ROWS - 2) };
      if (tiles[tile.y][tile.x] === '.') return tile;
    }
  };
  const put = (tile: Point, char: string) => (tiles[tile.y][tile.x] = char);

  const emitter: Cardinal = pick(['right', 'left', 'down', 'up'] as const);
  put(edgeTile(emitter, between(1, emitter === 'right' || emitter === 'left' ? BOARD_ROWS - 2 : BOARD_COLS - 2)), 'E');
  put(free(), 'R');
  const mirrors = Array.from({ length: between(5, 8) }, () => {
    const tile = free();
    put(tile, between(0, 15).toString(16));
    return tile;
  });
  const pods = Array.from({ length: between(3, 6) }, () => {
    const tile = free();
    put(tile, 'o');
    return tile;
  });
  for (let mine = between(1, 3); mine > 0; mine--) put(free(), 'x');
  for (let wall = between(2, 5); wall > 0; wall--) put(free(), random() < 0.8 ? '#' : '=');

  const modifiers = [...MODIFIERS].sort(() => random() - 0.5).slice(0, between(1, 2));
  const pieces: PieceSpec[] = [];
  for (const modifier of modifiers) {
    if (modifier === 'splitter') pieces.push({ ...free(), type: 'splitter', rotation: pick([2, 4, 6, 10, 12, 14]) });
    if (modifier === 'oneWay') pieces.push({ ...mirrors[0], type: 'oneWay', rotation: between(0, 15) });
    if (modifier === 'limitedTurns') pieces.push({ ...mirrors[1], type: 'mirror', rotation: between(0, 15), turns: 10 });
    if (modifier === 'fragile') pieces.push({ ...mirrors[2], type: 'mirror', rotation: between(0, 15), fragile: true });
    if (modifier === 'movingTarget') pieces.push({ ...pods[0], type: 'pod', moves: pick(['horizontal', 'vertical'] as const) });
  }
  for (const piece of pieces) put(piece, '.');
  return {
    id: seed,
    seed,
    name: 'Challenge',
    emitter,
    energySeconds: 120,
    tiles: tiles.map((row) => row.join('')),
    pieces,
    modifiers,
  };
}

function edgeTile(direction: Cardinal, offset: number): Point {
  switch (direction) {
    case 'right':
      return { x: 0, y: offset };
    case 'left':
      return { x: BOARD_COLS - 1, y: offset };
    case 'down':
      return { x: offset, y: 0 };
    case 'up':
      return { x: offset, y: BOARD_ROWS - 1 };
  }
}

function isPlayable(level: ChallengeLevel): boolean {
  if (validateLevel(level).length > 0) return false;
  const opening = traceBeam(parseLevel(level)).ends.map((end) => end.kind);
  if (opening.some((kind) => kind === 'pod' || kind === 'mine' || kind === 'emitter')) return false;
  try {
    solveLevel(level);
    return true;
  } catch {
    return false;
  }
}

/** Timed challenges get a clock of twice the par time, so the limit is tight but fair. */
function finish(level: ChallengeLevel): ChallengeLevel {
  if (!level.modifiers.includes('timed')) return level;
  return { ...level, timeLimitSeconds: computePar(level).seconds * 2 };
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
