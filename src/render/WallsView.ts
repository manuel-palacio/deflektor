import { Container, Graphics } from 'pixi.js';
import type { Point, WallKind } from '../engine/types';
import type { BoardLayout } from './layout';
import { PALETTE } from './palette';

const GATE_FADE_SECONDS = 0.6;

/** Quarter-tile bricks: purple reflectors, light-blue absorbers and the gates that guard the receiver. */
export class WallsView {
  readonly container = new Container();
  private readonly solid = new Graphics();
  private readonly gates = new Graphics();
  private gateCenters: Point[] = [];
  private gateFade = 0;
  private clock = 0;

  constructor() {
    this.container.addChild(this.solid, this.gates);
  }

  build(walls: WallKind[][], layout: BoardLayout): void {
    this.solid.clear();
    this.gates.clear();
    this.gates.alpha = 1;
    this.gateFade = 0;
    this.gateCenters = [];
    const brick = layout.tileSize / 2;
    walls.forEach((row, qy) =>
      row.forEach((wall, qx) => {
        if (wall === 'none') return;
        const x = layout.originX + qx * brick;
        const y = layout.originY + qy * brick;
        if (wall === 'gate') {
          drawBrick(this.gates, x, y, brick, PALETTE.gateFill, PALETTE.gateEdge);
          this.gateCenters.push({ x: x + brick / 2, y: y + brick / 2 });
        } else if (wall === 'reflect') {
          drawBrick(this.solid, x, y, brick, PALETTE.reflectorFill, PALETTE.reflectorEdge);
        } else {
          drawBrick(this.solid, x, y, brick, PALETTE.absorberFill, PALETTE.absorberEdge);
        }
      }),
    );
  }

  /** Starts dissolving the gates; returns where they were, for particles. */
  openGates(): Point[] {
    this.gateFade = GATE_FADE_SECONDS;
    return this.gateCenters;
  }

  update(seconds: number): void {
    this.clock += seconds;
    if (this.gateFade > 0) {
      this.gateFade = Math.max(0, this.gateFade - seconds);
      this.gates.alpha = this.gateFade / GATE_FADE_SECONDS;
      if (this.gateFade === 0) this.gates.clear();
    } else if (this.gateCenters.length > 0 && this.gates.alpha > 0) {
      this.gates.alpha = 0.75 + Math.sin(this.clock * 3) * 0.25;
    }
  }
}

function drawBrick(graphics: Graphics, x: number, y: number, size: number, fill: number, edge: number): void {
  const inset = Math.max(1, size * 0.1);
  const width = size - inset * 1.5;
  graphics
    .roundRect(x + inset, y + inset, width, width, size * 0.12)
    .fill(fill)
    .roundRect(x + inset, y + inset, width, width, size * 0.12)
    .stroke({ width: 1.2, color: edge, alpha: 0.95 })
    .moveTo(x + inset * 2, y + inset * 2)
    .lineTo(x + inset + width * 0.7, y + inset * 2)
    .stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
}
