'use client';

import type { GameAction, GameState } from '@/engine/types';
import { TileType } from '@/engine/types';
import { BOARD } from '@/engine/board';
import { TOKEN_COLORS } from './boardLayout';

interface PanelProps {
  state: GameState;
  me: string | null;
  events: string[];
  dispatch: (action: Omit<GameAction, 'playerId'>) => void;
}

export default function PlayerPanel({ state, me, events, dispatch }: PanelProps) {
  const colorOf = (pid: string): string => TOKEN_COLORS[state.playerOrder.indexOf(pid) % TOKEN_COLORS.length];
  const myTiles = me ? state.players[me]?.inventory ?? [] : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-term-line bg-term-panel p-3">
        <h2 className="mb-2 text-xs uppercase tracking-widest text-term-dim">Players</h2>
        <ul className="flex flex-col gap-1.5">
          {state.playerOrder.map((pid) => {
            const p = state.players[pid];
            const active = pid === state.activePlayerId;
            return (
              <li key={pid} className={`flex items-center justify-between rounded px-2 py-1 text-sm ${active ? 'bg-white/5 ring-1 ring-matrix/40' : ''}`}>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorOf(pid) }} />
                  <span className={p.isBankrupt ? 'text-term-dim line-through' : 'text-term-text'}>
                    {p.name}{pid === me ? ' (you)' : ''}
                  </span>
                  {p.inQuarantine && <span title="In Debugger Quarantine">🐞</span>}
                  {!p.isConnected && <span className="text-[10px] text-term-dim">offline</span>}
                </span>
                <span className="tabular-nums text-matrix">${p.balance}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {myTiles.length > 0 && (
        <div className="rounded border border-term-line bg-term-panel p-3">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-term-dim">Your Holdings</h2>
          <ul className="flex flex-col gap-1">
            {myTiles.map((idx) => {
              const tile = BOARD[idx];
              const ts = state.boardState[idx];
              return (
                <li key={idx} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-term-text">
                    {tile.name}
                    {ts.developmentLevel > 0 && <span className="text-matrix"> {'▮'.repeat(ts.developmentLevel)}</span>}
                    {ts.isMortgaged && <span className="text-[#ff3864]"> (mtg)</span>}
                  </span>
                  <span className="flex gap-1">
                    {tile.type === TileType.Property && !ts.isMortgaged && (
                      <button onClick={() => dispatch({ type: 'BUILD', tile: idx })} className="rounded border border-matrix px-1.5 text-matrix hover:bg-white/5">▲</button>
                    )}
                    <button
                      onClick={() => dispatch({ type: ts.isMortgaged ? 'UNMORTGAGE' : 'MORTGAGE', tile: idx })}
                      className="rounded border border-term-line px-1.5 text-term-dim hover:bg-white/5"
                    >
                      {ts.isMortgaged ? '$↑' : '$↓'}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="rounded border border-term-line bg-term-panel p-3">
        <h2 className="mb-2 text-xs uppercase tracking-widest text-term-dim">System Log</h2>
        <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto text-[11px] text-term-dim">
          {events.length === 0 && <li>Awaiting input…</li>}
          {events.map((e, i) => (
            <li key={i} className="leading-tight">&gt; {e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
