import type { GameEvent, PowerUpKind } from '@bombarossa/game-core';
import type { Painter } from './painter';
import type { QualityLevel } from './theme';

interface Particle {
  x: number; // cells
  y: number;
  vx: number; // cells per second
  vy: number;
  gravity: number; // cells per second^2
  life: number; // ms left
  maxLife: number;
  size: number; // cells
  color: string;
}

const EXPLOSION_COLORS = ['#fff3bf', '#ffd43b', '#ff922b', '#ff6a1a'];
const DEBRIS_COLORS = ['#e0963f', '#b9742c', '#8a4d17', '#f2c27c'];
const POWERUP_COLORS: Record<PowerUpKind, string> = { bomb: '#74a9ff', range: '#ff7b7b', speed: '#ffd43b' };
const MAX_PARTICLES = 160;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Short-lived particles and screen shake driven by game events. Cheap enough for low-end phones (and off on 'low'). */
export class Effects {
  private particles: Particle[] = [];
  private shake = 0;

  clear(): void {
    this.particles.length = 0;
    this.shake = 0;
  }

  onEvent(ev: GameEvent, quality: QualityLevel, playerColors: string[]): void {
    if (quality === 0) return;
    const n = (high: number) => (quality === 2 ? high : Math.ceil(high / 2.5));
    switch (ev.type) {
      case 'explosion':
        this.burst(ev.x + 0.5, ev.y + 0.5, n(18), EXPLOSION_COLORS, 2, 6, 350, 600, 0.14, 0.28, 0);
        if (quality === 2) this.shake = Math.min(0.2, this.shake + 0.12);
        break;
      case 'blockDestroyed':
        this.burst(ev.x + 0.5, ev.y + 0.5, n(8), DEBRIS_COLORS, 1.5, 4, 450, 800, 0.12, 0.22, 9);
        break;
      case 'powerUpTaken':
        this.burst(ev.x + 0.5, ev.y + 0.5, n(10), [POWERUP_COLORS[ev.kind], '#ffffff'], 1.5, 3.5, 350, 550, 0.1, 0.18, -2);
        break;
      case 'playerDied':
        this.burst(ev.x + 0.5, ev.y + 0.5, n(22), [playerColors[ev.playerId % playerColors.length], '#ffffff'], 2, 5.5, 600, 950, 0.12, 0.26, 6);
        if (quality === 2) this.shake = Math.min(0.2, this.shake + 0.08);
        break;
      default:
        break;
    }
  }

  private burst(
    x: number,
    y: number,
    count: number,
    colors: string[],
    minSpeed: number,
    maxSpeed: number,
    minLife: number,
    maxLife: number,
    minSize: number,
    maxSize: number,
    gravity: number,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = rand(minSpeed, maxSpeed);
      const life = rand(minLife, maxLife);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        gravity,
        life,
        maxLife: life,
        size: rand(minSize, maxSize),
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (const p of this.particles) {
      p.life -= dtMs;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, 2.2 * dt);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.shake *= Math.exp(-dtMs / 120);
    if (this.shake < 0.002) this.shake = 0;
  }

  /** Screen shake offset in cells for this frame. */
  shakeOffset(): { x: number; y: number } {
    if (this.shake === 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * 2 * this.shake, y: (Math.random() - 0.5) * 2 * this.shake };
  }

  draw(p: Painter, cell: number, shape: 'round' | 'square'): void {
    for (const pt of this.particles) {
      const k = pt.life / pt.maxLife;
      const size = pt.size * cell * (0.4 + 0.6 * k);
      const fill = { color: pt.color, alpha: Math.min(1, k * 1.6) };
      const px = pt.x * cell;
      const py = pt.y * cell;
      if (shape === 'square') {
        const s = Math.max(2, Math.round(size));
        p.rect(Math.round(px - s / 2), Math.round(py - s / 2), s, s, fill);
      } else {
        p.circle(px, py, size / 2, fill);
      }
    }
  }
}
