export interface Progress {
  /** Number of levels the player may start from (always at least 1). */
  unlockedLevels: number;
  highScore: number;
  muted: boolean;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'deflektor.progress.v1';
const DEFAULT_PROGRESS: Progress = { unlockedLevels: 1, highScore: 0, muted: false };

/** Persists campaign progress. Storage failures (private mode, quota) degrade to an in-memory session. */
export class ProgressStore {
  private progress: Progress;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly levelCount: number,
  ) {
    this.progress = this.read();
  }

  get current(): Progress {
    return { ...this.progress };
  }

  unlockLevelAfter(levelIndex: number): void {
    const unlocked = Math.min(this.levelCount, levelIndex + 2);
    if (unlocked > this.progress.unlockedLevels) this.save({ unlockedLevels: unlocked });
  }

  recordScore(score: number): void {
    if (score > this.progress.highScore) this.save({ highScore: score });
  }

  setMuted(muted: boolean): void {
    this.save({ muted });
  }

  private read(): Progress {
    try {
      const stored = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '{}') as Partial<Progress>;
      return { ...DEFAULT_PROGRESS, ...stored };
    } catch {
      return { ...DEFAULT_PROGRESS };
    }
  }

  private save(changes: Partial<Progress>): void {
    this.progress = { ...this.progress, ...changes };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    } catch {
      // Progress still lives for this session.
    }
  }
}
