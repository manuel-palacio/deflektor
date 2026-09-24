import { describe, expect, it } from 'vitest';
import { beamState } from '../../src/engine/beamState';
import { Game } from '../../src/engine/game';
import { level } from './helpers';

function stateOf(rows: string[], chargeSeconds = 0) {
  return beamState(new Game([level(rows)], { chargeSeconds }));
}

describe('beamState', () => {
  it('is charging before the laser fires', () => {
    expect(stateOf(['E..o....R'], 2)).toBe('charging');
  });

  it('distinguishes target, mine, feedback, blocked, locked and open beams', () => {
    expect(stateOf(['E..o....R'])).toBe('target');
    expect(stateOf(['E..x', '', '', '', '', '', '', '', 'R'])).toBe('mine');
    expect(stateOf(['E..0', '', '', '', '', '', '', '', 'R'])).toBe('feedback');
    expect(stateOf(['E..=', '', '', '', '', '', '', '', 'R'])).toBe('blocked');
    expect(stateOf(['E...R.o'])).toBe('locked');
    expect(stateOf(['E', '', '', '', '', '', '', '', 'R'])).toBe('open');
  });

  it('shows the open receiver as a target', () => {
    expect(stateOf(['E...R'])).toBe('target');
  });

  it('flags a beam trapped in a loop', () => {
    const game = new Game([level(['E.*.#', '', '', '', '', '', '', '', 'R'])], { chargeSeconds: 0 });
    game.board.tiles[0][2] = { kind: 'refractor', direction: 4 };
    game.tick(0.01);
    expect(beamState(game)).toBe('loop');
  });
});
