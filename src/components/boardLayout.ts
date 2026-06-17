// Silicon Streets — UI geometry. Maps a tile index (0-39) onto an 11x11 CSS
// Grid perimeter. Corners: 0 bottom-right, 10 bottom-left, 20 top-left,
// 30 top-right. The 9x9 interior (rows/cols 2-10) is the center HUD.

import { Sector } from '@/engine/types';

export interface Cell {
  row: number; // 1-11
  col: number; // 1-11
}

export function gridPos(i: number): Cell {
  if (i <= 10) return { row: 11, col: 11 - i };        // bottom row, right→left
  if (i <= 20) return { row: 11 - (i - 10), col: 1 };  // left col, bottom→top
  if (i <= 30) return { row: 1, col: 1 + (i - 20) };   // top row, left→right
  return { row: 1 + (i - 30), col: 11 };               // right col, top→bottom
}

/** Side a tile sits on — drives which edge the sector color-bar hugs. */
export function edgeOf(i: number): 'bottom' | 'left' | 'top' | 'right' {
  if (i < 10) return 'bottom';
  if (i < 20) return 'left';
  if (i < 30) return 'top';
  return 'right';
}

export const SECTOR_COLOR: Record<Sector, string> = {
  [Sector.GarageStartups]: '#b06a3b',
  [Sector.OpenSource]: '#00D4FF',
  [Sector.SocialMedia]: '#ff5cf4',
  [Sector.FinTech]: '#ff9f1c',
  [Sector.ECommerce]: '#ff3864',
  [Sector.Cloud]: '#ffe600',
  [Sector.Ai]: '#00FF41',
  [Sector.Quantum]: '#6a5cff',
  [Sector.Backbone]: '#7dd3fc',
  [Sector.Grid]: '#a3e635',
};

/** Stable per-seat token colors, indexed by playerOrder position. */
export const TOKEN_COLORS = [
  '#00FF41', '#00D4FF', '#ff5cf4', '#ff9f1c',
  '#ff3864', '#ffe600', '#a3e635', '#6a5cff',
];
