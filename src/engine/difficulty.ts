export type Difficulty = 'relaxed' | 'normal' | 'classic';

export const DIFFICULTIES: readonly Difficulty[] = ['relaxed', 'normal', 'classic'];

/** The rules that make the game easier or harder without changing any level. */
export interface DifficultyRules {
  /** How fast overload builds while the beam sits on a mine or feeds back into the laser. */
  overloadRisePerSecond: number;
  overloadDecayPerSecond: number;
  /** Multiplies every level's energy time. */
  energyScale: number;
}

/*
 * Why no "bigger hit area" setting: beams run on fixed 1:2 and diagonal paths, so a wider target only
 * starts to matter at two thirds of a tile, and at that size cells and mines also shield each other
 * and four of the original levels can no longer be finished. Difficulty therefore only changes time
 * pressure (energy) and forgiveness (overload).
 */

export const DIFFICULTY_RULES: Record<Difficulty, DifficultyRules> = {
  relaxed: { overloadRisePerSecond: 0.3, overloadDecayPerSecond: 0.4, energyScale: 2 },
  normal: { overloadRisePerSecond: 0.45, overloadDecayPerSecond: 0.3, energyScale: 1.4 },
  classic: { overloadRisePerSecond: 0.6, overloadDecayPerSecond: 0.25, energyScale: 1 },
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  relaxed: 'Relaxed',
  normal: 'Normal',
  classic: 'Classic',
};
