'use client';

import type { GameState } from '@/engine/types';
import { BOARD } from '@/engine/board';
import { gridPos, TOKEN_COLORS } from './boardLayout';
import Tile, { type TokenView } from './Tile';
import Dice from './Dice';

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

  const active = state.players[state.activePlayerId];
  const activeColor = colorOf(state.activePlayerId);

  return (
    <div className="board-stage mx-auto aspect-square w-full max-w-[min(95vw,84vh)]">
      <div
        className={`board-tilt glass grid h-full w-full gap-[4px] p-[10px] transition-opacity ${
          optimistic ? 'opacity-80' : 'opacity-100'
        }`}
        // Deeper outer tracks make the perimeter tiles larger/more readable and
        // shrink the dead space in the middle (which the HUD below now fills).
        style={{
          gridTemplateColumns: '1.7fr repeat(9,1fr) 1.7fr',
          gridTemplateRows: '1.7fr repeat(9,1fr) 1.7fr',
        }}
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

        {/* Interior HUD (9x9 center) — title, live dice, and active player.
            Counter-rotated so it reads flat against the tilted board. */}
        <div
          className="clay-well flex flex-col items-center justify-center gap-4 p-4"
          style={{ gridRow: '2 / 11', gridColumn: '2 / 11', transform: 'rotateX(-17deg)' }}
        >
          <div className="text-center leading-none">
            <h1 className="holo-text animate-float text-2xl font-extrabold tracking-[0.3em] sm:text-4xl">
              SILICON
            </h1>
            <h1 className="text-2xl font-extrabold tracking-[0.3em] text-term-text/90 sm:text-4xl">
              STREETS
            </h1>
          </div>

          <Dice roll={state.lastRoll} size={56} />

          {state.phase !== 'GAME_OVER' && (
            <div
              className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm"
              style={{ borderColor: `${activeColor}66`, boxShadow: `0 0 16px ${activeColor}44` }}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: activeColor, boxShadow: `0 0 8px ${activeColor}` }} />
              <span className="font-semibold text-term-text">{active.name}</span>
              <span className="tabular-nums text-matrix">${active.balance}</span>
            </div>
          )}

          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-term-dim">
            <span className={`h-1.5 w-1.5 rounded-full ${optimistic ? 'animate-pulse bg-cyber' : 'bg-matrix'}`} />
            {optimistic ? 'syncing…' : `state ${state.stateHash}`}
          </p>
        </div>
      </div>
    </div>
  );
}
