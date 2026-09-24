import type { LevelDefinition } from './types';

/** A training level plus the one-line lesson shown when it starts. */
export interface TrainingLevel extends LevelDefinition {
  lesson: string;
}

const NO_WALLS = Array.from({ length: 18 }, () => '..............................');

/** Five short lessons that introduce one idea each, before the original levels. */
export const TRAINING_LEVELS: TrainingLevel[] = [
  {
    name: 'Mirrors',
    lesson: 'Turn the mirror to aim the laser at the pink cell.',
    emitter: 'right',
    energySeconds: 240,
    tiles: [
      '...............',
      '.......o.......',
      '...............',
      '...............',
      'E......8.......',
      '...............',
      '...............',
      '.......R.......',
      '...............',
    ],
    walls: NO_WALLS,
  },
  {
    name: 'Chains',
    lesson: 'Mirrors pass the beam along. Line them up one after another.',
    emitter: 'right',
    energySeconds: 240,
    tiles: [
      '...............',
      'E...0.....o....',
      '...............',
      '...............',
      '...............',
      '...............',
      '.o..4.....c...R',
      '...............',
      '...............',
    ],
    walls: NO_WALLS,
  },
  {
    name: 'Walls',
    lesson: 'Purple bricks bounce the beam. Blue bricks swallow it.',
    emitter: 'right',
    energySeconds: 240,
    tiles: [
      '###############',
      '...............',
      '..........o....',
      '...............',
      'E....8.=....+++',
      '.......=....+R+',
      '............+++',
      '...............',
      '...............',
    ],
  },
  {
    name: 'Danger',
    lesson: 'Keep the beam off mines, and never send it back into the laser.',
    emitter: 'right',
    energySeconds: 240,
    tiles: [
      '...............',
      '...o.....R.....',
      '...............',
      '...............',
      'E..8..x........',
      '...............',
      '...............',
      '...o...........',
      '...............',
    ],
    walls: NO_WALLS,
  },
  {
    name: 'Moving parts',
    lesson: 'Striped polarisers turn by themselves: wait until they line up. Prisms scatter the beam at random.',
    emitter: 'right',
    energySeconds: 240,
    tiles: [
      '...............',
      '...........o...',
      '...............',
      '...............',
      'E...p...o..*..o',
      '...............',
      '...............',
      '...........o...',
      '...........R...',
    ],
    walls: NO_WALLS,
  },
];
