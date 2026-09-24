import { Container, Graphics, Sprite } from 'pixi.js';
import type { Point } from '../engine/types';
import { getGlowTexture } from './textures';

interface Particle {
  sprite: Sprite;
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Shockwave {
  ring: Graphics;
  center: Point;
  color: number;
  life: number;
  maxLife: number;
  radius: number;
}

const DRAG = 2.2;
const MAX_PARTICLES = 600;

/** Additive particle bursts, sparks and expanding shock rings. */
export class Effects {
  readonly container = new Container();
  private readonly particles: Particle[] = [];
  private readonly shockwaves: Shockwave[] = [];
  /** Multiplies particle counts: lowered for light effects and for reduced motion. */
  private budget = 1;
  private scale = 1;

  setBudget(budget: number): void {
    this.budget = budget;
  }

  setScale(scale: number): void {
    this.scale = scale;
  }

  burst(at: Point, color: number, count: number, speed: number, size: number): void {
    const scaled = Math.ceil(count * this.budget * this.scale);
    for (let index = 0; index < scaled; index++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.3 + Math.random() * 0.7);
      this.spawn(at, color, Math.cos(angle) * velocity, Math.sin(angle) * velocity, size, 0.5 + Math.random() * 0.6);
    }
  }

  sparks(at: Point, color: number, size: number, seconds: number): void {
    const count = Math.random() < seconds * 40 * this.budget * this.scale ? 1 : 0;
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = size * (1.5 + Math.random() * 3);
      this.spawn(at, color, Math.cos(angle) * velocity, Math.sin(angle) * velocity, size * 0.18, 0.25 + Math.random() * 0.25);
    }
  }

  shockwave(at: Point, color: number, radius: number, duration = 0.6): void {
    const ring = new Graphics();
    ring.blendMode = 'add';
    this.container.addChild(ring);
    this.shockwaves.push({ ring, center: at, color, life: duration, maxLife: duration, radius });
  }

  update(seconds: number): void {
    this.updateParticles(seconds);
    this.updateShockwaves(seconds);
  }

  clear(): void {
    for (const particle of this.particles) particle.sprite.destroy();
    for (const wave of this.shockwaves) wave.ring.destroy();
    this.particles.length = 0;
    this.shockwaves.length = 0;
  }

  private spawn(at: Point, color: number, velocityX: number, velocityY: number, size: number, life: number): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    const sprite = new Sprite(getGlowTexture());
    sprite.anchor.set(0.5);
    sprite.blendMode = 'add';
    sprite.tint = color;
    sprite.position.set(at.x, at.y);
    this.container.addChild(sprite);
    this.particles.push({ sprite, velocityX, velocityY, life, maxLife: life, size });
  }

  private updateParticles(seconds: number): void {
    const damping = Math.exp(-DRAG * seconds);
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index];
      particle.life -= seconds;
      if (particle.life <= 0) {
        particle.sprite.destroy();
        this.particles.splice(index, 1);
        continue;
      }
      particle.velocityX *= damping;
      particle.velocityY *= damping;
      particle.sprite.x += particle.velocityX * seconds;
      particle.sprite.y += particle.velocityY * seconds;
      const remaining = particle.life / particle.maxLife;
      particle.sprite.alpha = remaining;
      particle.sprite.width = particle.sprite.height = particle.size * (0.4 + remaining * 0.6);
    }
  }

  private updateShockwaves(seconds: number): void {
    for (let index = this.shockwaves.length - 1; index >= 0; index--) {
      const wave = this.shockwaves[index];
      wave.life -= seconds;
      if (wave.life <= 0) {
        wave.ring.destroy();
        this.shockwaves.splice(index, 1);
        continue;
      }
      const progress = 1 - wave.life / wave.maxLife;
      const eased = 1 - (1 - progress) ** 3;
      wave.ring
        .clear()
        .circle(wave.center.x, wave.center.y, wave.radius * eased)
        .stroke({ width: 3 * (1 - progress) + 1, color: wave.color, alpha: 1 - progress });
    }
  }
}
