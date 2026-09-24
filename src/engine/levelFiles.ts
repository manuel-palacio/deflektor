import type { LevelDefinition } from './types';

/**
 * Turns a Vite `import.meta.glob` of level JSON files into an ordered list. Files are ordered by
 * name (01.json, 02.json… or 1-mirrors.json…), so adding a level is just adding a file.
 */
export function levelsFromFiles<T extends LevelDefinition>(files: Record<string, T>): T[] {
  return Object.keys(files)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((path) => files[path]);
}
