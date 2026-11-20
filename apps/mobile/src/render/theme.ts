import type { RenderFrame } from '@bombarossa/game-core';
import type { Painter } from './painter';

export type ThemeId = 'cartoon' | 'classic';
/** 0 = low (flat, no effects), 1 = medium, 2 = high. */
export type QualityLevel = 0 | 1 | 2;

export interface DrawOptions {
  /** Cell size in px. */
  cell: number;
  quality: QualityLevel;
}

export interface ThemeUi {
  bg: string;
  panel: string;
  panelBorder: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
}

export interface Theme {
  id: ThemeId;
  label: string;
  ui: ThemeUi;
  playerColors: string[];
  particleShape: 'round' | 'square';
  /** Floor, walls and blocks: only redrawn when blocks break. */
  drawStatic(p: Painter, frame: RenderFrame, o: DrawOptions): void;
  /** Power-ups, bombs, flames, players. Drawn every frame. */
  drawDynamic(p: Painter, frame: RenderFrame, o: DrawOptions): void;
}
