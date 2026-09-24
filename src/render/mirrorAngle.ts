import { directionAngle } from '../engine/beam';

const HALF_TURN = Math.PI;

/**
 * Screen rotation (radians, Pixi convention) for a mirror plate drawn along the x axis.
 * A mirror with rotation m reflects direction d to m − d, so its plate bisects "up" and direction m.
 */
export function mirrorPlateRotation(rotation: number): number {
  const directionFromUp = (directionAngle(rotation) + 2 * Math.PI) % (2 * Math.PI);
  return directionFromUp / 2 - Math.PI / 2;
}

/** A plate looks identical every half turn; pick the equivalent angle closest to where it is now. */
export function nearestPlateAngle(current: number, target: number): number {
  const turns = Math.round((current - target) / HALF_TURN);
  return target + turns * HALF_TURN;
}
