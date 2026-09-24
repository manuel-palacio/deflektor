import { levelsFromFiles } from './levelFiles';
import type { LevelDefinition } from './types';

/** The original C64 levels, one JSON file each in levels/original (see scripts/extract_levels.py). */
export const LEVELS: LevelDefinition[] = levelsFromFiles(
  import.meta.glob<LevelDefinition>('../../levels/original/*.json', { eager: true, import: 'default' }),
);
