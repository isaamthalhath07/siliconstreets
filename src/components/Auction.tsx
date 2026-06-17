'use client';

import { useEffect, useState } from 'react';
import type { GameState, PlayerAction, Property } from '@/engine/types';
import { BOARD } from '@/engine/board';
import { SECTOR_COLOR, TOKEN_COLORS } from './boardLayout';
import AdSlot from './AdSlot';

interface AuctionProps {
  state: GameState;
  me: string | null;
  dispatch: (action: PlayerAction) => void;
}

export default function Auction({ state, me, dispatch }: AuctionProps) {
  const auction = state.auction;
  const minBid = (auction?.currentBid ?? 0) + 1;
  const [bid, setBid] = useState(minBid);

  // Keep the input at/above the live minimum as bids come in.
  useEffect(() => {
    setBid((b) => Math.max(b, minBid));
  }, [minBid]);

  if (!auction) return null;
  const tile = BOARD[auction.tile] as Property;
  const accent = SECTOR_COLOR[tile.sector];
  const myTurn = me === auction.bidTurnId;
  const myBalance = me ? state.players[me]?.balance ?? 0 : 0;
  const inAuction = me ? auction.activeBidders.includes(me) : false;
  const colorOf = (pid: string) =>
    TOKEN_COLORS[state.playerOrder.indexOf(pid) % TOKEN_COLORS.length];
  const canBid = myTurn && bid >= minBid && bid <= myBalance;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div className="glass-strong w-full max-w-md overflow-hidden rounded-2xl">
        <div className="h-1.5 w-full" style={{ background: accent, boxShadow: `0 0 18px ${accent}` }} />
        <div className="flex flex-col gap-4 p-5">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyber">◈ Live Auction</p>
            <h2 className="mt-1 text-2xl font-bold text-term-text">{tile.name}</h2>
            <p className="text-xs text-term-dim">List price ${tile.cost} · sold to the highest bid</p>
          </div>

          <div className="flex items-center justify-around rounded-xl border border-white/10 bg-black/20 py-3">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-term-dim">High bid</p>
              <p className="text-2xl font-bold tabular-nums text-matrix">${auction.currentBid}</p>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-term-dim">Leader</p>
              <p className="text-sm font-semibold text-term-text">
                {auction.highBidderId ? state.players[auction.highBidderId]?.name : '—'}
              </p>
            </div>
          </div>

          {/* Bidder roster + turn pointer */}
          <ul className="flex flex-wrap justify-center gap-2">
            {auction.activeBidders.map((pid) => {
              const turn = pid === auction.bidTurnId;
              return (
                <li
                  key={pid}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    turn ? 'border-matrix/60 bg-matrix/10 text-matrix' : 'border-white/10 text-term-dim'
                  }`}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf(pid) }} />
                  {state.players[pid]?.name}
                  {pid === auction.highBidderId && ' ★'}
                </li>
              );
            })}
          </ul>

          {/* Controls — only the player on the clock can act */}
          {inAuction ? (
            myTurn ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={minBid}
                    max={myBalance}
                    value={bid}
                    onChange={(e) => setBid(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm tabular-nums text-term-text outline-none focus:border-matrix"
                  />
                  <button
                    disabled={!canBid}
                    onClick={() => dispatch({ type: 'PLACE_BID', tile: auction.tile, amount: bid })}
                    className="btn-glass rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wider text-matrix shadow-neon"
                  >
                    Bid
                  </button>
                </div>
                <button
                  onClick={() => dispatch({ type: 'PASS_BID' })}
                  className="btn-glass rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-term-dim"
                >
                  Pass / Fold
                </button>
                <p className="text-center text-[10px] text-term-dim">
                  Min ${minBid} · your balance ${myBalance}
                </p>
              </div>
            ) : (
              <p className="text-center text-sm text-term-dim">
                Waiting on <span className="text-cyber">{state.players[auction.bidTurnId]?.name}</span>…
              </p>
            )
          ) : (
            <p className="text-center text-sm text-term-dim">You folded — spectating the bids.</p>
          )}

          {/* Monetization: the wait between bids is an interstitial ad slot. */}
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_AUCTION_SLOT} label="Sponsored System Update" />
        </div>
      </div>
    </div>
  );
}
