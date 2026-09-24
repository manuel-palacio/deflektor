import { App } from './app/App';
import { byId } from './app/dom';
import { ProgressStore } from './app/progress';
import { Sound } from './audio/Sound';
import { LEVELS } from './engine/levels';
import { TRAINING_LEVELS } from './engine/training';
import { formatDiagnostic, validateLevel } from './engine/validation';
import { Renderer } from './render/Renderer';

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
  }
}

/** Refuses to start with broken level data, and says exactly what is wrong. */
function showLevelErrors(): boolean {
  const problems = [...LEVELS, ...TRAINING_LEVELS].flatMap(validateLevel);
  if (problems.length === 0) return false;
  const panel = byId('screen-error');
  byId('error-list').replaceChildren(
    ...problems.map((problem) => Object.assign(document.createElement('li'), { textContent: formatDiagnostic(problem) })),
  );
  panel.hidden = false;
  console.error(problems.map(formatDiagnostic).join('\n'));
  return true;
}

async function boot(): Promise<void> {
  if (showLevelErrors()) return;
  const progress = new ProgressStore(browserStorage(), LEVELS.length);
  const hud = byId('hud');
  const renderer = await Renderer.create(byId('stage'), () => (hud.hidden ? 0 : hud.getBoundingClientRect().height));
  const app = new App(renderer, new Sound(progress.current.muted), progress);
  renderer.onFrame((seconds) => app.frame(seconds));
  app.start();
  if (import.meta.env.DEV) Object.assign(window, { __deflektor: app });
}

void boot();
