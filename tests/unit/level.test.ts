import { describe, expect, it } from 'vitest';
import { LevelFormatError, parseLevel } from '../../src/engine/level';
import { level } from './helpers';

describe('parseLevel', () => {
  it('parses every piece type', () => {
    const board = parseLevel(level(['E3@ox*pqTTR']));
    expect(board.tiles[0].map((tile) => tile.kind)).toEqual([
      'emitter', 'mirror', 'mirror', 'pod', 'mine', 'refractor', 'polarizer', 'polarizer', 'fibre', 'fibre', 'receiver',
      'empty', 'empty', 'empty', 'empty',
    ]);
    expect(board.tiles[0][1]).toEqual({ kind: 'mirror', rotation: 3, auto: false });
    expect(board.tiles[0][2]).toEqual({ kind: 'mirror', rotation: 0, auto: true });
    expect(board.tiles[0][6]).toMatchObject({ kind: 'polarizer', reflects: false });
    expect(board.tiles[0][7]).toMatchObject({ kind: 'polarizer', reflects: true });
  });

  it('applies the emitter direction from the level metadata', () => {
    const board = parseLevel(level(['E...R'], { emitter: 'down' }));
    expect(board.tiles[0][0]).toEqual({ kind: 'emitter', direction: 8 });
  });

  it('reads quarter-tile walls: purple reflects, light blue absorbs, gates open later', () => {
    const board = parseLevel(level(['E...R'], { walls: ['#=+.'] }));
    expect(board.walls[0].slice(0, 4)).toEqual(['reflect', 'absorb', 'gate', 'none']);
  });

  it('expands #, = and + in the tile map into whole-tile walls', () => {
    const board = parseLevel(level(['E.#=+R']));
    expect(board.tiles[0][2]).toEqual({ kind: 'empty' });
    expect([board.walls[0][4], board.walls[1][5], board.walls[0][6], board.walls[1][9]]).toEqual([
      'reflect',
      'reflect',
      'absorb',
      'gate',
    ]);
  });

  it('rejects maps with the wrong size', () => {
    expect(() => parseLevel({ ...level(['E...R']), tiles: ['E...R'] })).toThrow(LevelFormatError);
    expect(() => parseLevel({ ...level(['E...R']), walls: ['.'] })).toThrow(LevelFormatError);
  });

  it('rejects unknown tiles and walls', () => {
    expect(() => parseLevel(level(['E..?R']))).toThrow(/unknown tile/);
    expect(() => parseLevel(level(['E...R'], { walls: ['?'] }))).toThrow(/unknown wall/);
  });

  it('requires exactly one emitter and one receiver', () => {
    expect(() => parseLevel(level(['E.E.R']))).toThrow(/one laser/);
    expect(() => parseLevel(level(['E....']))).toThrow(/one receiver/);
  });

  it('requires fibre ends to come in pairs', () => {
    expect(() => parseLevel(level(['E.T.R']))).toThrow(/fibre 'T'/);
  });
});
