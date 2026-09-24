import { App } from './app/App';
import { byId } from './app/dom';
import { ProgressStore } from './app/progress';
import { Sound } from './audio/Sound';
import { LEVELS } from './engine/levels';
import { Renderer } from './render/Renderer';

function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => undefined };
  }
}

async function boot(): Promise<void> {
  const progress = new ProgressStore(browserStorage(), LEVELS.length);
  const hud = byId('hud');
  const renderer = await Renderer.create(byId('stage'), () => (hud.hidden ? 0 : hud.getBoundingClientRect().height));
  const app = new App(renderer, new Sound(progress.current.muted), progress);
  renderer.onFrame((seconds) => app.frame(seconds));
  app.start();
  if (import.meta.env.DEV) Object.assign(window, { __deflektor: app });
}

void boot();
