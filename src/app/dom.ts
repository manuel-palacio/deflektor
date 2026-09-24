export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

export function onClick(id: string, handler: () => void): void {
  byId(id).addEventListener('click', handler);
}
