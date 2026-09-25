import type { Board, Point } from '../engine/types';
import { isPlayerTurnable, mirrorInDirection, startingMirror } from './cursor';

const HOLD_DELAY_MS = 280;
const HOLD_INTERVAL_MS = 70;

const CURSOR_KEYS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};
const CLOCKWISE_KEYS = new Set(['Space', 'KeyX', 'Enter']);
const COUNTER_CLOCKWISE_KEYS = new Set(['KeyZ']);

export interface ControlTarget {
  isPlaying(): boolean;
  board(): Board;
  /** The tile under a point on the canvas (the board may be drawn rotated). */
  tileAtScreen(point: Point): Point | undefined;
  /** Where a tile's centre is on the canvas. */
  tileCenterOnScreen(tile: Point): Point;
  /** Maps an on-screen direction to the board's axes. */
  screenDirectionToBoard(step: Point): Point;
  rotate(tile: Point, steps: number): void;
  /** The player mirror under the pointer, or undefined when the pointer leaves it. */
  hover(tile: Point | undefined): void;
  undo(): void;
  redo(): void;
  hint(): void;
  restart(): void;
  togglePause(): void;
  toggleMute(): void;
}

/** Fires an action once, then repeatedly while held. */
class HoldRepeater {
  private delayTimer?: number;
  private repeatTimer?: number;

  start(action: () => void): void {
    this.stop();
    action();
    this.delayTimer = window.setTimeout(() => {
      this.repeatTimer = window.setInterval(action, HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  }

  stop(): void {
    window.clearTimeout(this.delayTimer);
    window.clearInterval(this.repeatTimer);
  }
}

/** Mouse/touch on mirrors plus an original-style keyboard cursor that hops between mirrors. */
export class Controls {
  cursor?: Point;
  private readonly repeater = new HoldRepeater();
  private heldKey?: string;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly target: ControlTarget,
  ) {
    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      canvas.addEventListener(type, () => this.repeater.stop());
    }
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerleave', () => this.setHover(undefined));
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
  }

  resetCursor(): void {
    this.cursor = undefined;
    this.repeater.stop();
  }

  private onPointerDown(event: PointerEvent): void {
    const tile = this.playerMirrorAt(event);
    if (!tile) return;
    event.preventDefault();
    this.cursor = tile;
    const steps = event.pointerType === 'mouse' ? (event.button === 2 ? -1 : 1) : this.touchSteps(event, tile);
    this.repeater.start(() => this.target.rotate(tile, steps));
  }

  /** Touch has no right button: the right half of a mirror turns it clockwise, the left half back. */
  private touchSteps(event: PointerEvent, tile: Point): number {
    const bounds = this.canvas.getBoundingClientRect();
    const center = this.target.tileCenterOnScreen(tile);
    return event.clientX - bounds.left < center.x ? -1 : 1;
  }

  private onWheel(event: WheelEvent): void {
    const tile = this.playerMirrorAt(event);
    if (!tile) return;
    event.preventDefault();
    this.cursor = tile;
    this.target.rotate(tile, event.deltaY > 0 ? 1 : -1);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.onShortcut(event)) return;
    if (event.code === 'Escape' || event.code === 'KeyP') {
      this.target.togglePause();
      return;
    }
    if (event.code === 'KeyM') {
      this.target.toggleMute();
      return;
    }
    if (!this.target.isPlaying()) return;
    if (event.code in CURSOR_KEYS) {
      event.preventDefault();
      this.moveCursor(this.target.screenDirectionToBoard(CURSOR_KEYS[event.code]));
    } else if (CLOCKWISE_KEYS.has(event.code) || COUNTER_CLOCKWISE_KEYS.has(event.code)) {
      event.preventDefault();
      if (event.repeat) return;
      this.startKeyRotation(event.code);
    }
  }

  /** Undo/redo/hint/restart; returns true when the key was handled. */
  private onShortcut(event: KeyboardEvent): boolean {
    if (!this.target.isPlaying()) return false;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) this.target.redo();
      else this.target.undo();
      return true;
    }
    if (command && event.code === 'KeyY') {
      event.preventDefault();
      this.target.redo();
      return true;
    }
    if (command || event.altKey) return false;
    if (event.code === 'KeyH') this.target.hint();
    else if (event.code === 'KeyR') this.target.restart();
    else return false;
    return true;
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    this.setHover(this.playerMirrorAt(event));
  }

  private setHover(tile: Point | undefined): void {
    this.canvas.style.cursor = tile ? 'pointer' : '';
    this.target.hover(tile);
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.code === this.heldKey) {
      this.repeater.stop();
      this.heldKey = undefined;
    }
  }

  private moveCursor(step: Point): void {
    const board = this.target.board();
    if (!this.cursor) {
      this.cursor = startingMirror(board);
      return;
    }
    this.cursor = mirrorInDirection(board, this.cursor, step) ?? this.cursor;
  }

  private startKeyRotation(code: string): void {
    this.cursor ??= startingMirror(this.target.board());
    const tile = this.cursor;
    if (!tile) return;
    const steps = COUNTER_CLOCKWISE_KEYS.has(code) ? -1 : 1;
    this.heldKey = code;
    this.repeater.start(() => this.target.rotate(tile, steps));
  }

  private playerMirrorAt(event: MouseEvent): Point | undefined {
    if (!this.target.isPlaying()) return undefined;
    const bounds = this.canvas.getBoundingClientRect();
    const tile = this.target.tileAtScreen({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    if (!tile) return undefined;
    return isPlayerTurnable(this.target.board().tiles[tile.y][tile.x]) ? tile : undefined;
  }
}
