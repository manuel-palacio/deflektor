import type { LevelStats, LifeLostReason } from '../engine/game';
import { RULES } from '../engine/game';
import type { Par, Stars } from '../engine/scoring';
import type { NewRecords } from './progress';

export interface LineItem {
  label: string;
  value: string;
  /** Marks a value that beat the player's previous best. */
  record?: boolean;
}

export interface LevelSummary {
  title: string;
  stars: Stars;
  lines: LineItem[];
  /** A short phrase for the new bests, if any. */
  recordNote?: string;
}

export interface FailureSummary {
  title: string;
  explanation: string;
  advice: string;
}

/** The score breakdown and ratings shown when a level is solved. */
export function summarizeLevel(
  stats: LevelStats,
  bonus: number,
  par: Par,
  stars: Stars,
  records: NewRecords,
): LevelSummary {
  const cells = stats.podsDestroyed * RULES.podScore;
  const bests = [records.score && 'score', records.time && 'time', records.stars && 'stars'].filter(Boolean);
  return {
    title: 'Level complete',
    stars,
    lines: [
      { label: 'Cells', value: `+${format(cells)}` },
      { label: 'Energy bonus', value: `+${format(bonus)}` },
      { label: 'Level score', value: format(cells + bonus), record: records.score },
      { label: 'Time', value: `${formatSeconds(stats.seconds)} / par ${formatSeconds(par.seconds)}`, record: records.time },
      { label: 'Turns', value: `${stats.rotations} / par ${par.rotations}` },
    ],
    recordNote: bests.length ? `New best ${bests.join(', ')}!` : undefined,
  };
}

/** Why the laser failed, in words, with a nudge towards what to try next. */
export function explainFailure(reason: LifeLostReason): FailureSummary {
  switch (reason) {
    case 'mine':
      return {
        title: 'Mine overload',
        explanation: 'The beam stayed on a mine until the laser overloaded.',
        advice: 'Sweep past mines quickly, or turn an earlier mirror so the beam never crosses them.',
      };
    case 'feedback':
      return {
        title: 'Feedback overload',
        explanation: 'The beam was reflected straight back into the laser until it overloaded.',
        advice: 'When a mirror sends the beam back the way it came, keep turning: the next step points elsewhere.',
      };
    case 'energy':
      return {
        title: 'Out of energy',
        explanation: 'The laser ran dry before the level was cleared.',
        advice: 'Plan the route while the laser charges, and take the shortest way to each cell.',
      };
    case 'time':
      return {
        title: 'Out of time',
        explanation: 'This is a timed challenge, and the clock ran out.',
        advice: 'Use the charging time to plan, and go for the cells nearest the beam first.',
      };
  }
}

export function starText(stars: Stars): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

export function format(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatSeconds(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
