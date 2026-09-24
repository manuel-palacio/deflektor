import type { Board, Point } from '../engine/types';
import type { BoardLayout } from '../render/layout';
import { mirrorInDirection, startingMirror } from './cursor';

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
  layout(): BoardLayout;
  rotate(tile: Point, steps: number): void;
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
    const steps = event.button === 2 ? -1 : 1;
    this.repeater.start(() => this.target.rotate(tile, steps));
  }

  private onWheel(event: WheelEvent): void {
    const tile = this.playerMirrorAt(event);
    if (!tile) return;
    event.preventDefault();
    this.cursor = tile;
    this.target.rotate(tile, event.deltaY > 0 ? 1 : -1);
  }

  private onKeyDown(event: KeyboardEvent): void {
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
      this.moveCursor(CURSOR_KEYS[event.code]);
    } else if (CLOCKWISE_KEYS.has(event.code) || COUNTER_CLOCKWISE_KEYS.has(event.code)) {
      event.preventDefault();
      if (event.repeat) return;
      this.startKeyRotation(event.code);
    }
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
    const tile = this.target.layout().tileAtPixel({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    if (!tile) return undefined;
    const piece = this.target.board().tiles[tile.y][tile.x];
    return piece.kind === 'mirror' && !piece.auto ? tile : undefined;
  }
}
