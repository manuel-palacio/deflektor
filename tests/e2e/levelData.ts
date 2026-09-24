import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { levelsFromFiles } from '../../src/engine/levelFiles';
import type { TrainingLevel } from '../../src/engine/training';
import type { LevelDefinition } from '../../src/engine/types';

/** The same level files the game loads through Vite, read directly for tests running in Node. */
function readLevels<T extends LevelDefinition>(folder: string): T[] {
  const directory = join(process.cwd(), 'levels', folder);
  const files = Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .map((name) => [name, JSON.parse(readFileSync(join(directory, name), 'utf8')) as T]),
  );
  return levelsFromFiles(files);
}

export const LEVELS = readLevels<LevelDefinition>('original');
export const TRAINING_LEVELS = readLevels<TrainingLevel>('training');
