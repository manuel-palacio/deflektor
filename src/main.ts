import { App } from './app/App';
import { byId } from './app/dom';
import { ProgressStore, SAVE_KEY } from './app/progress';
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

/** Development only: /?editor opens the level editor instead of the game. */
async function bootEditor(): Promise<void> {
  const { Editor, PLAYTEST_KEY } = await import('./editor/Editor');
  document.body.classList.add('editing');
  new Editor(document.body, browserStorage(), (level) => {
    sessionStorage.setItem(PLAYTEST_KEY, JSON.stringify(level));
    window.location.href = '/?playtest';
  });
}

async function boot(): Promise<void> {
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('editor')) {
    await bootEditor();
    return;
  }
  if (showLevelErrors()) return;
  const storage = browserStorage();
  const firstVisit = storage.getItem(SAVE_KEY) === null;
  const progress = new ProgressStore(storage, LEVELS.length);
  // Respect the system's reduced-motion preference until the player chooses otherwise.
  if (firstVisit && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    progress.updateSettings({ reducedMotion: true });
  }
  const hud = byId('hud');
  const touchBar = byId('touch-controls');
  // The touch bar sits along the bottom, or as a column on the right on short (landscape) screens.
  const barBox = () => (touchBar.hidden ? undefined : touchBar.getBoundingClientRect());
  const barIsColumn = () => {
    const box = barBox();
    return box !== undefined && box.height > box.width;
  };
  const renderer = await Renderer.create(
    byId('stage'),
    () => (hud.hidden ? 0 : hud.getBoundingClientRect().height),
    () => (barBox() && !barIsColumn() ? barBox()!.height : 0),
    () => (barBox() && barIsColumn() ? barBox()!.width : 0),
  );
  const app = new App(renderer, new Sound(progress.settings), progress);
  renderer.onFrame((seconds) => app.frame(seconds));
  app.start();
  if (import.meta.env.DEV) Object.assign(window, { __deflektor: app });
}

void boot();
