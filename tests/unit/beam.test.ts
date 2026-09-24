import { describe, expect, it } from 'vitest';
import { reflectOffMirror, traceBeam } from '../../src/engine/beam';
import { board } from './helpers';

// Beam coordinates are quarter-tile units from the board's top-left: tile (x, y) is centred on (2x + 1, 2y + 1).

describe('reflectOffMirror', () => {
  it('bounces a rightward beam off a vertical mirror back to the left', () => {
    expect(reflectOffMirror(4, 0)).toBe(12);
  });

  it('turns a rightward beam upward off a 45° mirror', () => {
    expect(reflectOffMirror(4, 4)).toBe(0);
  });

  it('lets a beam parallel to the mirror pass unchanged', () => {
    expect(reflectOffMirror(4, 8)).toBe(4);
  });
});

describe('traceBeam', () => {
  it('runs straight from the emitter to the board edge', () => {
    const trace = traceBeam(board(['', 'E', '', '', '', '', '', '', 'R']));
    expect(trace.end).toEqual({ kind: 'edge' });
    expect(trace.paths[0].at(-1)).toEqual({ x: 30, y: 3 });
  });

  it('stops at a pod, a mine and the receiver', () => {
    expect(traceBeam(board(['E..o', '', '', '', '', '', '', '', 'R'])).end).toEqual({ kind: 'pod', tile: { x: 3, y: 0 } });
    expect(traceBeam(board(['E.x', '', '', '', '', '', '', '', 'R'])).end).toEqual({ kind: 'mine', tile: { x: 2, y: 0 } });
    expect(traceBeam(board(['E...R'])).end).toEqual({ kind: 'receiver', tile: { x: 4, y: 0 } });
  });

  it('turns at a mirror and follows a 1:2 slope that meets every second row', () => {
    expect(traceBeam(board(['E..c', '', '...o', '', '', '', '', '', 'R'])).end).toEqual({ kind: 'pod', tile: { x: 3, y: 2 } });
    // Mirror rotation 5 turns a rightward beam (4) into direction 1: one across for every two up.
    expect(traceBeam(board(['', '', '', '', '....o', '', 'E..5', '', 'R'])).end).toEqual({ kind: 'pod', tile: { x: 4, y: 4 } });
  });

  it('only hits objects whose middle the beam crosses, not ones it clips at a corner', () => {
    // The 1:2 beam from (2,4) clips the corner of (2,3) on its way to the centre of (3,2).
    const trace = traceBeam(board(['', '', '...o', '..o', 'E.5', '', '', '', 'R']));
    expect(trace.end).toEqual({ kind: 'pod', tile: { x: 3, y: 2 } });
  });

  it('is absorbed by light-blue bricks', () => {
    const trace = traceBeam(board(['E...=', '', '', '', '', '', '', '', 'R']));
    expect(trace.end).toEqual({ kind: 'absorbed' });
    expect(trace.paths[0].at(-1)).toEqual({ x: 8, y: 1 });
  });

  it('bounces straight back off a purple brick face', () => {
    // Mirror sends the beam up; the brick above reflects it down into the mirror, which returns it to the emitter.
    const trace = traceBeam(board(['..#', '', 'E.4', '', '', '', '', '', 'R']));
    expect(trace.paths[0]).toContainEqual({ x: 5, y: 2 });
    expect(trace.end).toEqual({ kind: 'emitter', tile: { x: 0, y: 2 } });
  });

  it('flips only the vertical component when a diagonal beam meets a flat ceiling', () => {
    const trace = traceBeam(board(['###############', '', '', '', 'E.6', '', '', '', 'R']));
    const bounce = trace.paths[0].find((point) => point.y === 2)!;
    const after = trace.paths[0].at(-1)!;
    expect(after.x).toBeGreaterThan(bounce.x);
    expect(after.y).toBeGreaterThan(bounce.y);
  });

  it('deflects a diagonal beam sideways off the corner of a lone brick', () => {
    // Mirror 6 sends the beam up-right from (2,4); a single brick sits exactly on its diagonal.
    const walls = ['', '', '', '', '', '', '', '......#'];
    const trace = traceBeam(board(['', '', '', '', 'E.6', '', '', '', 'R'], { walls }));
    const path = trace.paths[0];
    const bounce = path.findIndex((point) => point.x === 6 && point.y === 8);
    expect(bounce).toBeGreaterThan(0);
    expect(path[bounce + 1].x).toBeLessThan(6);
    expect(path[bounce + 1].y).toBeLessThan(8);
  });

  it('slips along the seam beside a single brick but not between two', () => {
    // The beam turns down tile column 2, running exactly on the seam between quarter columns 4 and 5.
    const rows = ['E.c', '', '', '', '', '', '', '', '..R'];
    expect(traceBeam(board(rows, { walls: ['', '', '', '', '....#'] })).end).toEqual({
      kind: 'receiver',
      tile: { x: 2, y: 8 },
    });
    expect(traceBeam(board(rows, { walls: ['', '', '', '', '....##'] })).end.kind).not.toBe('receiver');
  });

  it('treats gates as reflecting walls', () => {
    const trace = traceBeam(board(['E...R'], { walls: ['......+', '......+'] }));
    expect(trace.end).toEqual({ kind: 'emitter', tile: { x: 0, y: 0 } });
  });

  it('flags a beam reflected back into the emitter', () => {
    const trace = traceBeam(board(['E..0', '', '', '', '', '', '', '', 'R']));
    expect(trace.end).toEqual({ kind: 'emitter', tile: { x: 0, y: 0 } });
  });

  it('lets a polariser pass beams along its axis and absorbs or reflects the rest', () => {
    const absorbing = board(['E.p.o', '', '', '', '', '', '', '', 'R']);
    expect(traceBeam(absorbing).end).toEqual({ kind: 'absorbed' });
    absorbing.tiles[0][2] = { kind: 'polarizer', axis: 4, reflects: false };
    expect(traceBeam(absorbing).end.kind).toBe('pod');
    const reflecting = board(['E.q.o', '', '', '', '', '', '', '', 'R']);
    expect(traceBeam(reflecting).end).toEqual({ kind: 'emitter', tile: { x: 0, y: 0 } });
  });

  it('sends the beam on in the refractor’s current direction', () => {
    const level = board(['E.*', '', '..o', '', '', '', '', '', 'R']);
    level.tiles[0][2] = { kind: 'refractor', direction: 8 };
    expect(traceBeam(level).end).toEqual({ kind: 'pod', tile: { x: 2, y: 2 } });
  });

  it('teleports through a fibre pair keeping its direction', () => {
    const trace = traceBeam(board(['E.T', '', '', '', '....T.o', '', '', '', 'R']));
    expect(trace.end).toEqual({ kind: 'pod', tile: { x: 6, y: 4 } });
    expect(trace.paths).toHaveLength(2);
    expect(trace.paths[1][0]).toEqual({ x: 9, y: 9 });
  });

  it('reports a refractor loop instead of tracing forever', () => {
    const level = board(['E.*.#', '', '', '', '', '', '', '', 'R']);
    level.tiles[0][2] = { kind: 'refractor', direction: 4 };
    expect(traceBeam(level).end).toEqual({ kind: 'loop' });
  });

  it('halts at tiles accepted by the stop predicate and can start from any tile', () => {
    const level = board(['E..c', '', '', '', '', '', '', '', 'R']);
    expect(traceBeam(level, { stopAt: (tile) => tile.x === 3 }).end).toEqual({
      kind: 'stopped',
      tile: { x: 3, y: 0 },
      direction: 4,
    });
    expect(traceBeam(level, { from: { tile: { x: 4, y: 8 }, direction: 12 } }).end).toEqual({
      kind: 'receiver',
      tile: { x: 0, y: 8 },
    });
  });
});
