import { directionAngle, reflectOffMirror } from './beam';
import type { Direction, Tile, TileKind } from './types';

/** What a piece does to a beam entering its tile. Turns and splits happen from the tile centre. */
export type Interaction =
  | { type: 'pass' }
  | { type: 'turn'; direction: Direction }
  | { type: 'split'; directions: [Direction, Direction] }
  | { type: 'stop'; end: 'pod' | 'mine' | 'emitter' | 'receiver' | 'absorbed' }
  | { type: 'teleport'; channel: string };

type Behaviour<K extends TileKind> = (tile: Extract<Tile, { kind: K }>, incoming: Direction) => Interaction;

const PASS: Interaction = { type: 'pass' };

/**
 * Every kind of piece and how it treats the beam. New pieces are added here (and drawn in BoardView);
 * the beam tracer itself only knows how to pass, turn, split, stop and teleport.
 */
const BEHAVIOURS: { [K in TileKind]: Behaviour<K> } = {
  empty: () => PASS,
  emitter: () => ({ type: 'stop', end: 'emitter' }),
  receiver: () => ({ type: 'stop', end: 'receiver' }),
  pod: () => ({ type: 'stop', end: 'pod' }),
  mine: () => ({ type: 'stop', end: 'mine' }),
  mirror: (tile, incoming) => ({ type: 'turn', direction: reflectOffMirror(incoming, tile.rotation) }),
  refractor: (tile) => ({ type: 'turn', direction: tile.direction }),
  polarizer: (tile, incoming) => {
    if (incoming % 8 === tile.axis) return PASS;
    if (tile.reflects) return { type: 'turn', direction: reflectOffMirror(incoming, tile.axis * 2) };
    return { type: 'stop', end: 'absorbed' };
  },
  fibre: (tile) => ({ type: 'teleport', channel: tile.channel }),
  splitter: (tile, incoming) => {
    const reflected = reflectOffMirror(incoming, tile.rotation);
    return reflected === incoming ? PASS : { type: 'split', directions: [incoming, reflected] };
  },
  oneWay: (tile, incoming) => {
    const reflected = reflectOffMirror(incoming, tile.rotation);
    if (reflected === incoming || !hitsBrightFace(tile.rotation, incoming)) return PASS;
    return { type: 'turn', direction: reflected };
  },
};

export function interact(tile: Tile, incoming: Direction): Interaction {
  return (BEHAVIOURS[tile.kind] as Behaviour<TileKind>)(tile as never, incoming);
}

/**
 * The bright face of a one-way mirror is the side its normal points to: the plate (rotation m lies at
 * m × 11.25° from vertical) turned a quarter clockwise. A beam hits that face when it travels against the normal.
 */
export function hitsBrightFace(rotation: number, incoming: Direction): boolean {
  const normal = (rotation * Math.PI) / 16 + Math.PI / 2;
  const beam = directionAngle(incoming);
  return Math.cos(beam - normal) < 0;
}
