export type Quality = 'auto' | 'high' | 'low';

export interface Settings {
  muted: boolean;
  /** 0..1 */
  musicVolume: number;
  /** 0..1 */
  effectsVolume: number;
  reducedMotion: boolean;
  highContrast: boolean;
  /** Contextual tips while playing. */
  hints: boolean;
  quality: Quality;
}

/** The player's history on one level. */
export interface LevelRecord {
  plays: number;
  completions: number;
  bestScore?: number;
  bestSeconds?: number;
  bestStars?: number;
}

export interface Progress {
  /** Number of levels the player may start from (always at least 1). */
  unlockedLevels: number;
  highScore: number;
  trainingDone: boolean;
  /** Keyed by level number (1-based). */
  records: Record<number, LevelRecord>;
  settings: Settings;
}

export interface CompletionResult {
  score: number;
  seconds: number;
  stars: number;
}

/** Which parts of a completion beat the previous best. */
export interface NewRecords {
  score: boolean;
  time: boolean;
  stars: boolean;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const SAVE_KEY = 'deflektor.save';
export const SAVE_VERSION = 2;
const LEGACY_V1_KEY = 'deflektor.progress.v1';

export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  musicVolume: 0.6,
  effectsVolume: 0.8,
  reducedMotion: false,
  highContrast: false,
  hints: true,
  quality: 'auto',
};

const DEFAULT_PROGRESS: Progress = {
  unlockedLevels: 1,
  highScore: 0,
  trainingDone: false,
  records: {},
  settings: DEFAULT_SETTINGS,
};

/**
 * Persists progress, records and settings as a versioned save, migrating older saves forward.
 * Storage failures (private mode, quota) degrade to an in-memory session.
 */
export class ProgressStore {
  private progress: Progress;

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly levelCount: number,
  ) {
    this.progress = this.read();
  }

  get current(): Progress {
    return structuredClone(this.progress);
  }

  get settings(): Settings {
    return { ...this.progress.settings };
  }

  unlockLevelAfter(levelIndex: number): void {
    const unlocked = Math.min(this.levelCount, levelIndex + 2);
    if (unlocked > this.progress.unlockedLevels) this.save({ unlockedLevels: unlocked });
  }

  recordScore(score: number): void {
    if (score > this.progress.highScore) this.save({ highScore: score });
  }

  completeTraining(): void {
    this.save({ trainingDone: true });
  }

  updateSettings(changes: Partial<Settings>): void {
    this.save({ settings: { ...this.progress.settings, ...changes } });
  }

  recordPlay(levelNumber: number): void {
    const record = this.record(levelNumber);
    this.saveRecord(levelNumber, { ...record, plays: record.plays + 1 });
  }

  /** Stores a completed level and reports which results are new bests. */
  recordCompletion(levelNumber: number, result: CompletionResult): NewRecords {
    const record = this.record(levelNumber);
    const newRecords = {
      score: record.bestScore === undefined || result.score > record.bestScore,
      time: record.bestSeconds === undefined || result.seconds < record.bestSeconds,
      stars: record.bestStars === undefined || result.stars > record.bestStars,
    };
    this.saveRecord(levelNumber, {
      plays: record.plays,
      completions: record.completions + 1,
      bestScore: newRecords.score ? result.score : record.bestScore,
      bestSeconds: newRecords.time ? result.seconds : record.bestSeconds,
      bestStars: newRecords.stars ? result.stars : record.bestStars,
    });
    return newRecords;
  }

  private record(levelNumber: number): LevelRecord {
    return this.progress.records[levelNumber] ?? { plays: 0, completions: 0 };
  }

  private saveRecord(levelNumber: number, record: LevelRecord): void {
    this.save({ records: { ...this.progress.records, [levelNumber]: record } });
  }

  private read(): Progress {
    const current = this.parse(SAVE_KEY);
    if (current) return migrate(current);
    const legacy = this.parse(LEGACY_V1_KEY);
    if (legacy) return migrate({ ...legacy, version: 1 });
    return structuredClone(DEFAULT_PROGRESS);
  }

  private parse(key: string): Record<string, unknown> | undefined {
    try {
      const raw = this.storage.getItem(key);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  private save(changes: Partial<Progress>): void {
    this.progress = { ...this.progress, ...changes };
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, ...this.progress }));
    } catch {
      // Progress still lives for this session.
    }
  }
}

/**
 * Upgrades any older save shape to the current one, filling in anything missing with defaults.
 * v1 kept `muted` at the top level and best scores as `bestLevelScores`.
 */
export function migrate(saved: Record<string, unknown>): Progress {
  const version = typeof saved.version === 'number' ? saved.version : 1;
  const base = { ...DEFAULT_PROGRESS, ...(saved as Partial<Progress>) };
  const settings = { ...DEFAULT_SETTINGS, ...((saved.settings as Partial<Settings>) ?? {}) };
  let records = (saved.records as Record<number, LevelRecord>) ?? {};
  if (version < 2) {
    if (typeof saved.muted === 'boolean') settings.muted = saved.muted;
    const bestScores = (saved.bestLevelScores as Record<number, number>) ?? {};
    records = Object.fromEntries(
      Object.entries(bestScores).map(([level, score]) => [level, { plays: 0, completions: 1, bestScore: score }]),
    );
  }
  return {
    unlockedLevels: Math.max(1, Number(base.unlockedLevels) || 1),
    highScore: Number(base.highScore) || 0,
    trainingDone: Boolean(base.trainingDone),
    records,
    settings,
  };
}
