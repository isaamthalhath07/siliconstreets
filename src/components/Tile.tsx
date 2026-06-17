'use client';

import type { CSSProperties } from 'react';
import { type BoardTile, type TileState, TileType, isOwnable } from '@/engine/types';
import { SECTOR_COLOR, edgeOf } from './boardLayout';

export interface TokenView {
  initial: string;
  color: string;
  active: boolean;
}

interface TileProps {
  tile: BoardTile;
  ts?: TileState;
  ownerColor: string | null;
  tokens: TokenView[];
  style: CSSProperties;
}

const SPECIAL_GLYPH: Partial<Record<TileType, string>> = {
  [TileType.Reboot]: '⟳',
  [TileType.Quarantine]: '🐞',
  [TileType.Sandbox]: '▢',
  [TileType.GotoQuarantine]: '⚠',
  [TileType.Event]: '?',
  [TileType.Cache]: '✦',
  [TileType.Tax]: '$',
};

const BAR_SIDE: Record<ReturnType<typeof edgeOf>, string> = {
  bottom: 'top-0 left-0 right-0 h-1.5',
  left: 'top-0 right-0 bottom-0 w-1.5',
  top: 'bottom-0 left-0 right-0 h-1.5',
  right: 'top-0 left-0 bottom-0 w-1.5',
};

export default function Tile({ tile, ts, ownerColor, tokens, style }: TileProps) {
  // `isOwnable` is used inline (not stored in a const) so TS narrows `tile`
  // to `Property` inside each branch, exposing `.sector` / `.cost`.
  const dev = ts?.developmentLevel ?? 0;

  return (
    <div
      style={{ ...style, borderColor: ownerColor ?? '#1b2733' }}
      className="relative flex flex-col items-center justify-center overflow-hidden border bg-term-panel/80 p-0.5 text-center"
    >
      {isOwnable(tile) && (
        <span className={`absolute ${BAR_SIDE[edgeOf(tile.index)]}`} style={{ background: SECTOR_COLOR[tile.sector] }} />
      )}

      {!isOwnable(tile) && (
        <span className="text-[10px] leading-none text-term-dim">{SPECIAL_GLYPH[tile.type]}</span>
      )}

      <span className="px-0.5 text-[7px] font-medium leading-tight text-term-text/90 line-clamp-2">
        {tile.name}
      </span>

      {isOwnable(tile) && (
        <span className="text-[7px] leading-none text-term-dim">
          {ts?.ownerId
            ? ts.isMortgaged
              ? 'MORTGAGED'
              : '▮'.repeat(Math.min(dev, 5)) || 'OWNED'
            : `$${tile.cost}`}
        </span>
      )}

      {tokens.length > 0 && (
        <span className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
          {tokens.map((t, i) => (
            <span
              key={i}
              title={t.initial}
              style={{ background: t.color }}
              className={`inline-flex h-2.5 w-2.5 items-center justify-center rounded-full text-[6px] font-bold text-black ${
                t.active ? 'ring-1 ring-white' : ''
              }`}
            >
              {t.initial}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
