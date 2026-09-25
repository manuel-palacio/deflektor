import { describe, expect, it } from 'vitest';
import { Game, RULES, type GameEvent } from '../../src/engine/game';
import { DIFFICULTY_RULES } from '../../src/engine/difficulty';
import { MACHINERY_TIMING } from '../../src/engine/machinery';
import { level } from './helpers';

// Pod at (3,0) is hit immediately; mirror at (5,0) then sends the beam down into the receiver at (5,4).
const podThenReceiver = level(['E..o.c', '', '', '', '.....R'], { energySeconds: 10 });
const mineLevel = level(['E..x', '', '', '', '', '', '', '', 'R'], { energySeconds: 100 });
const secondLevel = level(['E....R'], { energySeconds: 10 });

const NO_CHARGE = { chargeSeconds: 0 };

function recordEvents(game: Game): GameEvent[] {
  const events: GameEvent[] = [];
  game.on((event) => events.push(event));
  return events;
}

describe('Game', () => {
  it('charges the laser before it burns: pods survive, overload and energy hold', () => {
    const game = new Game([mineLevel, podThenReceiver], { chargeSeconds: 2 });
    expect(game.isCharging).toBe(true);
    game.tick(1);
    expect(game.overload).toBe(0);
    expect(game.energy).toBe(1);
    expect(game.beam.end.kind).toBe('mine');
    game.tick(1.01);
    expect(game.isCharging).toBe(false);
    game.tick(0.5);
    expect(game.overload).toBeGreaterThan(0);
  });

  it('lets the player turn mirrors while the laser charges', () => {
    const game = new Game([level(['E..0', '', '', '', '', '', '', '', 'R'])]);
    game.rotateMirror({ x: 3, y: 0 }, -4);
    expect(game.board.tiles[0][3]).toMatchObject({ rotation: 12 });
  });

  it('starts a run with full meters and the starting lives', () => {
    const game = new Game([podThenReceiver], NO_CHARGE);
    expect(game.phase).toBe('playing');
    expect(game.lives).toBe(RULES.startingLives);
    expect(game.energy).toBe(1);
    expect(game.overload).toBe(0);
  });

  it('destroys a pod the beam touches and scores it', () => {
    const game = new Game([podThenReceiver], NO_CHARGE);
    const events = recordEvents(game);
    game.tick(0.016);
    expect(game.podsRemaining).toBe(0);
    expect(game.score).toBe(RULES.podScore);
    expect(events).toContainEqual({ type: 'podDestroyed', tile: { x: 3, y: 0 } });
  });

  it('keeps the receiver locked until every pod is gone', () => {
    const game = new Game([level(['E..R.o', '', '', '', '', '', '', '', ''])], NO_CHARGE);
    game.tick(0.016);
    expect(game.receiverOpen).toBe(false);
    expect(game.phase).toBe('playing');
  });

  it('removes the gates around the receiver once the last pod is destroyed', () => {
    const gated = level(['E.o..R'], { walls: ['.........+', '.........+'] });
    const game = new Game([gated], NO_CHARGE);
    const events = recordEvents(game);
    expect(game.board.walls[0][9]).toBe('gate');
    game.tick(0.016);
    expect(events).toContainEqual({ type: 'receiverOpened' });
    expect(game.board.walls[0][9]).toBe('none');
    game.tick(0.016);
    expect(game.phase).toBe('levelComplete');
  });

  it('re-rolls refractor directions and rotates polarisers over time', () => {
    const rolls = [0.1, 0.9, 0.5, 0.3];
    let call = 0;
    const game = new Game([level(['E.*.p', '', '', '', '', '', '', '', 'R'])], {
      random: () => rolls[call++ % rolls.length],
      chargeSeconds: 0,
    });
    const refractor = () => game.board.tiles[0][2];
    const polarizer = () => game.board.tiles[0][4];
    expect(refractor()).toEqual({ kind: 'refractor', direction: 1 });
    expect(polarizer()).toMatchObject({ axis: 7 });
    game.tick(MACHINERY_TIMING.refractorShuffleSeconds + 0.001);
    expect(refractor()).toEqual({ kind: 'refractor', direction: 8 });
    expect(polarizer()).toMatchObject({ axis: (7 + 1) % 8 });
  });

  it('completes the level when the beam enters the open receiver, adding the energy bonus', () => {
    const game = new Game([podThenReceiver, secondLevel], NO_CHARGE);
    const events = recordEvents(game);
    game.tick(0.016);
    game.tick(0.016);
    expect(game.phase).toBe('levelComplete');
    const bonus = Math.round(game.energy * RULES.energyBonus);
    expect(events).toContainEqual(expect.objectContaining({ type: 'levelComplete', bonus }));
    expect(game.score).toBe(RULES.podScore + bonus);
  });

  it('moves to the next level on continue after completing one', () => {
    const game = new Game([podThenReceiver, secondLevel], NO_CHARGE);
    game.tick(0.016);
    game.tick(0.016);
    game.continue();
    expect(game.levelIndex).toBe(1);
    expect(game.phase).toBe('playing');
    expect(game.energy).toBe(1);
  });

  it('declares victory after the final level', () => {
    const game = new Game([secondLevel], NO_CHARGE);
    game.tick(0.016);
    game.continue();
    expect(game.phase).toBe('victory');
  });

  it('rotates a player mirror and retraces the beam immediately', () => {
    const game = new Game([level(['E..0', '', '', '', '', '', '', '', 'R'])], NO_CHARGE);
    game.rotateMirror({ x: 3, y: 0 }, -4);
    expect(game.board.tiles[0][3]).toMatchObject({ kind: 'mirror', rotation: 12 });
    expect(game.beam.end).toEqual({ kind: 'edge' });
  });

  it('ignores rotation requests on non-mirror tiles and auto mirrors', () => {
    const game = new Game([level(['E.@o', '', '', '', '', '', '', '', 'R'])], NO_CHARGE);
    game.rotateMirror({ x: 2, y: 0 }, 1);
    game.rotateMirror({ x: 3, y: 0 }, 1);
    expect(game.board.tiles[0][2]).toMatchObject({ rotation: 0 });
    expect(game.board.tiles[0][3]).toEqual({ kind: 'pod' });
  });

  it('turns self-rotating mirrors on their own through 8 orientations', () => {
    const game = new Game([level(['E.@', '', '', '', '', '', '', '', 'R'])], NO_CHARGE);
    game.tick(MACHINERY_TIMING.autoMirrorStepSeconds * 3 + 0.001);
    expect(game.board.tiles[0][2]).toMatchObject({ rotation: 6 });
    game.tick(MACHINERY_TIMING.autoMirrorStepSeconds * 5);
    expect(game.board.tiles[0][2]).toMatchObject({ rotation: 0 });
  });

  it('drains energy over the level time and loses a life when it runs out', () => {
    const game = new Game([level(['E#...R'], { energySeconds: 2 })], NO_CHARGE);
    const events = recordEvents(game);
    game.tick(1);
    expect(game.energy).toBeCloseTo(0.5);
    game.tick(1.01);
    expect(game.phase).toBe('lifeLost');
    expect(game.lives).toBe(RULES.startingLives - 1);
    expect(events).toContainEqual({ type: 'lifeLost', reason: 'energy' });
  });

  it('builds overload while the beam sits on a mine and loses a life when it is full', () => {
    const game = new Game([mineLevel], NO_CHARGE);
    const events = recordEvents(game);
    game.tick(0.5);
    expect(game.overload).toBeCloseTo(0.5 * DIFFICULTY_RULES.classic.overloadRisePerSecond);
    for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.tick(0.5);
    expect(game.phase).toBe('lifeLost');
    expect(events).toContainEqual({ type: 'lifeLost', reason: 'mine' });
  });

  it('builds overload when the beam is reflected back into the emitter', () => {
    const game = new Game([level(['E..0', '', '', '', '', '', '', '', 'R'])], NO_CHARGE);
    game.tick(0.5);
    expect(game.overload).toBeGreaterThan(0);
  });

  it('cools overload once the beam is safe', () => {
    const game = new Game([mineLevel], NO_CHARGE);
    game.tick(1);
    const heated = game.overload;
    game.board.tiles[0][3] = { kind: 'empty' };
    game.tick(1);
    expect(game.overload).toBeCloseTo(heated - DIFFICULTY_RULES.classic.overloadDecayPerSecond);
  });

  it('restarts the level with a fresh board after a lost life', () => {
    const game = new Game([mineLevel], NO_CHARGE);
    for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.tick(0.5);
    game.continue();
    expect(game.phase).toBe('playing');
    expect(game.overload).toBe(0);
    expect(game.energy).toBe(1);
  });

  it('ends the run when the last life is lost', () => {
    const game = new Game([mineLevel], NO_CHARGE);
    const events = recordEvents(game);
    for (let life = 0; life < RULES.startingLives; life++) {
      for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.tick(0.5);
      if (game.phase === 'lifeLost') game.continue();
    }
    expect(game.phase).toBe('gameOver');
    expect(events.at(-1)).toEqual({ type: 'gameOver' });
  });

  it('freezes the simulation outside the playing phase', () => {
    const game = new Game([secondLevel], NO_CHARGE);
    game.tick(0.016);
    const energy = game.energy;
    game.tick(5);
    expect(game.energy).toBe(energy);
  });

  it('can start a run at a later level', () => {
    const game = new Game([podThenReceiver, secondLevel], { startLevel: 1, chargeSeconds: 0 });
    expect(game.levelIndex).toBe(1);
  });

  it('explains a lost life caused by feeding the beam back into the laser', () => {
    const game = new Game([level(['E..0', '', '', '', '', '', '', '', 'R'])], NO_CHARGE);
    const events = recordEvents(game);
    for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.tick(0.5);
    expect(events).toContainEqual({ type: 'lifeLost', reason: 'feedback' });
  });

  it('counts turns and firing time, and reports them when the level is complete', () => {
    const game = new Game([level(['E..8.....R'])], { chargeSeconds: 1 });
    const events = recordEvents(game);
    game.rotateMirror({ x: 3, y: 0 }, 1);
    game.rotateMirror({ x: 3, y: 0 }, -1);
    game.tick(1);
    game.tick(0.25);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'levelComplete', stats: { rotations: 2, seconds: 0.25, podsDestroyed: 0 } }),
    );
  });

  it('announces when a turn newly lines the beam up on a pod', () => {
    const game = new Game([level(['E..0', '', '', '...o', '', '', '', '', 'R'])], NO_CHARGE);
    const events = recordEvents(game);
    game.rotateMirror({ x: 3, y: 0 }, 12);
    expect(events).toContainEqual({ type: 'beamConnected', tile: { x: 3, y: 3 } });
    game.rotateMirror({ x: 3, y: 0 }, 4);
    expect(events.filter((event) => event.type === 'beamConnected')).toHaveLength(1);
  });

  it('restarts a level without costing a life and forgets that level’s score', () => {
    const game = new Game([podThenReceiver], NO_CHARGE);
    game.tick(0.016);
    expect(game.score).toBe(RULES.podScore);
    game.restartLevel();
    expect(game.score).toBe(0);
    expect(game.lives).toBe(RULES.startingLives);
    expect(game.podsRemaining).toBe(1);
  });

  it('never runs out of lives in training', () => {
    const game = new Game([mineLevel], { chargeSeconds: 0, unlimitedLives: true });
    for (let life = 0; life < 5; life++) {
      for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.tick(0.5);
      game.continue();
    }
    expect(game.phase).toBe('playing');
    expect(game.lives).toBe(RULES.startingLives);
  });

  describe('state transitions', () => {
    it('ignores continue while a level is still being played', () => {
      const game = new Game([podThenReceiver, secondLevel], NO_CHARGE);
      game.continue();
      expect(game.levelIndex).toBe(0);
      expect(game.phase).toBe('playing');
    });

    it('can restart from the life-lost screen without losing a second life', () => {
      const game = new Game([mineLevel], NO_CHARGE);
      for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.tick(0.5);
      expect(game.phase).toBe('lifeLost');
      game.restartLevel();
      expect(game.phase).toBe('playing');
      expect(game.lives).toBe(RULES.startingLives - 1);
    });

    it('stays over after game over: neither continue nor restart revive the run', () => {
      const game = new Game([mineLevel], NO_CHARGE);
      for (let life = 0; life < RULES.startingLives; life++) {
        for (let i = 0; i < 10 && game.phase === 'playing'; i++) game.tick(0.5);
        if (game.phase === 'lifeLost') game.continue();
      }
      game.continue();
      game.restartLevel();
      expect(game.phase).toBe('gameOver');
    });

    it('does not let mirrors turn once the level has ended', () => {
      const game = new Game([level(['E..8.....R'])], NO_CHARGE);
      game.tick(0.1);
      expect(game.phase).toBe('levelComplete');
      game.rotateMirror({ x: 3, y: 0 }, 1);
      expect(game.board.tiles[0][3]).toMatchObject({ rotation: 8 });
    });

    it('resets meters, pods and statistics when a level restarts', () => {
      const game = new Game([mineLevel], NO_CHARGE);
      game.rotateMirror({ x: 0, y: 0 }, 1);
      game.tick(0.5);
      game.restartLevel();
      expect({ energy: game.energy, overload: game.overload, stats: game.stats }).toEqual({
        energy: 1,
        overload: 0,
        stats: { rotations: 0, seconds: 0, podsDestroyed: 0 },
      });
    });
  });

  describe('undo and redo', () => {
    const twoMirrors = level(['E..8..8', '', '', '', '', '', '', '', 'R']);

    it('takes back turns in reverse order and replays them', () => {
      const game = new Game([twoMirrors], NO_CHARGE);
      game.rotateMirror({ x: 3, y: 0 }, 1);
      game.rotateMirror({ x: 6, y: 0 }, -2);
      game.undo();
      expect(game.board.tiles[0][6]).toMatchObject({ rotation: 8 });
      game.undo();
      expect(game.board.tiles[0][3]).toMatchObject({ rotation: 8 });
      expect(game.canUndo).toBe(false);
      game.redo();
      game.redo();
      expect(game.board.tiles[0][3]).toMatchObject({ rotation: 9 });
      expect(game.board.tiles[0][6]).toMatchObject({ rotation: 6 });
      expect(game.canRedo).toBe(false);
    });

    it('forgets the redo trail once the player makes a new turn', () => {
      const game = new Game([twoMirrors], NO_CHARGE);
      game.rotateMirror({ x: 3, y: 0 }, 1);
      game.undo();
      game.rotateMirror({ x: 6, y: 0 }, 1);
      expect(game.canRedo).toBe(false);
    });

    it('still counts undone turns as moves and clears history on restart', () => {
      const game = new Game([twoMirrors], NO_CHARGE);
      game.rotateMirror({ x: 3, y: 0 }, 1);
      game.undo();
      expect(game.stats.rotations).toBe(2);
      game.restartLevel();
      expect(game.canUndo).toBe(false);
    });
  });

  describe('difficulty', () => {
    it('defaults to Classic, the tuning closest to the original', () => {
      expect(new Game([mineLevel], NO_CHARGE).difficultyRules).toEqual(DIFFICULTY_RULES.classic);
    });

    it('builds overload more slowly on Relaxed', () => {
      const relaxed = new Game([mineLevel], { chargeSeconds: 0, difficulty: 'relaxed' });
      const classic = new Game([mineLevel], NO_CHARGE);
      relaxed.tick(1);
      classic.tick(1);
      expect(relaxed.overload).toBeCloseTo(DIFFICULTY_RULES.relaxed.overloadRisePerSecond);
      expect(relaxed.overload).toBeLessThan(classic.overload);
    });

    it('makes energy last longer on easier settings', () => {
      const relaxed = new Game([level(['E#...R'], { energySeconds: 10 })], { chargeSeconds: 0, difficulty: 'relaxed' });
      relaxed.tick(5);
      expect(relaxed.energy).toBeCloseTo(1 - 5 / (10 * DIFFICULTY_RULES.relaxed.energyScale));
    });

    it('can change difficulty in the middle of a level', () => {
      const game = new Game([mineLevel], NO_CHARGE);
      game.setDifficulty('relaxed');
      expect(game.difficultyRules).toEqual(DIFFICULTY_RULES.relaxed);
    });
  });
});
