import type { Game } from './game';

/**
 * What the beam is doing, for feedback: aiming while the laser charges, locked on a target, overloading the
 * laser (on a mine, or fed back into the laser), swallowed by an absorber, trapped in a loop, stopped by a
 * still-locked receiver, or simply leaving the board.
 */
export type BeamState = 'charging' | 'target' | 'mine' | 'feedback' | 'blocked' | 'loop' | 'locked' | 'open';

export function isDangerous(state: BeamState): boolean {
  return state === 'mine' || state === 'feedback';
}

export function beamState(game: Game): BeamState {
  if (game.isCharging) return 'charging';
  if (game.isOnTarget) return 'target';
  switch (game.beam.end.kind) {
    case 'mine':
      return 'mine';
    case 'emitter':
      return 'feedback';
    case 'absorbed':
      return 'blocked';
    case 'loop':
      return 'loop';
    case 'receiver':
      return 'locked';
    default:
      return 'open';
  }
}
