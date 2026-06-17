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
      style={{
        ...style,
        boxShadow: ownerColor
          ? `inset 0 0 0 2px ${ownerColor}cc, 3px 3px 7px rgba(8,10,22,0.55), -2px -2px 6px rgba(255,255,255,0.04)`
          : '3px 3px 7px rgba(8,10,22,0.5), -2px -2px 6px rgba(255,255,255,0.045)',
      }}
      className="tile3d relative flex flex-col items-center justify-center overflow-hidden rounded-[10px] bg-[#272c46] p-0.5 text-center transition-transform hover:scale-[1.04]"
    >
      {isOwnable(tile) && (
        <span className={`absolute ${BAR_SIDE[edgeOf(tile.index)]}`} style={{ background: SECTOR_COLOR[tile.sector], boxShadow: `0 0 6px ${SECTOR_COLOR[tile.sector]}` }} />
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
        <span className="mt-0.5 flex flex-wrap items-center justify-center gap-1">
          {tokens.map((t, i) => (
            <span
              key={i}
              title={t.initial}
              style={{
                background: `radial-gradient(circle at 34% 26%, #ffffff, ${t.color} 58%, ${t.color}aa)`,
                boxShadow: t.active
                  ? `0 5px 7px rgba(0,0,0,0.55), 0 0 12px ${t.color}, 0 0 4px #fff`
                  : `0 4px 6px rgba(0,0,0,0.5), 0 0 8px ${t.color}99`,
                transform: 'rotateX(-17deg)',
              }}
              className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-extrabold text-black/80 ${
                t.active ? 'animate-ring ring-2 ring-white' : ''
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
