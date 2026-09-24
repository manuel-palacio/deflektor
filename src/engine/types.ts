export const BOARD_COLS = 15;
export const BOARD_ROWS = 9;
/** Walls are laid out on a grid of quarter tiles (8px bricks in the original). */
export const WALL_COLS = BOARD_COLS * 2;
export const WALL_ROWS = BOARD_ROWS * 2;
export const DIRECTION_COUNT = 16;

/** Direction index 0..15: 0 = up, increasing clockwise. */
export type Direction = number;

export type Cardinal = 'up' | 'right' | 'down' | 'left';

export const CARDINAL_DIRECTION: Record<Cardinal, Direction> = {
  up: 0,
  right: 4,
  down: 8,
  left: 12,
};

export interface Point {
  x: number;
  y: number;
}

export type Tile =
  | { kind: 'empty' }
  | { kind: 'emitter'; direction: Direction }
  | { kind: 'receiver' }
  | {
      kind: 'mirror';
      rotation: number;
      auto: boolean;
      /** Challenge: how many more times the player may turn it (unlimited when absent). */
      turnsLeft?: number;
      /** Challenge: shatters once the beam has bounced off it for long enough. */
      fragile?: boolean;
      /** Seconds the beam has spent reflecting off a fragile mirror. */
      stress?: number;
    }
  | {
      kind: 'pod';
      /** Challenge: a moving target that patrols along a row or column. */
      moves?: 'horizontal' | 'vertical';
      heading?: 1 | -1;
    }
  /** Half-silvered: the beam both passes straight through and reflects as off a mirror. */
  | { kind: 'splitter'; rotation: number }
  /** Reflects beams arriving on its bright face; beams from behind pass through. The player can turn it. */
  | { kind: 'oneWay'; rotation: number }
  | { kind: 'mine' }
  | { kind: 'refractor'; direction: Direction }
  /** Rotates by itself; lets the beam through only along its axis (0..7), otherwise absorbs or reflects. */
  | { kind: 'polarizer'; axis: number; reflects: boolean }
  | { kind: 'fibre'; channel: string };

export type TileKind = Tile['kind'];

/** A gate is a reflecting wall that disappears once the receiver opens. */
export type WallKind = 'none' | 'absorb' | 'reflect' | 'gate';

export interface Board {
  tiles: Tile[][];
  walls: WallKind[][];
}

export interface LevelDefinition {
  /** Stable identifier, e.g. "original-03"; optional for levels built in code. */
  id?: string;
  name: string;
  /** Where the layout comes from (credit); informational only. */
  source?: string;
  /** 15 x 9 tile characters. */
  tiles: string[];
  /** 30 x 18 quarter-tile wall characters; optional when the level has no walls. */
  walls?: string[];
  emitter: Cardinal;
  energySeconds: number;
  /** Pieces that need parameters (challenge entities); each replaces the tile at its position. */
  pieces?: PieceSpec[];
  /** Challenge: the level must be finished within this many seconds of firing. */
  timeLimitSeconds?: number;
}

export type PieceType = 'mirror' | 'pod' | 'splitter' | 'oneWay';

/** A parameterised piece in a level file, placed at tile (x, y), 0-based. */
export interface PieceSpec {
  x: number;
  y: number;
  type: PieceType;
  rotation?: number;
  /** Mirrors: limited number of turns. */
  turns?: number;
  /** Mirrors: shatter after sustained reflection. */
  fragile?: boolean;
  /** Pods: patrol along this axis. */
  moves?: 'horizontal' | 'vertical';
}

export type BeamEnd =
  | { kind: 'pod'; tile: Point }
  | { kind: 'mine'; tile: Point }
  | { kind: 'receiver'; tile: Point }
  | { kind: 'emitter'; tile: Point }
  | { kind: 'absorbed' }
  | { kind: 'stopped'; tile: Point; direction: Direction }
  | { kind: 'loop' }
  | { kind: 'edge' };

export interface BeamTrace {
  /** Points the beam passes through (quarter-tile units); each branch or teleport starts a new path. */
  paths: Point[][];
  /** Where the main beam ends (the first branch). */
  end: BeamEnd;
  /** Where every branch ends; splitters create more than one. */
  ends: BeamEnd[];
  /** The point where each branch in `ends` stops, in beam coordinates. */
  endPoints: Point[];
  /** Tiles the beam was turned at (mirrors, refractors, splitters…), for fragile mirrors. */
  turned: Point[];
}
