import type { Point } from '../engine/types';

const ROTATIONS = 16;
const STEP = Math.PI / ROTATIONS;

/**
 * The mirror rotation whose plate points along a finger dragged from the mirror's centre.
 * A plate at rotation m lies m × 11.25° clockwise from vertical, and looks the same half a turn later,
 * so dragging either end of the plate gives the same answer. `offset` is in board space (y down).
 */
export function rotationTowards(offset: Point): number {
  const fromUp = Math.atan2(offset.x, -offset.y);
  const halfTurn = ((fromUp % Math.PI) + Math.PI) % Math.PI;
  return Math.round(halfTurn / STEP) % ROTATIONS;
}

/** The shortest signed number of one-step turns from one rotation to another (−8 … 8). */
export function stepsBetween(from: number, to: number): number {
  const clockwise = (((to - from) % ROTATIONS) + ROTATIONS) % ROTATIONS;
  return clockwise > ROTATIONS / 2 ? clockwise - ROTATIONS : clockwise;
}
