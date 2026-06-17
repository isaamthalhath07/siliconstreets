'use client';

import type { ReactNode } from 'react';
import type { GameState, PlayerAction } from '@/engine/types';
import { isOwnable } from '@/engine/types';
import { BOARD } from '@/engine/board';

interface ControlsProps {
  state: GameState;
  me: string | null;
  error: string | null;
  dispatch: (action: PlayerAction) => void;
}

const TONE = {
  matrix: 'text-matrix shadow-neon',
  cyber: 'text-cyber shadow-cyber',
  magenta: 'text-magenta shadow-violet',
} as const;

function Btn({
  onClick,
  children,
  tone = 'matrix',
}: {
  onClick: () => void;
  children: ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <button
      onClick={onClick}
      className={`btn-glass rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider active:translate-y-px ${TONE[tone]}`}
    >
      {children}
    </button>
  );
}

const PHASE_LABEL: Record<GameState['phase'], string> = {
  LOBBY: 'Lobby',
  AWAIT_ROLL: 'Awaiting roll',
  AWAIT_ACTION: 'Decision',
  AUCTION: 'Auction',
  RESOLVED: 'Resolving',
  GAME_OVER: 'Game over',
};

export default function Controls({ state, me, error, dispatch }: ControlsProps) {
  const active = state.players[state.activePlayerId];
  const myTurn = me === state.activePlayerId;
  const landed = BOARD[active.position];

  if (state.phase === 'GAME_OVER') {
    return (
      <div className="glass-strong rounded-xl p-5 text-center">
        <p className="holo-text text-2xl font-bold tracking-wide">GAME OVER</p>
        <p className="mt-1 text-sm text-term-text">{active.name} owns the network.</p>
      </div>
    );
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${myTurn ? 'text-matrix' : 'text-term-dim'}`}>
          {myTurn ? '● Your move' : `Waiting on ${active.name}`}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-cyber">
          {PHASE_LABEL[state.phase]}
        </span>
      </div>

      {myTurn ? (
        <div className="flex flex-wrap gap-2">
          {state.phase === 'AWAIT_ROLL' && (
            <>
              <Btn onClick={() => dispatch({ type: 'ROLL_DICE' })}>🎲 Roll Dice</Btn>
              {active.inQuarantine && (
                <Btn tone="cyber" onClick={() => dispatch({ type: 'PAY_BAIL' })}>
                  Pay Bail ($50)
                </Btn>
              )}
            </>
          )}

          {state.phase === 'AWAIT_ACTION' && isOwnable(landed) && (
            <>
              <Btn onClick={() => dispatch({ type: 'BUY_PROPERTY', tile: active.position })}>
                Buy {landed.name} (${landed.cost})
              </Btn>
              <Btn tone="magenta" onClick={() => dispatch({ type: 'DECLINE_PROPERTY', tile: active.position })}>
                Decline → Auction
              </Btn>
            </>
          )}

          {state.phase === 'RESOLVED' && (
            <Btn tone="cyber" onClick={() => dispatch({ type: 'END_TURN' })}>
              End Turn ▸
            </Btn>
          )}
        </div>
      ) : (
        <p className="text-xs text-term-dim">Spectating — controls unlock on your turn.</p>
      )}

      {state.lastRoll && (
        <div className="flex items-center gap-2 text-xs text-term-dim">
          <span>Last roll</span>
          <span className="flex gap-1">
            {[state.lastRoll.d1, state.lastRoll.d2].map((d, i) => (
              <span
                key={i}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/30 font-bold text-term-text"
              >
                {d}
              </span>
            ))}
          </span>
          {state.lastRoll.isDouble && <span className="text-matrix">double!</span>}
        </div>
      )}

      {error && <p className="text-xs text-magenta">⚠ {error}</p>}
    </div>
  );
}
