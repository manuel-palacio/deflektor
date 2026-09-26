import type { Point } from '../engine/types';
import type { ControlTarget } from './Controls';
import { playerMirrors, startingMirror } from './cursor';
import { rotationTowards, stepsBetween } from './dial';

const DRAG_THRESHOLD_PX = 10;
/** Only the ↺ / ↻ buttons repeat while held; tapping a mirror is always exactly one step. */
const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 150;
/** A tap within this many tiles of a mirror's centre selects it: fingers are bigger than tiles. */
const SNAP_RADIUS_TILES = 1.5;

/** Shared with the keyboard controls: which mirror is selected. */
export interface Selection {
  cursor?: Point;
}

interface Press {
  pointerId: number;
  tile: Point;
  start: Point;
  dialling: boolean;
}

/**
 * Touch play: tap near a mirror to select it (no accidental turns), then turn it with the big
 * ↺ / ↻ buttons (which repeat while held), by tapping its left or right half (one step per tap), or by
 * dragging around it like a dial.
 */
export class TouchControls {
  private press?: Press;
  private holdTimer?: number;
  private repeatTimer?: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly target: ControlTarget,
    private readonly selection: Selection,
  ) {
    canvas.addEventListener('pointerdown', (event) => this.onDown(event));
    canvas.addEventListener('pointermove', (event) => this.onMove(event));
    canvas.addEventListener('pointerup', (event) => this.onUp(event));
    canvas.addEventListener('pointercancel', () => this.cancel());
    this.bindButton('touch-ccw', () => this.turnSelected(-1));
    this.bindButton('touch-cw', () => this.turnSelected(1));
    this.bindButton('touch-prev', () => this.cycle(-1), false);
    this.bindButton('touch-next', () => this.cycle(1), false);
    // Whatever element the finger is lifted over (or if the app loses focus), stop any repeat.
    for (const type of ['pointerup', 'pointercancel'] as const) window.addEventListener(type, () => this.cancel());
    window.addEventListener('blur', () => this.cancel());
    document.addEventListener('visibilitychange', () => this.cancel());
  }

  private onDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' || !this.target.isPlaying()) return;
    const tile = this.nearestMirror(this.canvasPoint(event));
    if (!tile) return;
    event.preventDefault();
    const alreadySelected = this.selection.cursor?.x === tile.x && this.selection.cursor?.y === tile.y;
    this.selection.cursor = tile;
    if (!alreadySelected) return;
    try {
      // Keeps moves and the lift coming to the canvas even if the finger strays off it.
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // The browser may refuse (e.g. the pointer is already gone); the window-level stop still applies.
    }
    this.press = { pointerId: event.pointerId, tile, start: this.canvasPoint(event), dialling: false };
  }

  private onMove(event: PointerEvent): void {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    const point = this.canvasPoint(event);
    if (!press.dialling && Math.hypot(point.x - press.start.x, point.y - press.start.y) < DRAG_THRESHOLD_PX) return;
    press.dialling = true;
    this.dialTo(press.tile, point);
  }

  private onUp(event: PointerEvent): void {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    if (!press.dialling) this.target.rotate(press.tile, this.halfSteps(event, press.tile));
    this.cancel();
  }

  private cancel(): void {
    this.stopTimers();
    this.press = undefined;
  }

  /** Turns the mirror one step at a time until its plate points along the finger. */
  private dialTo(tile: Point, finger: Point): void {
    const center = this.target.tileCenterOnScreen(tile);
    const offset = this.target.screenDirectionToBoard({ x: finger.x - center.x, y: finger.y - center.y });
    const mirror = this.target.board().tiles[tile.y][tile.x];
    if (mirror.kind !== 'mirror' && mirror.kind !== 'oneWay') return;
    const steps = stepsBetween(mirror.rotation, rotationTowards(offset));
    for (let step = 0; step < Math.abs(steps); step++) this.target.rotate(tile, Math.sign(steps));
  }

  /** Right half of the mirror turns it clockwise, left half back. */
  private halfSteps(event: PointerEvent, tile: Point): number {
    return this.canvasPoint(event).x < this.target.tileCenterOnScreen(tile).x ? -1 : 1;
  }

  private turnSelected(steps: number): void {
    if (!this.target.isPlaying()) return;
    this.selection.cursor ??= startingMirror(this.target.board());
    if (this.selection.cursor) this.target.rotate(this.selection.cursor, steps);
  }

  /** Steps the selection through the player's mirrors in reading order. */
  private cycle(direction: number): void {
    if (!this.target.isPlaying()) return;
    const mirrors = playerMirrors(this.target.board());
    if (mirrors.length === 0) return;
    const current = mirrors.findIndex((tile) => tile.x === this.selection.cursor?.x && tile.y === this.selection.cursor?.y);
    const next = current === -1 ? 0 : (current + direction + mirrors.length) % mirrors.length;
    this.selection.cursor = mirrors[next];
  }

  private nearestMirror(point: Point): Point | undefined {
    const tileSize = this.tilePixels();
    let best: Point | undefined;
    let bestDistance = SNAP_RADIUS_TILES * tileSize;
    for (const tile of playerMirrors(this.target.board())) {
      const center = this.target.tileCenterOnScreen(tile);
      const distance = Math.hypot(center.x - point.x, center.y - point.y);
      if (distance <= bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
    return best;
  }

  private tilePixels(): number {
    const a = this.target.tileCenterOnScreen({ x: 0, y: 0 });
    const b = this.target.tileCenterOnScreen({ x: 1, y: 0 });
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private canvasPoint(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /** Big bar buttons: turning repeats while held; selecting steps once per press. */
  private bindButton(id: string, action: () => void, repeat = true): void {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      action();
      if (!repeat) return;
      this.stopTimers();
      this.holdTimer = window.setTimeout(() => {
        this.repeatTimer = window.setInterval(action, HOLD_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      button.addEventListener(type, () => this.stopTimers());
    }
    // Keyboard and screen-reader activation (no pointer events).
    button.addEventListener('click', (event) => {
      if ((event as PointerEvent).pointerType === '' || event.detail === 0) action();
    });
  }

  private stopTimers(): void {
    window.clearTimeout(this.holdTimer);
    window.clearInterval(this.repeatTimer);
  }
}
