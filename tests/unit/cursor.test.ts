import { describe, expect, it } from 'vitest';
import { mirrorInDirection, playerMirrors, startingMirror } from '../../src/input/cursor';
import { board } from './helpers';

const RIGHT = { x: 1, y: 0 };
const LEFT = { x: -1, y: 0 };

describe('keyboard cursor', () => {
  const mirrors = board(['E.1...2', '', '.3.@', '', '......4', '', '', '', 'R']);

  it('lists only mirrors the player can turn', () => {
    expect(playerMirrors(mirrors)).toEqual([{ x: 2, y: 0 }, { x: 6, y: 0 }, { x: 1, y: 2 }, { x: 6, y: 4 }]);
  });

  it('jumps to the nearest mirror in the pressed direction', () => {
    expect(mirrorInDirection(mirrors, { x: 2, y: 0 }, RIGHT)).toEqual({ x: 6, y: 0 });
  });

  it('prefers the mirror in line with the cursor over an equally far offset one', () => {
    expect(mirrorInDirection(mirrors, { x: 2, y: 4 }, RIGHT)).toEqual({ x: 6, y: 4 });
  });

  it('stays put when nothing lies that way', () => {
    expect(mirrorInDirection(mirrors, { x: 1, y: 2 }, LEFT)).toBeUndefined();
  });

  it('starts on the player mirror closest to the emitter', () => {
    expect(startingMirror(board(['.......2', '', '', '', 'E..3', '', '', '', 'R']))).toEqual({ x: 3, y: 4 });
  });
});
