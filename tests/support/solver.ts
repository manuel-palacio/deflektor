import { oppositeDirection, reflectOffMirror, traceBeam } from '../../src/engine/beam';
import { findTiles, parseLevel } from '../../src/engine/level';
import type { BeamEnd, Board, LevelDefinition, Point, Tile } from '../../src/engine/types';

export interface MirrorSetting {
  tile: Point;
  rotation: number;
}

/** One stage of a solution: set these mirrors, and the beam reaches `target`. */
export interface SolutionStage {
  settings: MirrorSetting[];
  target: Point;
}

export class UnsolvableLevelError extends Error {}

type Goal = (end: BeamEnd) => boolean;

interface Choice {
  tile: Point;
  option: number;
}

interface SearchNode {
  tile: Point;
  incoming: number;
  choices: Choice[];
}

/**
 * Proves a level can be finished: pods are cleared one at a time (clearing a pod only ever
 * opens paths, so a greedy order is enough), then the gates open and the beam must reach the receiver.
 * Pieces that move on their own (refractors, polarisers, rotating mirrors) count as reachable in any state.
 */
export function solveLevel(level: LevelDefinition): SolutionStage[] {
  const board = parseLevel(level);
  const stages: SolutionStage[] = [];
  while (findTiles(board, 'pod').length > 0) {
    const stage = findStage(board, (end) => end.kind === 'pod', `${level.name}: pods ${describePods(board)}`);
    board.tiles[stage.target.y][stage.target.x] = { kind: 'empty' };
    stages.push(stage);
  }
  openGates(board);
  stages.push(findStage(board, (end) => end.kind === 'receiver', `${level.name}: receiver`));
  return stages;
}

/**
 * Mirror settings that bring the beam into the receiver once every pod is gone, using only player
 * mirrors (so the path never depends on refractors or polarisers moving at random).
 */
export function solveReceiverWithMirrorsOnly(level: LevelDefinition): SolutionStage {
  const board = parseLevel(level);
  for (const pod of findTiles(board, 'pod')) board.tiles[pod.y][pod.x] = { kind: 'empty' };
  openGates(board);
  return findStage(board, (end) => end.kind === 'receiver', `${level.name}: receiver`, true);
}

function findStage(board: Board, isGoal: Goal, goal: string, mirrorsOnly = false): SolutionStage {
  const stage = new BeamPathSearch(board, isGoal, mirrorsOnly).run();
  if (!stage) throw new UnsolvableLevelError(`Unreachable — ${goal}`);
  return stage;
}

/**
 * Breadth-first search over "the beam arrives at adjustable piece P heading in direction d". Each hop
 * picks P's state; a candidate path is accepted only if tracing it from the emitter really reaches the goal.
 */
class BeamPathSearch {
  constructor(
    private readonly board: Board,
    private readonly isGoal: Goal,
    private readonly mirrorsOnly: boolean,
  ) {}

  run(): SolutionStage | null {
    const first = traceBeam(this.board, { stopAt: (tile) => this.isAdjustable(tile) });
    if (this.isGoal(first.end) && 'tile' in first.end) return { settings: [], target: first.end.tile };
    if (first.end.kind !== 'stopped' || !this.isChoosable(first.end.tile)) return null;
    const visited = new Set<string>([stateKey(first.end.tile, first.end.direction)]);
    const queue: SearchNode[] = [{ tile: first.end.tile, incoming: first.end.direction, choices: [] }];
    for (let index = 0; index < queue.length; index++) {
      const found = this.expand(queue[index], queue, visited);
      if (found) return found;
    }
    return null;
  }

  private expand(node: SearchNode, queue: SearchNode[], visited: Set<string>): SolutionStage | null {
    const piece = this.board.tiles[node.tile.y][node.tile.x];
    for (const option of optionsFor(piece)) {
      const direction = outgoing(piece, option, node.incoming);
      if (direction === undefined || direction === oppositeDirection(node.incoming)) continue;
      const choices = [...node.choices, { tile: node.tile, option }];
      const trace = traceBeam(this.board, {
        from: { tile: node.tile, direction },
        stopAt: (tile) => this.isAdjustable(tile),
      });
      const end = trace.end;
      if (this.isGoal(end) && 'tile' in end) {
        const verified = this.verify(choices, end.tile);
        if (verified) return verified;
      } else if (end.kind === 'stopped' && this.isChoosable(end.tile) && !visited.has(stateKey(end.tile, end.direction))) {
        visited.add(stateKey(end.tile, end.direction));
        queue.push({ tile: end.tile, incoming: end.direction, choices });
      }
    }
    return null;
  }

  /** Applies the chosen states and traces from the emitter; keeps them only if the beam hits the target. */
  private verify(choices: Choice[], target: Point): SolutionStage | null {
    const saved = choices.map(({ tile }) => ({ tile, piece: { ...this.board.tiles[tile.y][tile.x] } }));
    for (const { tile, option } of choices) apply(this.board.tiles[tile.y][tile.x], option);
    const end = traceBeam(this.board).end;
    if (this.isGoal(end) && 'tile' in end && end.tile.x === target.x && end.tile.y === target.y) {
      return { settings: playerMirrorSettings(this.board, choices), target };
    }
    for (const { tile, piece } of saved) this.board.tiles[tile.y][tile.x] = piece;
    return null;
  }

  private isChoosable(tile: Point): boolean {
    return !this.mirrorsOnly || this.board.tiles[tile.y][tile.x].kind === 'mirror';
  }

  private isAdjustable(tile: Point): boolean {
    const kind = this.board.tiles[tile.y][tile.x].kind;
    return kind === 'mirror' || kind === 'refractor' || kind === 'polarizer';
  }
}

function playerMirrorSettings(board: Board, choices: Choice[]): MirrorSetting[] {
  return choices.flatMap(({ tile }) => {
    const piece = board.tiles[tile.y][tile.x];
    return piece.kind === 'mirror' && !piece.auto ? [{ tile, rotation: piece.rotation }] : [];
  });
}

function optionsFor(piece: Tile): number[] {
  const count = piece.kind === 'polarizer' ? 8 : 16;
  return Array.from({ length: count }, (_, index) => index);
}

function apply(piece: Tile, option: number): void {
  if (piece.kind === 'mirror') piece.rotation = option;
  if (piece.kind === 'refractor') piece.direction = option;
  if (piece.kind === 'polarizer') piece.axis = option;
}

/** Where the beam heads after the piece in the given state; undefined when the piece absorbs it. */
function outgoing(piece: Tile, option: number, incoming: number): number | undefined {
  if (piece.kind === 'mirror') return reflectOffMirror(incoming, option);
  if (piece.kind === 'refractor') return option;
  if (piece.kind === 'polarizer') {
    if (incoming % 8 === option) return incoming;
    return piece.reflects ? reflectOffMirror(incoming, option * 2) : undefined;
  }
  return undefined;
}

function openGates(board: Board): void {
  for (const row of board.walls) {
    row.forEach((wall, column) => {
      if (wall === 'gate') row[column] = 'none';
    });
  }
}

function describePods(board: Board): string {
  return findTiles(board, 'pod')
    .map((tile) => `(${tile.x},${tile.y})`)
    .join(' ');
}

function stateKey(tile: Point, direction: number): string {
  return `${tile.x},${tile.y},${direction}`;
}
