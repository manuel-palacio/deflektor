import { AdvancedBloomFilter } from 'pixi-filters';
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Game, GameEvent } from '../engine/game';
import { findTiles } from '../engine/level';
import type { Point } from '../engine/types';
import { BeamView } from './BeamView';
import { BoardView } from './BoardView';
import { Effects } from './Effects';
import { BoardLayout, placeBoard } from './layout';
import { PALETTE } from './palette';
import { getGlowTexture } from './textures';

const DUST_COUNT = 50;

interface Dust {
  sprite: Sprite;
  speed: number;
  drift: number;
}

/** Owns the Pixi application and turns game state and events into pictures. */
export class Renderer {
  layout!: BoardLayout;
  /** Turns and places the board (rotated a quarter on portrait screens); `world` inside it shakes. */
  private readonly frame = new Container();
  private readonly world = new Container();
  private rotated = false;
  private readonly board = new BoardView();
  private readonly beam = new BeamView();
  private readonly effects = new Effects();
  private readonly flash = new Graphics();
  private readonly background = new Sprite();
  private readonly dust: Dust[] = [];
  private shakeTime = 0;
  private flashAlpha = 0;
  private flashColor: number = PALETTE.beamCore;
  private game?: Game;

  private constructor(
    private readonly app: Application,
    private readonly reservedTop: () => number,
  ) {}

  static async create(host: HTMLElement, reservedTop: () => number): Promise<Renderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: PALETTE.background,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    host.appendChild(app.canvas);
    const renderer = new Renderer(app, reservedTop);
    renderer.assembleStage();
    return renderer;
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  onFrame(callback: (seconds: number) => void): void {
    this.app.ticker.add((ticker) => callback(ticker.deltaMS / 1000));
  }

  showGame(game: Game): void {
    this.game = game;
    this.relayout();
  }

  /** Recomputes the layout for the current canvas size and HUD height. */
  relayout(): void {
    const placement = placeBoard(this.app.screen.width, this.app.screen.height, this.reservedTop());
    this.layout = placement.layout;
    this.rotated = placement.rotated;
    this.frame.rotation = placement.rotated ? Math.PI / 2 : 0;
    this.frame.position.set(placement.offset.x, placement.offset.y);
    this.paintBackground();
    if (this.game) this.board.build(this.game.board, this.layout);
  }

  /** The board tile under a point on the canvas, if any. */
  tileAtScreen(point: Point): Point | undefined {
    return this.layout.tileAtPixel(this.frame.toLocal(point));
  }

  /** Where a tile's centre appears on the canvas. */
  tileCenterOnScreen(tile: Point): Point {
    const { x, y } = this.frame.toGlobal(this.layout.tileCenter(tile));
    return { x, y };
  }

  /** Converts a direction pressed on screen (e.g. an arrow key) into the board's own axes. */
  screenDirectionToBoard(step: Point): Point {
    return this.rotated ? { x: step.y, y: -step.x } : step;
  }

  handle(event: GameEvent, game: Game): void {
    const size = this.layout.tileSize;
    switch (event.type) {
      case 'levelStarted':
        this.effects.clear();
        this.board.build(game.board, this.layout);
        this.effects.shockwave(this.tilePixel(findTiles(game.board, 'emitter')[0]), PALETTE.beam, size * 3);
        break;
      case 'podDestroyed': {
        const at = this.tilePixel(event.tile);
        this.board.removePod(event.tile);
        this.effects.burst(at, PALETTE.pod, 45, size * 7, size * 0.35);
        this.effects.shockwave(at, PALETTE.pod, size * 1.6, 0.45);
        break;
      }
      case 'receiverOpened':
        for (const at of this.board.openGates()) this.effects.burst(at, PALETTE.gateEdge, 6, size * 3, size * 0.25);
        this.effects.shockwave(this.tilePixel(findTiles(game.board, 'receiver')[0]), PALETTE.receiverOpen, size * 3);
        break;
      case 'levelComplete': {
        const at = this.tilePixel(findTiles(game.board, 'receiver')[0]);
        this.effects.burst(at, PALETTE.receiverOpen, 140, size * 14, size * 0.45);
        this.effects.shockwave(at, PALETTE.receiverOpen, size * 12, 1.2);
        this.flashScreen(PALETTE.receiverOpen, 0.3);
        break;
      }
      case 'lifeLost': {
        const beamEnd = game.beam.paths.at(-1)!.at(-1)!;
        const at = this.layout.beamToPixels(beamEnd);
        this.effects.burst(at, PALETTE.beamHot, 90, size * 10, size * 0.45);
        this.effects.shockwave(at, PALETTE.beamHot, size * 6, 0.8);
        this.shakeTime = 0.6;
        this.flashScreen(PALETTE.beamHot, 0.4);
        break;
      }
    }
  }

  render(game: Game, seconds: number, cursorTile?: Point): void {
    this.board.update(game, seconds, cursorTile);
    if (game.isCharging) {
      this.beam.drawAiming(game.beam, this.layout, seconds);
    } else {
      const beamEnd = this.beam.draw(game.beam, this.layout, game.overload, seconds);
      if (game.phase === 'playing') this.effects.sparks(beamEnd, PALETTE.beamCore, this.layout.tileSize, seconds);
    }
    this.effects.update(seconds);
    this.updateDust(seconds);
    this.updateShake(seconds);
    this.updateFlash(seconds);
  }

  private assembleStage(): void {
    const bloom = new AdvancedBloomFilter({ threshold: 0.3, bloomScale: 1.1, brightness: 1, blur: 6, quality: 5 });
    this.world.filters = [bloom];
    this.world.addChild(this.board.container, this.beam.container, this.effects.container);
    this.frame.addChild(this.world);
    this.app.stage.addChild(this.background, this.createDust(), this.frame, this.flash);
    this.app.renderer.on('resize', () => this.relayout());
  }

  private paintBackground(): void {
    const { width, height } = this.app.screen;
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#0b0624');
    gradient.addColorStop(0.65, '#070519');
    gradient.addColorStop(1, '#1a0930');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 4, 256);
    this.background.texture?.destroy(true);
    this.background.texture = Texture.from(canvas);
    this.background.width = width;
    this.background.height = height;
  }

  private createDust(): Container {
    const layer = new Container();
    for (let index = 0; index < DUST_COUNT; index++) {
      const sprite = new Sprite(getGlowTexture());
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.tint = index % 3 === 0 ? PALETTE.pod : PALETTE.frame;
      sprite.alpha = 0.08 + Math.random() * 0.15;
      sprite.width = sprite.height = 3 + Math.random() * 7;
      sprite.position.set(Math.random() * 4000, Math.random() * 3000);
      layer.addChild(sprite);
      this.dust.push({ sprite, speed: 4 + Math.random() * 12, drift: Math.random() * Math.PI * 2 });
    }
    return layer;
  }

  private updateDust(seconds: number): void {
    const { width, height } = this.app.screen;
    for (const mote of this.dust) {
      mote.drift += seconds * 0.3;
      mote.sprite.y -= mote.speed * seconds;
      mote.sprite.x += Math.sin(mote.drift) * 6 * seconds;
      if (mote.sprite.y < -10) mote.sprite.y = height + 10;
      mote.sprite.x = ((mote.sprite.x % width) + width) % width;
      mote.sprite.y = mote.sprite.y % (height + 20);
    }
  }

  private updateShake(seconds: number): void {
    this.shakeTime = Math.max(0, this.shakeTime - seconds);
    const strength = this.shakeTime * 14;
    this.world.position.set((Math.random() - 0.5) * strength, (Math.random() - 0.5) * strength);
  }

  private flashScreen(color: number, alpha: number): void {
    this.flashColor = color;
    this.flashAlpha = alpha;
  }

  private updateFlash(seconds: number): void {
    this.flashAlpha = Math.max(0, this.flashAlpha - seconds * 1.2);
    const { width, height } = this.app.screen;
    this.flash.clear().rect(0, 0, width, height).fill({ color: this.flashColor, alpha: this.flashAlpha });
  }

  private tilePixel(tile: Point): Point {
    return this.layout.tileCenter(tile);
  }
}
