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

import type { BeamEnd } from './types';

/** What a single branch end means, for its marker (undefined for a beam that just leaves the board). */
export function endState(end: BeamEnd, receiverOpen: boolean): BeamState | undefined {
  switch (end.kind) {
    case 'pod':
      return 'target';
    case 'receiver':
      return receiverOpen ? 'target' : 'locked';
    case 'mine':
      return 'mine';
    case 'emitter':
      return 'feedback';
    case 'absorbed':
      return 'blocked';
    case 'loop':
      return 'loop';
    default:
      return undefined;
  }
}

/** With splitters there can be several ends; danger outranks success, which outranks the rest. */
export function beamState(game: Game): BeamState {
  if (game.isCharging) return 'charging';
  const kinds = new Set(game.beam.ends.map((end) => end.kind));
  if (kinds.has('mine')) return 'mine';
  if (kinds.has('emitter')) return 'feedback';
  if (game.isOnTarget) return 'target';
  if (kinds.has('receiver')) return 'locked';
  if (kinds.has('loop')) return 'loop';
  if (kinds.has('absorbed')) return 'blocked';
  return 'open';
}
