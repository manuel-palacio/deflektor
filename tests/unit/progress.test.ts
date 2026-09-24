import { describe, expect, it } from 'vitest';
import { ProgressStore } from '../../src/app/progress';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('ProgressStore', () => {
  it('starts with only the first level unlocked', () => {
    expect(new ProgressStore(memoryStorage(), 12).current).toEqual({
      unlockedLevels: 1,
      highScore: 0,
      muted: false,
      trainingDone: false,
      bestLevelScores: {},
    });
  });

  it('unlocks the level after a completed one and remembers it across sessions', () => {
    const storage = memoryStorage();
    new ProgressStore(storage, 12).unlockLevelAfter(2);
    expect(new ProgressStore(storage, 12).current.unlockedLevels).toBe(4);
  });

  it('never unlocks beyond the last level or goes backwards', () => {
    const store = new ProgressStore(memoryStorage(), 3);
    store.unlockLevelAfter(2);
    store.unlockLevelAfter(0);
    expect(store.current.unlockedLevels).toBe(3);
  });

  it('keeps only the best score', () => {
    const store = new ProgressStore(memoryStorage(), 12);
    store.recordScore(500);
    store.recordScore(200);
    expect(store.current.highScore).toBe(500);
  });

  it('persists the mute setting', () => {
    const storage = memoryStorage();
    new ProgressStore(storage, 12).setMuted(true);
    expect(new ProgressStore(storage, 12).current.muted).toBe(true);
  });

  it('falls back to defaults when stored data is corrupt', () => {
    const store = new ProgressStore(memoryStorage({ 'deflektor.progress.v1': '{oops' }), 12);
    expect(store.current.unlockedLevels).toBe(1);
  });

  it('keeps working in memory when storage refuses writes', () => {
    const store = new ProgressStore(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      },
      12,
    );
    store.recordScore(900);
    expect(store.current.highScore).toBe(900);
  });

  it('remembers that training was completed', () => {
    const storage = memoryStorage();
    new ProgressStore(storage, 12).completeTraining();
    expect(new ProgressStore(storage, 12).current.trainingDone).toBe(true);
  });

  it('reports a new record only when a level score beats the previous best', () => {
    const storage = memoryStorage();
    const store = new ProgressStore(storage, 12);
    expect(store.recordLevelScore(1, 1500)).toBe(true);
    expect(store.recordLevelScore(1, 1200)).toBe(false);
    expect(store.recordLevelScore(1, 1800)).toBe(true);
    expect(new ProgressStore(storage, 12).current.bestLevelScores).toEqual({ 1: 1800 });
  });

  it('keeps older saves working when new fields are added', () => {
    const old = memoryStorage({ 'deflektor.progress.v1': JSON.stringify({ unlockedLevels: 3, highScore: 10, muted: true }) });
    expect(new ProgressStore(old, 12).current).toMatchObject({ unlockedLevels: 3, trainingDone: false, bestLevelScores: {} });
  });
});
