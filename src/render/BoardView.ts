import { Container, Graphics, Sprite } from 'pixi.js';
import { directionAngle } from '../engine/beam';
import type { Game } from '../engine/game';
import type { Board, Point, Tile } from '../engine/types';
import type { BoardLayout } from './layout';
import { mirrorPlateRotation, nearestPlateAngle } from './mirrorAngle';
import { PALETTE } from './palette';
import { getGlowTexture } from './textures';
import { WallsView } from './WallsView';

const TURN_SPEED = 18;

/** A piece whose rotation eases toward the engine's state (mirrors, polarisers, refractor glints). */
interface TurningPiece {
  node: Container;
  displayed: number;
  target: (tile: Tile) => number;
  /** Half-turn symmetric pieces (plates, stripes) may take the shorter way round. */
  symmetric: boolean;
}

interface PulsingPiece {
  node: Container;
  phase: number;
}

/** Draws the board. Static pieces are baked once per level; moving parts ease toward the engine's state. */
export class BoardView {
  readonly container = new Container();
  private readonly base = new Container();
  private readonly walls = new WallsView();
  private readonly pieces = new Container();
  private readonly turning = new Map<string, TurningPiece>();
  private readonly pods = new Map<string, PulsingPiece>();
  private readonly mines = new Map<string, PulsingPiece>();
  private receiver?: { ring: Graphics; glow: Sprite };
  private readonly cursor = new Graphics();
  private layout!: BoardLayout;
  private clock = 0;

  constructor() {
    this.container.addChild(this.base, this.walls.container, this.pieces, this.cursor);
  }

  build(board: Board, layout: BoardLayout): void {
    this.layout = layout;
    for (const child of [...this.base.removeChildren(), ...this.pieces.removeChildren()]) {
      child.destroy({ children: true });
    }
    this.receiver = undefined;
    this.turning.clear();
    this.pods.clear();
    this.mines.clear();
    this.base.addChild(this.drawBoardBase());
    this.walls.build(board.walls, layout);
    board.tiles.forEach((row, y) => row.forEach((tile, x) => this.addTile(tile, { x, y })));
  }

  update(game: Game, seconds: number, cursorTile?: Point): void {
    this.clock += seconds;
    this.walls.update(seconds);
    this.animateTurning(game.board, seconds);
    this.animatePods();
    this.animateMines(game.beam.end.kind === 'mine' ? game.beam.end.tile : undefined);
    this.animateReceiver(game.receiverOpen);
    this.drawCursor(cursorTile);
  }

  removePod(tile: Point): void {
    const pod = this.pods.get(key(tile));
    if (!pod) return;
    pod.node.destroy({ children: true });
    this.pods.delete(key(tile));
  }

  /** Dissolves the receiver's gates; returns their positions for particles. */
  openGates(): Point[] {
    return this.walls.openGates();
  }

  private drawBoardBase(): Graphics {
    const { originX, originY, boardWidth, boardHeight, tileSize } = this.layout;
    const base = new Graphics();
    base.roundRect(originX - 6, originY - 6, boardWidth + 12, boardHeight + 12, 10).fill(PALETTE.boardFill);
    for (let column = 1; column < 15; column++) {
      base.moveTo(originX + column * tileSize, originY).lineTo(originX + column * tileSize, originY + boardHeight);
    }
    for (let row = 1; row < 9; row++) {
      base.moveTo(originX, originY + row * tileSize).lineTo(originX + boardWidth, originY + row * tileSize);
    }
    base.stroke({ width: 1, color: PALETTE.gridLine, alpha: 0.7 });
    base
      .roundRect(originX - 6, originY - 6, boardWidth + 12, boardHeight + 12, 10)
      .stroke({ width: 6, color: PALETTE.frame, alpha: 0.18 })
      .roundRect(originX - 6, originY - 6, boardWidth + 12, boardHeight + 12, 10)
      .stroke({ width: 1.5, color: PALETTE.frame, alpha: 0.9 });
    return base;
  }

  private addTile(tile: Tile, position: Point): void {
    const center = this.layout.tileCenter(position);
    const size = this.layout.tileSize;
    switch (tile.kind) {
      case 'fibre':
        return this.addStatic(drawFibre(size, PALETTE.fibre[tile.channel]), center);
      case 'emitter':
        return this.addStatic(drawEmitter(size, tile.direction), center);
      case 'receiver':
        return this.addReceiver(center);
      case 'mirror':
        return this.addTurning(position, center, drawMirror(size, tile.auto), mirrorTarget, true);
      case 'polarizer':
        return this.addTurning(position, center, drawPolarizer(size, tile.reflects), polarizerTarget, true);
      case 'refractor':
        return this.addTurning(position, center, drawRefractor(size), refractorTarget, false);
      case 'pod':
        return this.addPulsing(this.pods, position, center, drawPod(size));
      case 'mine':
        return this.addPulsing(this.mines, position, center, drawMine(size));
    }
  }

  private addStatic(graphics: Graphics, center: Point): void {
    graphics.position.set(center.x, center.y);
    this.pieces.addChild(graphics);
  }

  private addTurning(
    position: Point,
    center: Point,
    node: Container,
    target: (tile: Tile) => number,
    symmetric: boolean,
  ): void {
    node.position.set(center.x, center.y);
    this.pieces.addChild(node);
    this.turning.set(key(position), { node, displayed: Number.NaN, target, symmetric });
  }

  private addPulsing(group: Map<string, PulsingPiece>, position: Point, center: Point, node: Container): void {
    node.position.set(center.x, center.y);
    this.pieces.addChild(node);
    group.set(key(position), { node, phase: Math.random() * Math.PI * 2 });
  }

  private addReceiver(center: Point): void {
    const size = this.layout.tileSize;
    const glow = halo(size * 1.8, PALETTE.receiverOpen, 0);
    glow.position.set(center.x, center.y);
    const ring = new Graphics();
    ring.position.set(center.x, center.y);
    this.pieces.addChild(glow, ring);
    this.receiver = { ring, glow };
  }

  private animateTurning(board: Board, seconds: number): void {
    const blend = 1 - Math.exp(-TURN_SPEED * seconds);
    for (const [tileKey, piece] of this.turning) {
      const [x, y] = tileKey.split(',').map(Number);
      const goal = piece.target(board.tiles[y][x]);
      if (Number.isNaN(piece.displayed)) piece.displayed = goal;
      const target = piece.symmetric
        ? nearestPlateAngle(piece.displayed, goal)
        : piece.displayed + wrapAngle(goal - piece.displayed);
      piece.displayed += (target - piece.displayed) * blend;
      piece.node.rotation = piece.displayed;
    }
  }

  private animatePods(): void {
    for (const pod of this.pods.values()) {
      pod.node.scale.set(1 + Math.sin(this.clock * 3 + pod.phase) * 0.08);
    }
  }

  private animateMines(hitMine?: Point): void {
    for (const [tileKey, mine] of this.mines) {
      const isHit = hitMine !== undefined && key(hitMine) === tileKey;
      mine.node.rotation = this.clock * 0.6 + mine.phase;
      mine.node.alpha = isHit ? 0.6 + Math.abs(Math.sin(this.clock * 20)) * 0.4 : 1;
      mine.node.scale.set(isHit ? 1.15 : 1);
    }
  }

  private animateReceiver(open: boolean): void {
    if (!this.receiver) return;
    const size = this.layout.tileSize;
    const { ring, glow } = this.receiver;
    const pulse = 0.5 + Math.sin(this.clock * 4) * 0.5;
    const color = open ? PALETTE.receiverOpen : PALETTE.receiverLocked;
    ring.clear().circle(0, 0, size * 0.34).stroke({ width: size * 0.08, color });
    for (let spoke = 0; spoke < 4; spoke++) {
      const angle = spoke * (Math.PI / 2) + this.clock * (open ? 1.5 : 0.3);
      ring
        .moveTo(Math.cos(angle) * size * 0.2, Math.sin(angle) * size * 0.2)
        .lineTo(Math.cos(angle) * size * 0.3, Math.sin(angle) * size * 0.3);
    }
    ring
      .stroke({ width: 2, color, alpha: 0.8, cap: 'round' })
      .circle(0, 0, size * (open ? 0.12 + pulse * 0.04 : 0.1))
      .fill({ color, alpha: open ? 0.9 : 0.5 });
    glow.alpha = open ? 0.35 + pulse * 0.35 : 0;
  }

  private drawCursor(tile?: Point): void {
    this.cursor.clear();
    if (!tile) return;
    const size = this.layout.tileSize;
    const center = this.layout.tileCenter(tile);
    const half = size * 0.5 - 2;
    const arm = size * 0.22;
    const alpha = 0.55 + Math.sin(this.clock * 6) * 0.35;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cornerX = center.x + sx * half;
      const cornerY = center.y + sy * half;
      this.cursor.moveTo(cornerX - sx * arm, cornerY).lineTo(cornerX, cornerY).lineTo(cornerX, cornerY - sy * arm);
    }
    this.cursor.stroke({ width: 2, color: PALETTE.cursor, alpha, cap: 'round', join: 'round' });
  }
}

function mirrorTarget(tile: Tile): number {
  return tile.kind === 'mirror' ? mirrorPlateRotation(tile.rotation) : 0;
}

/** Stripes run along the axis the polariser currently lets through. */
function polarizerTarget(tile: Tile): number {
  return tile.kind === 'polarizer' ? directionAngle(tile.axis) : 0;
}

function refractorTarget(tile: Tile): number {
  return tile.kind === 'refractor' ? directionAngle(tile.direction) : 0;
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function key(tile: Point): string {
  return `${tile.x},${tile.y}`;
}

function halo(diameter: number, tint: number, alpha: number): Sprite {
  const sprite = new Sprite(getGlowTexture());
  sprite.anchor.set(0.5);
  sprite.width = sprite.height = diameter;
  sprite.tint = tint;
  sprite.alpha = alpha;
  sprite.blendMode = 'add';
  return sprite;
}

function drawMirror(size: number, auto: boolean): Container {
  const node = new Container();
  const color = auto ? PALETTE.autoMirrorPlate : PALETTE.mirrorPlate;
  const base = new Graphics()
    .circle(0, 0, size * 0.36)
    .fill({ color: PALETTE.mirrorBase, alpha: 0.9 })
    .circle(0, 0, size * 0.36)
    .stroke({ width: 1.5, color: auto ? PALETTE.autoMirrorPlate : PALETTE.mirrorRim, alpha: 0.7 });
  const plate = new Graphics()
    .roundRect(-size * 0.42, -size * 0.1, size * 0.84, size * 0.2, size * 0.1)
    .fill({ color, alpha: 0.18 })
    .roundRect(-size * 0.4, -size * 0.05, size * 0.8, size * 0.1, size * 0.05)
    .fill(color);
  node.addChild(base, plate);
  return node;
}

/** Drawn with stripes along the up/down axis; the node is rotated to the polariser's current axis. */
function drawPolarizer(size: number, reflects: boolean): Container {
  const color = reflects ? PALETTE.polarizerReflecting : PALETTE.polarizerAbsorbing;
  const graphics = new Graphics()
    .roundRect(-size * 0.38, -size * 0.38, size * 0.76, size * 0.76, size * 0.12)
    .fill({ color, alpha: 0.1 })
    .roundRect(-size * 0.38, -size * 0.38, size * 0.76, size * 0.76, size * 0.12)
    .stroke({ width: 1.5, color, alpha: 0.85 });
  for (const offset of [-0.2, -0.07, 0.07, 0.2]) {
    graphics.moveTo(size * offset, -size * 0.27).lineTo(size * offset, size * 0.27);
  }
  graphics.stroke({ width: 2, color, cap: 'round' });
  return graphics;
}

/** A prism (bow-tie) with a glint pointing where it currently sends the beam. */
function drawRefractor(size: number): Container {
  const node = new Container();
  const prism = new Graphics()
    .poly([-size * 0.34, -size * 0.3, size * 0.34, -size * 0.3, 0, 0])
    .fill({ color: PALETTE.refractor, alpha: 0.55 })
    .poly([-size * 0.34, size * 0.3, size * 0.34, size * 0.3, 0, 0])
    .fill({ color: PALETTE.refractor, alpha: 0.35 })
    .poly([-size * 0.34, -size * 0.3, size * 0.34, -size * 0.3, 0, 0, size * 0.34, size * 0.3, -size * 0.34, size * 0.3, 0, 0])
    .stroke({ width: 1.5, color: PALETTE.refractor });
  const glint = new Graphics()
    .moveTo(0, 0)
    .lineTo(0, -size * 0.42)
    .stroke({ width: 2, color: PALETTE.beamCore, alpha: 0.9, cap: 'round' })
    .circle(0, -size * 0.42, size * 0.05)
    .fill(PALETTE.beamCore);
  node.addChild(prism, glint);
  return node;
}

function drawPod(size: number): Container {
  const node = new Container();
  node.addChild(halo(size * 1.3, PALETTE.pod, 0.55));
  node.addChild(
    new Graphics()
      .circle(0, 0, size * 0.22)
      .fill(PALETTE.pod)
      .circle(-size * 0.06, -size * 0.07, size * 0.07)
      .fill({ color: 0xffffff, alpha: 0.85 }),
  );
  return node;
}

function drawFibre(size: number, color: number): Graphics {
  return new Graphics()
    .circle(0, 0, size * 0.34)
    .stroke({ width: 2, color, alpha: 0.9 })
    .circle(0, 0, size * 0.22)
    .stroke({ width: 1, color, alpha: 0.5 })
    .circle(0, 0, size * 0.1)
    .fill(color);
}

function drawEmitter(size: number, direction: number): Graphics {
  const graphics = new Graphics()
    .roundRect(-size * 0.4, -size * 0.3, size * 0.62, size * 0.6, size * 0.1)
    .fill(0x0f2a3a)
    .roundRect(-size * 0.4, -size * 0.3, size * 0.62, size * 0.6, size * 0.1)
    .stroke({ width: 1.5, color: PALETTE.emitter })
    .rect(size * 0.2, -size * 0.1, size * 0.3, size * 0.2)
    .fill(PALETTE.emitter)
    .circle(-size * 0.1, 0, size * 0.1)
    .fill(PALETTE.beamCore);
  graphics.rotation = directionAngle(direction) - Math.PI / 2;
  return graphics;
}

function drawMine(size: number): Container {
  const node = new Container();
  const spikes = 8;
  const points: number[] = [];
  for (let index = 0; index < spikes * 2; index++) {
    const radius = size * (index % 2 === 0 ? 0.34 : 0.17);
    const angle = (index / (spikes * 2)) * Math.PI * 2;
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  node.addChild(halo(size * 1.1, PALETTE.mine, 0.35));
  node.addChild(
    new Graphics()
      .poly(points)
      .fill({ color: PALETTE.mine, alpha: 0.35 })
      .poly(points)
      .stroke({ width: 1.5, color: PALETTE.mine })
      .circle(0, 0, size * 0.09)
      .fill(0xffd0c0),
  );
  return node;
}
