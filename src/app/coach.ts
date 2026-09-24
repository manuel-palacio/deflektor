import type { BeamState } from '../engine/beamState';
import type { GameEvent } from '../engine/game';

/** What the coach needs to know each frame. */
export interface CoachSnapshot {
  state: BeamState;
  rotations: number;
  energy: number;
}

type TipId = 'turn-mirror' | 'mine' | 'feedback' | 'blocked' | 'loop' | 'receiver-open' | 'low-energy';
export type HintId = 'lesson' | TipId;

export interface Hint {
  id: HintId;
  text: string;
}

export const HINT_TEXT: Record<TipId, string> = {
  'turn-mirror': 'Click or tap a mirror to turn it. Right-click (or Z) turns it back.',
  mine: 'That is a mine, and the overload meter is climbing. Turn the beam away!',
  feedback: 'The beam is bouncing back into the laser. Turn it away before it overloads.',
  blocked: 'Blue bricks and polarisers can swallow the beam. Try a different angle.',
  loop: 'The beam is going round in circles. Turn a mirror to break the loop.',
  'receiver-open': 'All cells popped! The receiver is open: steer the beam into it.',
  'low-energy': 'Energy is running low, and whatever is left becomes your bonus. Hurry!',
};

export const COACH_TIMING = {
  hintSeconds: 6,
  lessonSeconds: 7,
  idleSeconds: 5,
  blockedSeconds: 3,
  lowEnergy: 0.3,
} as const;

/**
 * Shows one short, relevant tip at a time instead of an instruction screen: each tip appears at most once
 * per level, and only when the situation calls for it (idle too long, beam in danger, receiver opened…).
 */
export class Coach {
  private readonly shown = new Set<HintId>();
  private current?: Hint;
  private remaining = 0;
  private idleSeconds = 0;
  private blockedSeconds = 0;

  /** Starts a level, optionally opening with its lesson. */
  startLevel(lesson?: string): void {
    this.shown.clear();
    this.idleSeconds = 0;
    this.blockedSeconds = 0;
    this.current = undefined;
    if (lesson) this.show({ id: 'lesson', text: lesson }, COACH_TIMING.lessonSeconds);
  }

  notice(event: GameEvent): void {
    if (event.type === 'receiverOpened') this.offer('receiver-open', true);
  }

  /** Advances the coach and returns the tip to display, if any. */
  update(snapshot: CoachSnapshot, seconds: number): Hint | undefined {
    this.remaining -= seconds;
    if (this.remaining <= 0) this.current = undefined;
    if (snapshot.state !== 'charging') this.watch(snapshot, seconds);
    return this.current;
  }

  private watch({ state, rotations, energy }: CoachSnapshot, seconds: number): void {
    this.idleSeconds = rotations === 0 ? this.idleSeconds + seconds : 0;
    this.blockedSeconds = state === 'blocked' ? this.blockedSeconds + seconds : 0;
    if (state === 'mine' || state === 'feedback' || state === 'loop') this.offer(state, true);
    if (this.idleSeconds >= COACH_TIMING.idleSeconds) this.offer('turn-mirror');
    if (this.blockedSeconds >= COACH_TIMING.blockedSeconds) this.offer('blocked');
    if (energy < COACH_TIMING.lowEnergy) this.offer('low-energy');
  }

  /** Urgent tips interrupt whatever is showing; others wait for the current tip to finish. */
  private offer(id: TipId, urgent = false): void {
    if (this.shown.has(id) || (this.current && !urgent)) return;
    this.show({ id, text: HINT_TEXT[id] }, COACH_TIMING.hintSeconds);
  }

  private show(hint: Hint, seconds: number): void {
    this.shown.add(hint.id);
    this.current = hint;
    this.remaining = seconds;
  }
}
