import { findTiles, tileAt } from './level';
import {
  DIRECTION_COUNT,
  WALL_COLS,
  WALL_ROWS,
  type BeamEnd,
  type BeamTrace,
  type Board,
  type Direction,
  type Point,
  type Tile,
  type WallKind,
} from './types';

/*
 * Geometry: beam coordinates are in quarter-tile units from the board's top-left corner, so wall brick
 * (qx, qy) covers [qx, qx + 1) x [qy, qy + 1) and tile (x, y) is centred on (2x + 1, 2y + 1).
 * Like the original's pixel-stepping beam, a ray lying exactly on a grid line belongs to the cell to its
 * right / below it, and a ray passing exactly through a grid corner does not touch the side cells.
 */

const MAX_CROSSINGS = 6000;
/** Objects only react when the beam crosses the middle of their tile, not when it clips a corner. */
const OBJECT_CORE_HALF_SIZE = 0.5;
const TIE = 1e-9;

export type StopPredicate = (tile: Point) => boolean;

export interface TraceOptions {
  /** Halt as the beam enters any tile this accepts (used by the solver). */
  stopAt?: StopPredicate;
  /** Start from this tile's centre instead of the emitter (used by the solver). */
  from?: { tile: Point; direction: Direction };
}

export function wrapDirection(direction: number): Direction {
  return ((direction % DIRECTION_COUNT) + DIRECTION_COUNT) % DIRECTION_COUNT;
}

/**
 * Beam travel per direction, as in the original: steps of (0, 1), (1, 2), (1, 1), (2, 1)… rather than
 * exact 22.5° angles (a diagonal leaving a mirror measures ~1:2 in the C64 screenshots). The values are
 * exact binary fractions, so grid-line ties are exact too.
 */
const DIRECTION_VECTORS: readonly Point[] = [
  { x: 0, y: -2 }, { x: 1, y: -2 }, { x: 2, y: -2 }, { x: 2, y: -1 },
  { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 },
  { x: 0, y: 2 }, { x: -1, y: 2 }, { x: -2, y: 2 }, { x: -2, y: 1 },
  { x: -2, y: 0 }, { x: -2, y: -1 }, { x: -2, y: -2 }, { x: -1, y: -2 },
];

export function directionVector(direction: Direction): Point {
  return DIRECTION_VECTORS[wrapDirection(direction)];
}

/** Angle in radians (0 = up, clockwise) that a direction's step actually points at. */
export function directionAngle(direction: Direction): number {
  const vector = directionVector(direction);
  return Math.atan2(vector.x, -vector.y);
}

export function reflectOffMirror(direction: Direction, rotation: number): Direction {
  return wrapDirection(rotation - direction);
}

export function oppositeDirection(direction: Direction): Direction {
  return wrapDirection(direction + DIRECTION_COUNT / 2);
}

export function tileCenter(tile: Point): Point {
  return { x: tile.x * 2 + 1, y: tile.y * 2 + 1 };
}

/** Follows the laser from the emitter until something absorbs it. */
export function traceBeam(board: Board, options: TraceOptions = {}): BeamTrace {
  return new BeamTracer(board, options).run();
}

interface Crossing {
  point: Point;
  crossesX: boolean;
  crossesY: boolean;
  cell: Point;
}

class BeamTracer {
  private readonly paths: Point[][] = [];
  private readonly visited = new Set<string>();
  private position: Point;
  private direction: Direction;
  private currentTile: Point;

  private readonly stopAt?: StopPredicate;

  constructor(
    private readonly board: Board,
    options: TraceOptions,
  ) {
    this.stopAt = options.stopAt;
    const start = options.from ?? emitterStart(board);
    this.currentTile = start.tile;
    this.position = tileCenter(start.tile);
    this.direction = start.direction;
    this.paths.push([this.position]);
  }

  run(): BeamTrace {
    for (let crossing = 0; crossing < MAX_CROSSINGS; crossing++) {
      const end = this.advanceToNextCell();
      if (end) return { paths: this.paths, end };
    }
    return { paths: this.paths, end: { kind: 'loop' } };
  }

  private advanceToNextCell(): BeamEnd | null {
    const crossing = this.nextCrossing();
    const { cell } = crossing;
    if (cell.x < 0 || cell.y < 0 || cell.x >= WALL_COLS || cell.y >= WALL_ROWS) {
      this.moveTo(crossing.point);
      return { kind: 'edge' };
    }
    const wall = this.blockingWall(crossing);
    if (wall !== 'none') return this.hitWall(crossing, wall);
    this.position = crossing.point;
    const tile = { x: Math.floor(cell.x / 2), y: Math.floor(cell.y / 2) };
    if (tile.x === this.currentTile.x && tile.y === this.currentTile.y) return null;
    this.currentTile = tile;
    if (!rayCrossesCore(this.position, directionVector(this.direction), tileCenter(tile))) return null;
    return this.enterTile(tile);
  }

  /** A ray running exactly along a brick seam slips through unless the bricks on both sides are solid. */
  private blockingWall(crossing: Crossing): WallKind {
    const { cell, point } = crossing;
    const vector = directionVector(this.direction);
    const wall = this.wallAt(cell.x, cell.y);
    if (vector.x === 0 && Number.isInteger(point.x)) return solidPair(wall, this.wallAt(cell.x - 1, cell.y));
    if (vector.y === 0 && Number.isInteger(point.y)) return solidPair(wall, this.wallAt(cell.x, cell.y - 1));
    return wall;
  }

  private nextCrossing(): Crossing {
    const vector = directionVector(this.direction);
    const toX = distanceToLine(this.position.x, vector.x);
    const toY = distanceToLine(this.position.y, vector.y);
    const t = Math.min(toX, toY);
    const crossesX = toX - t < TIE;
    const crossesY = toY - t < TIE;
    const point = {
      x: crossesX ? Math.round(this.position.x + vector.x * t) : this.position.x + vector.x * t,
      y: crossesY ? Math.round(this.position.y + vector.y * t) : this.position.y + vector.y * t,
    };
    const cell = {
      x: crossesX ? (vector.x > 0 ? point.x : point.x - 1) : Math.floor(point.x),
      y: crossesY ? (vector.y > 0 ? point.y : point.y - 1) : Math.floor(point.y),
    };
    return { point, crossesX, crossesY, cell };
  }

  private hitWall(crossing: Crossing, wall: WallKind): BeamEnd | null {
    this.moveTo(crossing.point);
    if (wall === 'absorb') return { kind: 'absorbed' };
    const vector = directionVector(this.direction);
    let flipX = crossing.crossesX;
    let flipY = crossing.crossesY;
    if (flipX && flipY) {
      // At a corner a flat wall face flips only the axis it faces, and a lone brick corner deflects the
      // beam sideways (the original steps horizontally first); only a concave corner sends it straight back.
      const sideways = this.isSolid(crossing.cell.x, crossing.cell.y - Math.sign(vector.y));
      const vertical = this.isSolid(crossing.cell.x - Math.sign(vector.x), crossing.cell.y);
      if (!sideways && !vertical) flipY = false;
      else if (sideways !== vertical) {
        flipX = sideways;
        flipY = vertical;
      }
    }
    this.direction = flipDirection(this.direction, flipX, flipY);
    return this.recordState(`${crossing.point.x},${crossing.point.y}`);
  }

  private enterTile(tilePosition: Point): BeamEnd | null {
    if (this.stopAt?.(tilePosition)) {
      return { kind: 'stopped', tile: tilePosition, direction: this.direction };
    }
    const tile = tileAt(this.board, tilePosition)!;
    switch (tile.kind) {
      case 'mirror':
        return this.turnAtCenter(tilePosition, reflectOffMirror(this.direction, tile.rotation));
      case 'refractor':
        return this.turnAtCenter(tilePosition, tile.direction);
      case 'polarizer':
        return this.passPolarizer(tilePosition, tile);
      case 'fibre':
        return this.teleportFrom(tilePosition, tile.channel);
      case 'pod':
      case 'mine':
      case 'emitter':
      case 'receiver':
        this.addPoint(this.position);
        return { kind: tile.kind, tile: tilePosition };
      default:
        return null;
    }
  }

  private passPolarizer(tilePosition: Point, tile: Extract<Tile, { kind: 'polarizer' }>): BeamEnd | null {
    if (this.direction % 8 === tile.axis) return null;
    if (tile.reflects) return this.turnAtCenter(tilePosition, reflectOffMirror(this.direction, tile.axis * 2));
    this.addPoint(this.position);
    return { kind: 'absorbed' };
  }

  /** Mirrors, refractors and reflecting polarisers send the beam on from their centre. */
  private turnAtCenter(tilePosition: Point, direction: Direction): BeamEnd | null {
    this.moveTo(tileCenter(tilePosition));
    this.direction = direction;
    return this.recordState(`${tilePosition.x},${tilePosition.y}`);
  }

  private teleportFrom(entry: Point, channel: string): BeamEnd | null {
    const exit = findTiles(this.board, 'fibre').find((point) => {
      const tile = tileAt(this.board, point);
      return tile?.kind === 'fibre' && tile.channel === channel && (point.x !== entry.x || point.y !== entry.y);
    })!;
    this.moveTo(tileCenter(entry));
    this.position = tileCenter(exit);
    this.currentTile = exit;
    this.paths.push([this.position]);
    return this.recordState(`${exit.x},${exit.y}`);
  }

  /** Refractors break reflection's reversibility, so the beam can get trapped in a cycle. */
  private recordState(place: string): BeamEnd | null {
    const key = `${place},${this.direction}`;
    if (this.visited.has(key)) return { kind: 'loop' };
    this.visited.add(key);
    return null;
  }

  private isSolid(column: number, row: number): boolean {
    return this.wallAt(column, row) !== 'none';
  }

  private wallAt(column: number, row: number): WallKind {
    return this.board.walls[row]?.[column] ?? 'none';
  }

  private moveTo(point: Point): void {
    this.position = point;
    this.addPoint(point);
  }

  private addPoint(point: Point): void {
    const path = this.paths[this.paths.length - 1];
    const last = path[path.length - 1];
    if (last.x !== point.x || last.y !== point.y) path.push(point);
  }
}

function emitterStart(board: Board): { tile: Point; direction: Direction } {
  const emitter = findTiles(board, 'emitter')[0];
  const tile = tileAt(board, emitter);
  if (tile?.kind !== 'emitter') throw new Error('Board has no emitter');
  return { tile: emitter, direction: tile.direction };
}

/** Beam time until the coordinate reaches the next integer grid line in the direction of travel. */
function distanceToLine(coordinate: number, speed: number): number {
  if (speed === 0) return Infinity;
  const line = speed > 0 ? Math.floor(coordinate + TIE) + 1 : Math.ceil(coordinate - TIE) - 1;
  return (line - coordinate) / speed;
}

function flipDirection(direction: Direction, flipX: boolean, flipY: boolean): Direction {
  // Mirroring the x component maps angle a to -a; mirroring y maps a to 180° - a.
  let flipped = direction;
  if (flipX) flipped = wrapDirection(-flipped);
  if (flipY) flipped = wrapDirection(DIRECTION_COUNT / 2 - flipped);
  return flipped;
}

/** Whether the ray passes through the central half (8 x 8 pixels) of the tile centred on `center`. */
function rayCrossesCore(origin: Point, vector: Point, center: Point): boolean {
  let enter = 0;
  let exit = Infinity;
  for (const axis of ['x', 'y'] as const) {
    const min = center[axis] - OBJECT_CORE_HALF_SIZE;
    const max = center[axis] + OBJECT_CORE_HALF_SIZE;
    if (vector[axis] === 0) {
      if (origin[axis] < min || origin[axis] > max) return false;
      continue;
    }
    const [near, far] = [(min - origin[axis]) / vector[axis], (max - origin[axis]) / vector[axis]].sort((a, b) => a - b);
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
  }
  return enter <= exit;
}

function solidPair(first: WallKind, second: WallKind): WallKind {
  if (first === 'none' || second === 'none') return 'none';
  return first === 'absorb' || second === 'absorb' ? 'absorb' : first;
}
