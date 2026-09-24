import { describe, expect, it } from 'vitest';
import { Coach, COACH_TIMING, HINT_TEXT, type CoachSnapshot } from '../../src/app/coach';

const calm: CoachSnapshot = { state: 'open', rotations: 1, energy: 1 };

describe('Coach', () => {
  it('opens a level with its lesson, then clears it', () => {
    const coach = new Coach();
    coach.startLevel('Turn the mirror.');
    expect(coach.update(calm, 0.1)).toEqual({ id: 'lesson', text: 'Turn the mirror.' });
    expect(coach.update(calm, COACH_TIMING.lessonSeconds)).toBeUndefined();
  });

  it('suggests turning a mirror only after the player has waited without trying', () => {
    const coach = new Coach();
    coach.startLevel();
    const idle = { ...calm, rotations: 0 };
    expect(coach.update(idle, COACH_TIMING.idleSeconds - 1)).toBeUndefined();
    expect(coach.update(idle, 1.5)?.id).toBe('turn-mirror');
  });

  it('does not nag while the laser is still charging', () => {
    const coach = new Coach();
    coach.startLevel();
    expect(coach.update({ state: 'charging', rotations: 0, energy: 1 }, 30)).toBeUndefined();
  });

  it('explains danger immediately, interrupting a calmer tip', () => {
    const coach = new Coach();
    coach.startLevel('Lesson text');
    expect(coach.update({ ...calm, state: 'mine' }, 0.1)).toEqual({ id: 'mine', text: HINT_TEXT.mine });
    const other = new Coach();
    other.startLevel();
    expect(other.update({ ...calm, state: 'feedback' }, 0.1)?.id).toBe('feedback');
  });

  it('points out a blocked beam only after it stays blocked for a while', () => {
    const coach = new Coach();
    coach.startLevel();
    const blocked = { ...calm, state: 'blocked' as const };
    expect(coach.update(blocked, 1)).toBeUndefined();
    expect(coach.update(calm, 5)).toBeUndefined();
    expect(coach.update(blocked, COACH_TIMING.blockedSeconds + 0.1)?.id).toBe('blocked');
  });

  it('announces the open receiver and warns about low energy', () => {
    const coach = new Coach();
    coach.startLevel();
    coach.notice({ type: 'receiverOpened' });
    expect(coach.update(calm, 0.1)?.id).toBe('receiver-open');
    expect(coach.update({ ...calm, energy: 0.2 }, COACH_TIMING.hintSeconds)?.id).toBe('low-energy');
  });

  it('shows each tip at most once per level', () => {
    const coach = new Coach();
    coach.startLevel();
    coach.update({ ...calm, state: 'loop' }, 0.1);
    coach.update(calm, COACH_TIMING.hintSeconds);
    expect(coach.update({ ...calm, state: 'loop' }, 0.1)).toBeUndefined();
    coach.startLevel();
    expect(coach.update({ ...calm, state: 'loop' }, 0.1)?.id).toBe('loop');
  });
});
