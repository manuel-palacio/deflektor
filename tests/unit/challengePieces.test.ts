import { describe, expect, it } from 'vitest';
import { traceBeam } from '../../src/engine/beam';
import { Game, RULES, type GameEvent } from '../../src/engine/game';
import { parseLevel } from '../../src/engine/level';
import { MACHINERY_TIMING } from '../../src/engine/machinery';
import { hitsBrightFace, interact } from '../../src/engine/pieces';
import type { PieceSpec } from '../../src/engine/types';
import { validateLevel } from '../../src/engine/validation';
import { level } from './helpers';

const NO_CHARGE = { chargeSeconds: 0 };

function withPieces(rows: string[], pieces: PieceSpec[], extra: object = {}) {
  return { ...level(rows), pieces, ...extra };
}

function events(game: Game): GameEvent[] {
  const list: GameEvent[] = [];
  game.on((event) => list.push(event));
  return list;
}

describe('beam splitter', () => {
  // Rightward beam hits a splitter at (4,4) at 45°: half goes on to (8,4), half turns up to (4,1).
  const split = withPieces(['', '....o', '', '', 'E.......o', '', '', '', 'R'], [{ x: 4, y: 4, type: 'splitter', rotation: 4 }]);

  it('sends the beam straight on and reflected at the same time', () => {
    const trace = traceBeam(parseLevel(split));
    expect(trace.ends).toEqual([
      { kind: 'pod', tile: { x: 8, y: 4 } },
      { kind: 'pod', tile: { x: 4, y: 1 } },
    ]);
  });

  it('lets both branches destroy cells in the same instant', () => {
    const game = new Game([split], NO_CHARGE);
    game.tick(0.01);
    expect(game.podsRemaining).toBe(0);
  });

  it('passes a beam running parallel to it without splitting', () => {
    expect(interact({ kind: 'splitter', rotation: 8 }, 4)).toEqual({ type: 'pass' });
  });
});

describe('one-way mirror', () => {
  it('reflects a beam hitting its bright face and lets one from behind through', () => {
    const rotation = 4;
    const front = [0, 4, 8, 12].find((direction) => hitsBrightFace(rotation, direction) && interact({ kind: 'oneWay', rotation }, direction).type === 'turn');
    const back = [0, 4, 8, 12].find((direction) => !hitsBrightFace(rotation, direction) && direction % 8 !== 0);
    expect(front).toBeDefined();
    expect(interact({ kind: 'oneWay', rotation }, back!)).toEqual({ type: 'pass' });
  });

  it('can be turned by the player like a mirror', () => {
    const game = new Game([withPieces(['E...R'], [{ x: 2, y: 0, type: 'oneWay', rotation: 8 }])], NO_CHARGE);
    game.rotateMirror({ x: 2, y: 0 }, 1);
    expect(game.board.tiles[0][2]).toEqual({ kind: 'oneWay', rotation: 9 });
  });
});

describe('limited-turn mirror', () => {
  const limited = withPieces(['E', '', '', '', '', '', '', '', 'R'], [{ x: 5, y: 3, type: 'mirror', rotation: 2, turns: 2 }]);

  it('refuses further turns once they are used up, and says so', () => {
    const game = new Game([limited], NO_CHARGE);
    const log = events(game);
    game.rotateMirror({ x: 5, y: 3 }, 1);
    game.rotateMirror({ x: 5, y: 3 }, 1);
    game.rotateMirror({ x: 5, y: 3 }, 1);
    expect(game.board.tiles[3][5]).toMatchObject({ rotation: 4, turnsLeft: 0 });
    expect(log).toContainEqual({ type: 'mirrorLocked', tile: { x: 5, y: 3 } });
  });

  it('gives a turn back when it is undone', () => {
    const game = new Game([limited], NO_CHARGE);
    game.rotateMirror({ x: 5, y: 3 }, 1);
    game.undo();
    expect(game.board.tiles[3][5]).toMatchObject({ rotation: 2, turnsLeft: 2 });
  });
});

describe('fragile mirror', () => {
  it('shatters after the beam has bounced off it for long enough', () => {
    const fragile = withPieces(['E..#', '', '', '', '', '', '', '', 'R'], [{ x: 2, y: 0, type: 'mirror', rotation: 12, fragile: true }]);
    const game = new Game([fragile], NO_CHARGE);
    const log = events(game);
    game.tick(RULES.fragileSeconds / 2);
    expect(game.board.tiles[0][2].kind).toBe('mirror');
    game.tick(RULES.fragileSeconds / 2 + 0.01);
    expect(game.board.tiles[0][2]).toEqual({ kind: 'empty' });
    expect(log).toContainEqual({ type: 'mirrorShattered', tile: { x: 2, y: 0 } });
  });
});

describe('moving target', () => {
  it('patrols along its row and turns round at obstacles', () => {
    const moving = withPieces(['', '', '', '.......#o.#', 'E', '', '', '', 'R'], [{ x: 8, y: 3, type: 'pod', moves: 'horizontal' }]);
    const game = new Game([moving], NO_CHARGE);
    const log = events(game);
    game.tick(MACHINERY_TIMING.podMoveSeconds + 0.001);
    expect(game.board.tiles[3][9]).toMatchObject({ kind: 'pod', moves: 'horizontal' });
    game.tick(MACHINERY_TIMING.podMoveSeconds);
    expect(game.board.tiles[3][8]).toMatchObject({ kind: 'pod' });
    expect(log.filter((event) => event.type === 'podMoved')).toEqual([
      { type: 'podMoved', from: { x: 8, y: 3 }, to: { x: 9, y: 3 } },
      { type: 'podMoved', from: { x: 9, y: 3 }, to: { x: 8, y: 3 } },
    ]);
  });
});

describe('timed level', () => {
  it('costs a life when the clock runs out, and says why', () => {
    const game = new Game([{ ...level(['E#..R']), timeLimitSeconds: 1 }], NO_CHARGE);
    const log = events(game);
    expect(game.timeRemaining).toBe(1);
    game.tick(0.6);
    game.tick(0.6);
    expect(log).toContainEqual({ type: 'lifeLost', reason: 'time' });
  });

  it('has no clock unless the level sets one', () => {
    expect(new Game([level(['E...R'])], NO_CHARGE).timeRemaining).toBe(Infinity);
  });
});

describe('piece validation', () => {
  it('reports bad parameters with their position', () => {
    const problems = validateLevel(
      withPieces(['E...R'], [
        { x: 20, y: 0, type: 'mirror' },
        { x: 1, y: 0, type: 'splitter', rotation: 16 },
        { x: 2, y: 0, type: 'pod', turns: 2 },
        { x: 3, y: 0, type: 'laser' as never },
        { x: 0, y: 0, type: 'mirror' },
      ]),
    );
    expect(problems.map((problem) => problem.message)).toEqual([
      'piece 1: position (20, 0) is off the 15 x 9 board',
      'piece 2: rotation must be a whole number from 0 to 15 (got 16)',
      'piece 3: only mirrors can have limited turns or be fragile',
      'piece 4: unknown type "laser"',
      'piece 5: cannot replace the laser',
    ]);
  });
});
