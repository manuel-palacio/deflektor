import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ProgressStore, SAVE_KEY, SAVE_VERSION } from '../../src/app/progress';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('ProgressStore', () => {
  it('starts with only the first level unlocked and default settings', () => {
    expect(new ProgressStore(memoryStorage(), 12).current).toEqual({
      unlockedLevels: 1,
      highScore: 0,
      trainingDone: false,
      records: {},
      challengeBests: {},
      settings: DEFAULT_SETTINGS,
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

  it('keeps only the best run score', () => {
    const store = new ProgressStore(memoryStorage(), 12);
    store.recordScore(500);
    store.recordScore(200);
    expect(store.current.highScore).toBe(500);
  });

  it('persists audio and display settings between sessions', () => {
    const storage = memoryStorage();
    new ProgressStore(storage, 12).updateSettings({ musicVolume: 0.2, effectsVolume: 0.9, muted: true, highContrast: true });
    expect(new ProgressStore(storage, 12).settings).toMatchObject({
      musicVolume: 0.2,
      effectsVolume: 0.9,
      muted: true,
      highContrast: true,
    });
  });

  it('writes a versioned save', () => {
    const storage = memoryStorage();
    new ProgressStore(storage, 12).completeTraining();
    expect(JSON.parse(storage.values.get(SAVE_KEY)!)).toMatchObject({ version: SAVE_VERSION, trainingDone: true });
  });

  it('counts plays and completions and reports new bests', () => {
    const storage = memoryStorage();
    const store = new ProgressStore(storage, 12);
    store.recordPlay(1);
    store.recordPlay(1);
    expect(store.recordCompletion(1, { score: 1500, seconds: 40, stars: 2 })).toEqual({ score: true, time: true, stars: true });
    expect(store.recordCompletion(1, { score: 1200, seconds: 30, stars: 2 })).toEqual({ score: false, time: true, stars: false });
    expect(new ProgressStore(storage, 12).current.records[1]).toEqual({
      plays: 2,
      completions: 2,
      bestScore: 1500,
      bestSeconds: 30,
      bestStars: 2,
    });
  });

  it('migrates a version 1 save: progress, mute setting and best scores survive', () => {
    const legacy = JSON.stringify({ unlockedLevels: 3, highScore: 10, muted: true, trainingDone: true, bestLevelScores: { 2: 900 } });
    const store = new ProgressStore(memoryStorage({ 'deflektor.progress.v1': legacy }), 12);
    expect(store.current).toMatchObject({
      unlockedLevels: 3,
      highScore: 10,
      trainingDone: true,
      records: { 2: { bestScore: 900, completions: 1 } },
      settings: { ...DEFAULT_SETTINGS, muted: true },
    });
  });

  it('fills in settings added after a save was written', () => {
    const partial = JSON.stringify({ version: 2, unlockedLevels: 2, settings: { musicVolume: 0.1 } });
    expect(new ProgressStore(memoryStorage({ [SAVE_KEY]: partial }), 12).settings).toEqual({
      ...DEFAULT_SETTINGS,
      musicVolume: 0.1,
    });
  });

  it('falls back to defaults when stored data is corrupt', () => {
    const store = new ProgressStore(memoryStorage({ [SAVE_KEY]: '{oops' }), 12);
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

  it('keeps the best score for each challenge seed', () => {
    const storage = memoryStorage();
    const store = new ProgressStore(storage, 12);
    expect(store.recordChallenge('daily-2026-09-24', 900)).toBe(true);
    expect(store.recordChallenge('daily-2026-09-24', 800)).toBe(false);
    expect(new ProgressStore(storage, 12).current.challengeBests).toEqual({ 'daily-2026-09-24': 900 });
  });
});
