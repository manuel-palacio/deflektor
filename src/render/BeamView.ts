import { Container, Graphics, Sprite } from 'pixi.js';
import type { BeamState } from '../engine/beamState';
import type { BeamTrace, Point } from '../engine/types';
import type { BoardLayout } from './layout';
import { mixColor, PALETTE } from './palette';
import { getGlowTexture } from './textures';

const PULSE_SPACING = 0.9;
const PULSE_SPEED = 7;
const REFLECTION_FLASH_SECONDS = 0.35;
const BOOST_SECONDS = 0.3;

/** Colour of the beam in each state; the core stays near-white so the path itself is always readable. */
const STATE_COLOR: Record<BeamState, number> = {
  charging: PALETTE.beam,
  open: PALETTE.beam,
  target: PALETTE.beamTarget,
  mine: PALETTE.beamHot,
  feedback: PALETTE.beamHot,
  blocked: PALETTE.beamBlocked,
  loop: PALETTE.beamLoop,
  locked: PALETTE.beamLocked,
};

export interface BeamStyle {
  /** Fewer layers and no travelling pulses, for slower devices. */
  light: boolean;
  /** Thicker, fully opaque core. */
  highContrast: boolean;
}

/**
 * The laser: a thin bright core over a soft glow, pulses travelling in the direction of the beam,
 * a flash at each new reflection, and an end marker that says what the beam is doing.
 */
export class BeamView {
  readonly container = new Container();
  private readonly strokes = new Graphics();
  private readonly pulses = new Graphics();
  private readonly marks = new Graphics();
  private readonly preview = new Graphics();
  private readonly impact = new Sprite(getGlowTexture());
  private readonly reflections = new Map<string, number>();
  private clock = 0;
  private boost = 0;

  constructor() {
    this.impact.anchor.set(0.5);
    this.impact.blendMode = 'add';
    this.strokes.blendMode = 'add';
    this.pulses.blendMode = 'add';
    this.container.addChild(this.preview, this.strokes, this.pulses, this.marks, this.impact);
  }

  /** Briefly brightens the whole beam (the route changed, or it just locked onto a target). */
  flash(): void {
    this.boost = BOOST_SECONDS;
  }

  /** Returns the pixel where the beam ends, for impact sparks. */
  draw(beam: BeamTrace, layout: BoardLayout, state: BeamState, overload: number, seconds: number, style: BeamStyle): Point {
    this.clock += seconds;
    this.boost = Math.max(0, this.boost - seconds);
    const base = STATE_COLOR[state];
    const color = state === 'open' || state === 'target' ? mixColor(base, PALETTE.beamHot, Math.min(1, overload * 1.3)) : base;
    const paths = beam.paths.map((path) => path.map((point) => layout.beamToPixels(point)));
    const size = layout.tileSize;
    const flicker = state === 'mine' || state === 'feedback' ? 0.7 + Math.abs(Math.sin(this.clock * 18)) * 0.3 : 1;
    const lift = 1 + (this.boost / BOOST_SECONDS) * 0.8;

    this.strokes.clear();
    this.pulses.clear();
    this.marks.clear();
    this.impact.visible = true;
    for (const path of paths) {
      if (!style.light) this.stroke(path, size * 0.26, color, 0.07 * flicker * lift);
      this.stroke(path, size * 0.11, color, 0.3 * flicker * lift);
      this.stroke(path, size * (style.highContrast ? 0.07 : 0.035), mixColor(color, PALETTE.beamCore, 0.8), 1);
      if (!style.light) this.drawPulses(path, size, color);
    }
    this.drawReflections(paths, size, color, seconds);
    const end = paths.at(-1)!.at(-1)!;
    this.drawEndMarker(end, state, size, color);
    this.impact.position.set(end.x, end.y);
    this.impact.tint = color;
    this.impact.width = this.impact.height = size * (0.8 + Math.sin(this.clock * 30) * 0.12) * (state === 'blocked' ? 0.5 : 1);
    return end;
  }

  /** While the laser charges, only a faint flickering guide shows where the beam will go. */
  drawAiming(beam: BeamTrace, layout: BoardLayout, seconds: number): void {
    this.clock += seconds;
    this.strokes.clear();
    this.pulses.clear();
    this.marks.clear();
    this.impact.visible = false;
    const alpha = 0.25 + Math.abs(Math.sin(this.clock * 7)) * 0.25;
    for (const path of beam.paths) {
      const pixels = path.map((point) => layout.beamToPixels(point));
      this.stroke(pixels, layout.tileSize * 0.12, PALETTE.beam, alpha * 0.4);
      this.stroke(pixels, layout.tileSize * 0.03, PALETTE.beamCore, alpha);
    }
  }

  /** A dashed ghost of where the beam would go after the next turn of the hovered mirror. */
  drawPreview(beam: BeamTrace | undefined, layout: BoardLayout): void {
    this.preview.clear();
    if (!beam) return;
    for (const path of beam.paths) {
      const pixels = path.map((point) => layout.beamToPixels(point));
      this.dashed(pixels, layout.tileSize * 0.2, layout.tileSize * 0.14);
    }
    this.preview.stroke({ width: Math.max(1.5, layout.tileSize * 0.035), color: PALETTE.beamCore, alpha: 0.45, cap: 'round' });
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
        this.pulses.circle(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, size * 0.06);
      }
      travelled += length;
    }
    this.pulses.fill({ color: mixColor(color, PALETTE.beamCore, 0.6), alpha: 0.85 });
  }

  /** A glint at every corner of the beam, flaring briefly when a reflection first appears. */
  private drawReflections(paths: Point[][], size: number, color: number, seconds: number): void {
    const seen = new Set<string>();
    for (const path of paths) {
      for (const point of path.slice(1, -1)) {
        const key = `${Math.round(point.x)},${Math.round(point.y)}`;
        seen.add(key);
        const age = (this.reflections.get(key) ?? -seconds) + seconds;
        this.reflections.set(key, age);
        const flare = Math.max(0, 1 - age / REFLECTION_FLASH_SECONDS);
        this.marks.circle(point.x, point.y, size * (0.07 + flare * 0.22)).fill({
          color: mixColor(color, PALETTE.beamCore, 0.7),
          alpha: 0.5 + flare * 0.5,
        });
      }
    }
    for (const key of this.reflections.keys()) if (!seen.has(key)) this.reflections.delete(key);
  }

  private drawEndMarker(end: Point, state: BeamState, size: number, color: number): void {
    if (state === 'target') {
      const radius = size * (0.42 + Math.sin(this.clock * 10) * 0.04);
      this.marks.circle(end.x, end.y, radius).stroke({ width: 2.5, color, alpha: 0.9 });
    } else if (state === 'blocked') {
      const arm = size * 0.14;
      this.marks
        .moveTo(end.x - arm, end.y - arm)
        .lineTo(end.x + arm, end.y + arm)
        .moveTo(end.x + arm, end.y - arm)
        .lineTo(end.x - arm, end.y + arm)
        .stroke({ width: 2.5, color, alpha: 0.9, cap: 'round' });
    } else if (state === 'loop') {
      const radius = size * 0.35;
      for (let dash = 0; dash < 6; dash++) {
        const start = this.clock * 3 + (dash * Math.PI) / 3;
        this.marks.arc(end.x, end.y, radius, start, start + 0.6).stroke({ width: 2.5, color, alpha: 0.9 });
      }
    } else if (state === 'mine' || state === 'feedback') {
      const radius = size * (0.3 + Math.abs(Math.sin(this.clock * 12)) * 0.2);
      this.marks.circle(end.x, end.y, radius).stroke({ width: 3, color, alpha: 0.9 });
    } else if (state === 'locked') {
      this.marks.circle(end.x, end.y, size * 0.3).stroke({ width: 2, color, alpha: 0.8 });
    }
  }

  private dashed(path: Point[], dash: number, gap: number): void {
    for (let index = 1; index < path.length; index++) {
      const from = path[index - 1];
      const to = path[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      for (let start = 0; start < length; start += dash + gap) {
        const end = Math.min(length, start + dash);
        this.preview
          .moveTo(from.x + ((to.x - from.x) * start) / length, from.y + ((to.y - from.y) * start) / length)
          .lineTo(from.x + ((to.x - from.x) * end) / length, from.y + ((to.y - from.y) * end) / length);
      }
    }
  }
}
