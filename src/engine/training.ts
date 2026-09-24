import { levelsFromFiles } from './levelFiles';
import type { LevelDefinition } from './types';

/** A training level plus the one-line lesson shown when it starts. */
export interface TrainingLevel extends LevelDefinition {
  lesson: string;
}

/** Five short lessons that introduce one idea each, one JSON file each in levels/training. */
export const TRAINING_LEVELS: TrainingLevel[] = levelsFromFiles(
  import.meta.glob<TrainingLevel>('../../levels/training/*.json', { eager: true, import: 'default' }),
);
