import { describe, expect, it } from 'vitest';
import { blankLevel, checkLevel, edits } from '../../src/editor/Editor';
import { validateLevel } from '../../src/engine/validation';

describe('editor edits', () => {
  it('starts from a valid blank level', () => {
    expect(validateLevel(blankLevel())).toEqual([]);
  });

  it('paints tiles and quarter-tile bricks', () => {
    let level = edits.setTile(blankLevel(), 5, 2, 'o');
    level = edits.setWall(level, 10, 3, '#');
    expect(level.tiles[2][5]).toBe('o');
    expect(level.walls![3][10]).toBe('#');
  });

  it('places parameterised pieces and replaces whatever was on that tile', () => {
    let level = edits.setTile(blankLevel(), 6, 4, 'o');
    level = edits.setPiece(level, { x: 6, y: 4, type: 'splitter', rotation: 4 });
    expect(level.tiles[4][6]).toBe('.');
    expect(level.pieces).toEqual([{ x: 6, y: 4, type: 'splitter', rotation: 4 }]);
    level = edits.setTile(level, 6, 4, 'x');
    expect(level.pieces).toEqual([]);
  });

  it('turns mirrors and rotatable pieces one step at a time', () => {
    let level = edits.setTile(blankLevel(), 3, 3, 'f');
    level = edits.rotate(level, 3, 3);
    expect(level.tiles[3][3]).toBe('0');
    level = edits.setPiece(level, { x: 5, y: 5, type: 'oneWay', rotation: 15 });
    expect(edits.rotate(level, 5, 5).pieces![0].rotation).toBe(0);
  });
});

describe('checkLevel', () => {
  it('reports solvability and par for a finishable level', () => {
    const level = edits.setTile(edits.setTile(blankLevel(), 7, 4, '8'), 7, 1, 'o');
    const result = checkLevel(level);
    expect(result.ok).toBe(true);
    expect(result.lines[0]).toBe('Solvable: 1 cells, then the receiver.');
    expect(result.lines[1]).toMatch(/^Par: \d+ turns, \d+ s\.$/);
  });

  it('lists structural problems with their positions', () => {
    const result = checkLevel(edits.setTile(blankLevel(), 3, 1, 'E'));
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toContain('needs exactly one laser');
  });

  it('says why a level cannot be finished', () => {
    const walled = edits.setTile(edits.setTile(blankLevel(), 1, 4, '='), 8, 0, 'o');
    const result = checkLevel(walled);
    expect(result.ok).toBe(false);
    expect(result.lines[0]).toMatch(/^Not solvable yet/);
  });
});
