import { oppositeDirection, reflectOffMirror, traceBeam } from './beam';
import { interact } from './pieces';
import { findTiles, parseLevel } from './level';
import type { BeamEnd, BeamTrace, Board, LevelDefinition, Point, Tile } from './types';

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
  return solveBoard(parseLevel(level), level.name);
}

/** Solves from a board in any state (some pods already gone). The board is modified; pass a copy. */
export function solveBoard(board: Board, name: string): SolutionStage[] {
  const stages: SolutionStage[] = [];
  while (findTiles(board, 'pod').length > 0) {
    const stage = findStage(board, (end) => end.kind === 'pod', `${name}: pods ${describePods(board)}`);
    board.tiles[stage.target.y][stage.target.x] = { kind: 'empty' };
    stages.push(stage);
  }
  openGates(board);
  stages.push(findStage(board, (end) => end.kind === 'receiver', `${name}: receiver`));
  return stages;
}

/** The next mirror move that makes progress from the current board, or undefined if none is needed. */
export function nextHint(board: Board): MirrorSetting | undefined {
  const copy = structuredClone(board);
  for (const stage of solveBoard(copy, 'hint')) {
    const move = stage.settings.find(({ tile, rotation }) => {
      const piece = board.tiles[tile.y][tile.x];
      return (piece.kind === 'mirror' || piece.kind === 'oneWay') && piece.rotation !== rotation;
    });
    if (move) return move;
  }
  return undefined;
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
    const reached = this.goalIn(first);
    if (reached) return { settings: [], target: reached };
    const stop = stoppedIn(first);
    if (!stop || !this.isChoosable(stop.tile)) return null;
    const visited = new Set<string>([stateKey(stop.tile, stop.direction)]);
    const queue: SearchNode[] = [{ tile: stop.tile, incoming: stop.direction, choices: [] }];
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
      const reached = this.goalIn(trace);
      if (reached) {
        const verified = this.verify(choices, reached);
        if (verified) return verified;
      }
      const stop = stoppedIn(trace);
      if (stop && this.isChoosable(stop.tile) && !visited.has(stateKey(stop.tile, stop.direction))) {
        visited.add(stateKey(stop.tile, stop.direction));
        queue.push({ tile: stop.tile, incoming: stop.direction, choices });
      }
    }
    return null;
  }

  /** Applies the chosen states and traces from the emitter; keeps them only if the beam hits the target. */
  private verify(choices: Choice[], target: Point): SolutionStage | null {
    const saved = choices.map(({ tile }) => ({ tile, piece: { ...this.board.tiles[tile.y][tile.x] } }));
    for (const { tile, option } of choices) apply(this.board.tiles[tile.y][tile.x], option);
    const hit = traceBeam(this.board).ends.some(
      (end) => this.isGoal(end) && 'tile' in end && end.tile.x === target.x && end.tile.y === target.y,
    );
    if (hit) return { settings: playerMirrorSettings(this.board, choices), target };
    for (const { tile, piece } of saved) this.board.tiles[tile.y][tile.x] = piece;
    return null;
  }

  /** Any branch that ends on the goal (splitters can produce several ends). */
  private goalIn(trace: BeamTrace): Point | undefined {
    const end = trace.ends.find((candidate) => this.isGoal(candidate) && 'tile' in candidate);
    return end && 'tile' in end ? end.tile : undefined;
  }

  private isChoosable(tile: Point): boolean {
    const kind = this.board.tiles[tile.y][tile.x].kind;
    return !this.mirrorsOnly || kind === 'mirror' || kind === 'oneWay';
  }

  private isAdjustable(tile: Point): boolean {
    const kind = this.board.tiles[tile.y][tile.x].kind;
    return kind === 'mirror' || kind === 'oneWay' || kind === 'refractor' || kind === 'polarizer';
  }
}

function playerMirrorSettings(board: Board, choices: Choice[]): MirrorSetting[] {
  return choices.flatMap(({ tile }) => {
    const piece = board.tiles[tile.y][tile.x];
    const playerTurns = piece.kind === 'oneWay' || (piece.kind === 'mirror' && !piece.auto);
    return playerTurns ? [{ tile, rotation: piece.rotation }] : [];
  });
}

function optionsFor(piece: Tile): number[] {
  const count = piece.kind === 'polarizer' ? 8 : 16;
  return Array.from({ length: count }, (_, index) => index);
}

function apply(piece: Tile, option: number): void {
  if (piece.kind === 'mirror' || piece.kind === 'oneWay') piece.rotation = option;
  if (piece.kind === 'refractor') piece.direction = option;
  if (piece.kind === 'polarizer') piece.axis = option;
}

/** Where the beam heads after the piece in the given state; undefined when the piece absorbs it. */
function outgoing(piece: Tile, option: number, incoming: number): number | undefined {
  if (piece.kind === 'mirror') return reflectOffMirror(incoming, option);
  if (piece.kind === 'oneWay') {
    const result = interact({ ...piece, rotation: option }, incoming);
    return result.type === 'turn' ? result.direction : incoming;
  }
  if (piece.kind === 'refractor') return option;
  if (piece.kind === 'polarizer') {
    if (incoming % 8 === option) return incoming;
    return piece.reflects ? reflectOffMirror(incoming, option * 2) : undefined;
  }
  return undefined;
}

function stoppedIn(trace: BeamTrace): Extract<BeamEnd, { kind: 'stopped' }> | undefined {
  return trace.ends.find((end): end is Extract<BeamEnd, { kind: 'stopped' }> => end.kind === 'stopped');
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
