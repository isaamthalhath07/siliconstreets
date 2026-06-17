'use client';

import type { GameState } from '@/engine/types';
import { BOARD } from '@/engine/board';
import { gridPos, TOKEN_COLORS } from './boardLayout';
import Tile, { type TokenView } from './Tile';

interface BoardProps {
  state: GameState;
  optimistic: boolean;
}

export default function Board({ state, optimistic }: BoardProps) {
  const colorOf = (playerId: string): string =>
    TOKEN_COLORS[state.playerOrder.indexOf(playerId) % TOKEN_COLORS.length];

  // Group active (non-bankrupt) players by the tile they occupy.
  const tokensByTile = new Map<number, TokenView[]>();
  for (const pid of state.playerOrder) {
    const p = state.players[pid];
    if (p.isBankrupt) continue;
    const list = tokensByTile.get(p.position) ?? [];
    list.push({
      initial: p.name.charAt(0).toUpperCase(),
      color: colorOf(pid),
      active: pid === state.activePlayerId,
    });
    tokensByTile.set(p.position, list);
  }

  return (
    <div className="mx-auto aspect-square w-full max-w-[min(92vw,82vh)]">
      <div
        className={`grid h-full w-full gap-[2px] rounded-md border border-term-line bg-term-bg p-[2px] transition-opacity ${
          optimistic ? 'opacity-80' : 'opacity-100'
        }`}
        style={{ gridTemplateColumns: 'repeat(11,1fr)', gridTemplateRows: 'repeat(11,1fr)' }}
      >
        {BOARD.map((tile) => {
          const { row, col } = gridPos(tile.index);
          const ts = state.boardState[tile.index];
          return (
            <Tile
              key={tile.index}
              tile={tile}
              ts={ts}
              ownerColor={ts.ownerId ? colorOf(ts.ownerId) : null}
              tokens={tokensByTile.get(tile.index) ?? []}
              style={{ gridRow: row, gridColumn: col }}
            />
          );
        })}

        {/* Interior HUD (9x9 center) */}
        <div
          className="flex flex-col items-center justify-center gap-1 rounded bg-term-panel/40"
          style={{ gridRow: '2 / 11', gridColumn: '2 / 11' }}
        >
          <h1 className="neon-text text-2xl font-bold tracking-[0.3em] text-matrix sm:text-4xl">
            SILICON
          </h1>
          <h1 className="text-2xl font-bold tracking-[0.3em] text-cyber sm:text-4xl">STREETS</h1>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-term-dim">
            {optimistic ? 'syncing…' : `state ${state.stateHash}`}
          </p>
        </div>
      </div>
    </div>
  );
}
