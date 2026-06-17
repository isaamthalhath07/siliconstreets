'use client';

import { useMemo, useState } from 'react';
import type { GameState, PlayerAction } from '@/engine/types';
import { BOARD } from '@/engine/board';
import { TOKEN_COLORS } from './boardLayout';

interface TradeProps {
  state: GameState;
  me: string | null;
  dispatch: (action: PlayerAction) => void;
}

const tradable = (state: GameState, pid: string): number[] =>
  (state.players[pid]?.inventory ?? []).filter((i) => state.boardState[i].developmentLevel === 0);

function DeedList({
  tiles,
  selected,
  onToggle,
}: {
  tiles: number[];
  selected: Set<number>;
  onToggle?: (i: number) => void;
}) {
  if (tiles.length === 0) return <p className="text-[11px] text-term-dim">No tradeable deeds.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tiles.map((i) => {
        const on = selected.has(i);
        return (
          <button
            key={i}
            onClick={onToggle ? () => onToggle(i) : undefined}
            className={`rounded-md border px-2 py-1 text-[11px] transition ${
              on ? 'border-matrix/60 bg-matrix/10 text-matrix' : 'border-white/10 text-term-dim'
            } ${onToggle ? 'hover:border-white/30' : 'cursor-default'}`}
          >
            {BOARD[i].name}
          </button>
        );
      })}
    </div>
  );
}

export default function Trade({ state, me, dispatch }: TradeProps) {
  const [open, setOpen] = useState(false);
  const [counter, setCounter] = useState<string>('');
  const [offer, setOffer] = useState<Set<number>>(new Set());
  const [want, setWant] = useState<Set<number>>(new Set());
  const [offerCash, setOfferCash] = useState(0);
  const [wantCash, setWantCash] = useState(0);

  const pending = state.pendingTrade;
  const myTurn = me === state.activePlayerId;
  const managePhase = state.phase === 'AWAIT_ROLL' || state.phase === 'RESOLVED';
  const canPropose = !!me && myTurn && managePhase && !pending;

  const others = useMemo(
    () => state.playerOrder.filter((id) => id !== me && !state.players[id].isBankrupt),
    [state.playerOrder, state.players, me],
  );

  const colorOf = (pid: string) => TOKEN_COLORS[state.playerOrder.indexOf(pid) % TOKEN_COLORS.length];
  const nameOf = (pid: string) => state.players[pid]?.name ?? pid;

  const openBuilder = () => {
    const first = others[0] ?? '';
    setCounter(first);
    setOffer(new Set());
    setWant(new Set());
    setOfferCash(0);
    setWantCash(0);
    setOpen(true);
  };

  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, i: number) => {
    const next = new Set(set);
    next.has(i) ? next.delete(i) : next.add(i);
    setter(next);
  };

  const sendProposal = () => {
    if (!counter) return;
    dispatch({
      type: 'PROPOSE_TRADE',
      to: counter,
      offerTiles: [...offer],
      offerCash,
      wantTiles: [...want],
      wantCash,
    });
    setOpen(false);
  };

  const myBalance = me ? state.players[me]?.balance ?? 0 : 0;
  const theirBalance = counter ? state.players[counter]?.balance ?? 0 : 0;

  return (
    <>
      {/* Trigger / pending status — sits inline in the sidebar */}
      {canPropose && (
        <button
          onClick={openBuilder}
          className="btn-glass rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider text-violet shadow-violet"
        >
          ⇄ Propose Trade
        </button>
      )}
      {pending && pending.from === me && (
        <div className="glass flex items-center justify-between rounded-xl px-3 py-2 text-xs">
          <span className="text-term-dim">
            Offer sent to <span className="text-term-text">{nameOf(pending.to)}</span> — awaiting reply
          </span>
          <button
            onClick={() => dispatch({ type: 'RESOLVE_TRADE', tradeId: pending.id, accept: false })}
            className="btn-glass rounded-md px-2 py-1 text-magenta"
          >
            Withdraw
          </button>
        </div>
      )}

      {/* Incoming offer — modal for the counterparty */}
      {pending && pending.to === me && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="glass-strong w-full max-w-md rounded-2xl p-5">
            <p className="text-center text-[10px] uppercase tracking-[0.3em] text-violet">⇄ Incoming Trade</p>
            <h2 className="mb-3 mt-1 text-center text-lg font-bold text-term-text">
              {nameOf(pending.from)} wants to deal
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-matrix/30 bg-matrix/5 p-3">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-matrix">You receive</p>
                <DeedList tiles={pending.offerTiles} selected={new Set()} />
                {pending.offerCash > 0 && <p className="mt-1 text-sm text-matrix">+ ${pending.offerCash}</p>}
                {pending.offerTiles.length === 0 && pending.offerCash === 0 && (
                  <p className="text-[11px] text-term-dim">Nothing</p>
                )}
              </div>
              <div className="rounded-xl border border-magenta/30 bg-magenta/5 p-3">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-magenta">You give</p>
                <DeedList tiles={pending.wantTiles} selected={new Set()} />
                {pending.wantCash > 0 && <p className="mt-1 text-sm text-magenta">− ${pending.wantCash}</p>}
                {pending.wantTiles.length === 0 && pending.wantCash === 0 && (
                  <p className="text-[11px] text-term-dim">Nothing</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => dispatch({ type: 'RESOLVE_TRADE', tradeId: pending.id, accept: true })}
                className="btn-glass flex-1 rounded-lg px-3 py-2 text-sm font-bold uppercase tracking-wider text-matrix shadow-neon"
              >
                Accept
              </button>
              <button
                onClick={() => dispatch({ type: 'RESOLVE_TRADE', tradeId: pending.id, accept: false })}
                className="btn-glass flex-1 rounded-lg px-3 py-2 text-sm font-bold uppercase tracking-wider text-magenta"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Builder — modal for the proposer */}
      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="glass-strong w-full max-w-lg rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-term-text">Propose a Trade</h2>
              <button onClick={() => setOpen(false)} className="text-term-dim hover:text-term-text">
                ✕
              </button>
            </div>

            <label className="mb-3 flex items-center gap-2 text-xs text-term-dim">
              Counterparty
              <select
                value={counter}
                onChange={(e) => {
                  setCounter(e.target.value);
                  setWant(new Set());
                }}
                className="flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-term-text outline-none focus:border-violet"
              >
                {others.map((id) => (
                  <option key={id} value={id} className="bg-term-panel">
                    {nameOf(id)} (${state.players[id].balance})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-term-dim">
                  <span className="h-2 w-2 rounded-full" style={{ background: me ? colorOf(me) : '#fff' }} />
                  You offer
                </p>
                <DeedList tiles={tradable(state, me ?? '')} selected={offer} onToggle={(i) => toggle(offer, setOffer, i)} />
                <CashInput label="Cash" value={offerCash} max={myBalance} onChange={setOfferCash} />
              </div>
              <div className="rounded-xl border border-white/10 p-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-term-dim">
                  <span className="h-2 w-2 rounded-full" style={{ background: counter ? colorOf(counter) : '#fff' }} />
                  You want
                </p>
                <DeedList tiles={counter ? tradable(state, counter) : []} selected={want} onToggle={(i) => toggle(want, setWant, i)} />
                <CashInput label="Cash" value={wantCash} max={theirBalance} onChange={setWantCash} />
              </div>
            </div>

            <button
              onClick={sendProposal}
              disabled={!counter || (offer.size + want.size + offerCash + wantCash === 0)}
              className="btn-glass mt-4 w-full rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-violet shadow-violet"
            >
              Send Offer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CashInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mt-2 flex items-center gap-2 text-[11px] text-term-dim">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
        className="w-24 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs tabular-nums text-term-text outline-none focus:border-cyber"
      />
    </label>
  );
}
