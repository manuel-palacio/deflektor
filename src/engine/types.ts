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
  | { kind: 'mirror'; rotation: number; auto: boolean }
  | { kind: 'pod' }
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
  name: string;
  /** 15 x 9 tile characters. */
  tiles: string[];
  /** 30 x 18 quarter-tile wall characters; optional when the level has no walls. */
  walls?: string[];
  emitter: Cardinal;
  energySeconds: number;
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
  /** Lattice points (half-tile units) the beam passes through, in order. Breaks start a new path. */
  paths: Point[][];
  end: BeamEnd;
}
