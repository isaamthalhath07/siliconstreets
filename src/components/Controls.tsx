'use client';

import type { ReactNode } from 'react';
import type { GameAction, GameState } from '@/engine/types';
import { isOwnable } from '@/engine/types';
import { BOARD } from '@/engine/board';

interface ControlsProps {
  state: GameState;
  me: string | null;
  error: string | null;
  dispatch: (action: Omit<GameAction, 'playerId'>) => void;
}

function Btn({ onClick, children, tone = 'matrix' }: { onClick: () => void; children: ReactNode; tone?: 'matrix' | 'cyber' | 'red' }) {
  const ring = tone === 'cyber' ? 'border-cyber text-cyber shadow-cyber' : tone === 'red' ? 'border-[#ff3864] text-[#ff3864]' : 'border-matrix text-matrix shadow-neon';
  return (
    <button
      onClick={onClick}
      className={`rounded border ${ring} bg-term-bg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition hover:bg-white/5 active:translate-y-px`}
    >
      {children}
    </button>
  );
}

export default function Controls({ state, me, error, dispatch }: ControlsProps) {
  const active = state.players[state.activePlayerId];
  const myTurn = me === state.activePlayerId;
  const landed = BOARD[active.position];

  if (state.phase === 'GAME_OVER') {
    return (
      <div className="rounded border border-matrix bg-term-panel p-4 text-center">
        <p className="neon-text text-lg font-bold text-matrix">GAME OVER</p>
        <p className="mt-1 text-sm text-term-text">{active.name} owns the network.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-term-line bg-term-panel p-3">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-term-dim">
        <span>{myTurn ? 'Your move' : `Waiting on ${active.name}`}</span>
        <span>{state.phase}</span>
      </div>

      {myTurn ? (
        <div className="flex flex-wrap gap-2">
          {state.phase === 'AWAIT_ROLL' && (
            <>
              <Btn onClick={() => dispatch({ type: 'ROLL_DICE' })}>Roll Dice</Btn>
              {active.inQuarantine && <Btn tone="cyber" onClick={() => dispatch({ type: 'PAY_BAIL' })}>Pay Bail ($50)</Btn>}
            </>
          )}

          {state.phase === 'AWAIT_ACTION' && isOwnable(landed) && (
            <>
              <Btn onClick={() => dispatch({ type: 'BUY_PROPERTY', tile: active.position })}>
                Buy {landed.name} (${landed.cost})
              </Btn>
              <Btn tone="red" onClick={() => dispatch({ type: 'DECLINE_PROPERTY', tile: active.position })}>
                Decline
              </Btn>
            </>
          )}

          {state.phase === 'RESOLVED' && (
            <Btn tone="cyber" onClick={() => dispatch({ type: 'END_TURN' })}>End Turn</Btn>
          )}
        </div>
      ) : (
        <p className="text-xs text-term-dim">Spectating — controls unlock on your turn.</p>
      )}

      {state.lastRoll && (
        <p className="text-xs text-term-dim">
          Last roll: <span className="text-term-text">{state.lastRoll.d1} + {state.lastRoll.d2}</span>
          {state.lastRoll.isDouble && <span className="text-matrix"> (double)</span>}
        </p>
      )}

      {error && <p className="text-xs text-[#ff3864]">⚠ {error}</p>}
    </div>
  );
}
