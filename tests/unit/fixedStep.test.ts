import { describe, expect, it } from 'vitest';
import { FixedStepper, SIMULATION_STEP_SECONDS } from '../../src/engine/fixedStep';
import { Game } from '../../src/engine/game';
import { LEVELS } from '../../src/engine/levels';

/** A tiny deterministic random source so both runs see the same refractor and polariser states. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Plays a level for a fixed number of simulation steps at the given frame rate, turning a mirror at 3 s. */
function play(framesPerSecond: number, jitter: number, totalSteps: number) {
  const game = new Game(LEVELS, { startLevel: 5, random: seeded(42) });
  const stepper = new FixedStepper();
  const random = seeded(7);
  let steps = 0;
  while (steps < totalSteps) {
    const frame = (1 / framesPerSecond) * (1 + (random() - 0.5) * jitter);
    stepper.advance(frame, (step) => {
      if (steps >= totalSteps) return;
      if (steps === Math.round(3 / SIMULATION_STEP_SECONDS)) game.rotateMirror({ x: 2, y: 0 }, 1);
      game.tick(step);
      steps++;
    });
  }
  const { energy, overload, score, phase, podsRemaining } = game;
  return { energy, overload, score, phase, podsRemaining, tiles: JSON.stringify(game.board.tiles) };
}

describe('FixedStepper', () => {
  it('runs whole fixed steps and carries the remainder to the next frame', () => {
    const stepper = new FixedStepper();
    const steps: number[] = [];
    expect(stepper.advance(SIMULATION_STEP_SECONDS * 2.5, (step) => steps.push(step))).toBe(2);
    expect(stepper.advance(SIMULATION_STEP_SECONDS * 0.5, (step) => steps.push(step))).toBe(1);
    expect(steps.every((step) => step === SIMULATION_STEP_SECONDS)).toBe(true);
  });

  it('drops the backlog after a long stall instead of fast-forwarding', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(10, () => undefined)).toBe(30);
    expect(stepper.advance(0, () => undefined)).toBe(0);
  });

  it('gives the same result at 30, 60 and 144 frames per second, even with uneven frames', () => {
    const eightSeconds = Math.round(8 / SIMULATION_STEP_SECONDS);
    const at30 = play(30, 0, eightSeconds);
    expect(at30.energy).toBeLessThan(1);
    expect(play(60, 0.4, eightSeconds)).toEqual(at30);
    expect(play(144, 0.4, eightSeconds)).toEqual(at30);
  });
});
