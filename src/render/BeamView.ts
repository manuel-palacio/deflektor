import { Container, Graphics, Sprite } from 'pixi.js';
import type { BeamTrace, Point } from '../engine/types';
import type { BoardLayout } from './layout';
import { mixColor, PALETTE } from './palette';
import { getGlowTexture } from './textures';

const PULSE_SPACING = 0.9;
const PULSE_SPEED = 7;

/** The laser: layered glow strokes, travelling energy pulses and a hot impact point. */
export class BeamView {
  readonly container = new Container();
  private readonly strokes = new Graphics();
  private readonly pulses = new Graphics();
  private readonly impact = new Sprite(getGlowTexture());
  private clock = 0;

  constructor() {
    this.impact.anchor.set(0.5);
    this.impact.blendMode = 'add';
    this.strokes.blendMode = 'add';
    this.pulses.blendMode = 'add';
    this.container.addChild(this.strokes, this.pulses, this.impact);
  }

  /** Returns the pixel where the beam ends, for impact sparks. */
  draw(beam: BeamTrace, layout: BoardLayout, overload: number, seconds: number): Point {
    this.clock += seconds;
    const color = mixColor(PALETTE.beam, PALETTE.beamHot, Math.min(1, overload * 1.3));
    const paths = beam.paths.map((path) => path.map((point) => layout.beamToPixels(point)));
    const size = layout.tileSize;
    const flicker = 0.88 + Math.sin(this.clock * 53) * 0.06 + Math.sin(this.clock * 17) * 0.06;

    this.strokes.clear();
    this.pulses.clear();
    this.impact.visible = true;
    for (const path of paths) {
      this.stroke(path, size * 0.34, color, 0.1 * flicker);
      this.stroke(path, size * 0.16, color, 0.35 * flicker);
      this.stroke(path, size * 0.05, PALETTE.beamCore, 0.95);
      this.drawPulses(path, size, color);
    }

    const end = paths.at(-1)!.at(-1)!;
    this.impact.position.set(end.x, end.y);
    this.impact.tint = color;
    this.impact.width = this.impact.height = size * (0.9 + Math.sin(this.clock * 30) * 0.15);
    return end;
  }

  /** While the laser charges, only a faint flickering guide shows where the beam will go. */
  drawAiming(beam: BeamTrace, layout: BoardLayout, seconds: number): void {
    this.clock += seconds;
    this.strokes.clear();
    this.pulses.clear();
    this.impact.visible = false;
    const alpha = 0.25 + Math.abs(Math.sin(this.clock * 7)) * 0.25;
    for (const path of beam.paths) {
      const pixels = path.map((point) => layout.beamToPixels(point));
      this.stroke(pixels, layout.tileSize * 0.12, PALETTE.beam, alpha * 0.4);
      this.stroke(pixels, layout.tileSize * 0.03, PALETTE.beamCore, alpha);
    }
  }

  private stroke(path: Point[], width: number, color: number, alpha: number): void {
    if (path.length < 2) return;
    this.strokes.moveTo(path[0].x, path[0].y);
    for (const point of path.slice(1)) this.strokes.lineTo(point.x, point.y);
    this.strokes.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  }

  private drawPulses(path: Point[], size: number, color: number): void {
    const spacing = size * PULSE_SPACING;
    let travelled = 0;
    const offset = (this.clock * PULSE_SPEED * size) % spacing;
    for (let index = 1; index < path.length; index++) {
      const from = path[index - 1];
      const to = path[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      let next = Math.ceil((travelled - offset) / spacing) * spacing + offset;
      for (; next < travelled + length; next += spacing) {
        const t = (next - travelled) / length;
        this.pulses.circle(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, size * 0.07);
      }
      travelled += length;
    }
    this.pulses.fill({ color: mixColor(color, PALETTE.beamCore, 0.6), alpha: 0.9 });
  }
}
