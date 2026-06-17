// Silicon Streets — bot policy. A pure, deterministic function that picks the
// next action for whichever seat a bot currently controls. It is decoupled from
// the server's notion of "bot" via an injected `isBot` predicate, so the engine
// stays free of any lobby/transport concepts. The server drives these one at a
// time through the same reducer every human action goes through.

import { GameState, PlayerAction, PlayerId, Property } from './types';
import { isOwnable } from './types';
import { BOARD, BAIL_COST } from './board';

/** A reserve a bot keeps in the bank rather than spend to the last credit. */
const CASH_BUFFER = 75;

export interface BotMove {
  /** The seat the bot is acting as (active player, current bidder, or trade target). */
  readonly actor: PlayerId;
  readonly action: PlayerAction;
}

/** Decide the next move for a bot-controlled seat, or null when it is a human's
 *  move (or nothing is pending). Evaluated in priority order: an open trade
 *  addressed to a bot, then an auction turn, then the active player's turn. */
export function nextBotAction(
  s: GameState,
  isBot: (id: PlayerId) => boolean,
): BotMove | null {
  if (s.phase === 'GAME_OVER') return null;

  // A pending offer to a bot blocks progress until resolved — bots decline so
  // the proposer's turn can continue (they never initiate trades themselves).
  const trade = s.pendingTrade;
  if (trade && isBot(trade.to)) {
    return { actor: trade.to, action: { type: 'RESOLVE_TRADE', tradeId: trade.id, accept: false } };
  }

  if (s.phase === 'AUCTION' && s.auction) {
    const bidder = s.auction.bidTurnId;
    if (!isBot(bidder)) return null;
    return { actor: bidder, action: bidAction(s, bidder) };
  }

  const actor = s.activePlayerId;
  if (!isBot(actor)) return null;
  const p = s.players[actor];

  switch (s.phase) {
    case 'AWAIT_ROLL':
      // Buy out of Quarantine when flush; otherwise roll (3-turn rule auto-pays).
      if (p.inQuarantine && p.balance >= BAIL_COST + CASH_BUFFER) {
        return { actor, action: { type: 'PAY_BAIL' } };
      }
      return { actor, action: { type: 'ROLL_DICE' } };

    case 'AWAIT_ACTION': {
      const tile = BOARD[p.position];
      if (isOwnable(tile) && p.balance >= tile.cost + CASH_BUFFER) {
        return { actor, action: { type: 'BUY_PROPERTY', tile: p.position } };
      }
      // Declining is safe whether or not auctions are enabled.
      return { actor, action: { type: 'DECLINE_PROPERTY', tile: p.position } };
    }

    case 'RESOLVED':
      return { actor, action: { type: 'END_TURN' } };

    default:
      return null;
  }
}

/** Bid in modest increments up to ~80% of list price, then fold. */
function bidAction(s: GameState, bidder: PlayerId): PlayerAction {
  const a = s.auction!;
  const def = BOARD[a.tile] as Property;
  const ceiling = Math.floor(def.cost * 0.8);
  const step = Math.max(10, Math.floor(def.cost * 0.1));
  const next = a.currentBid + step;
  if (next <= ceiling && s.players[bidder].balance >= next) {
    return { type: 'PLACE_BID', tile: a.tile, amount: next };
  }
  return { type: 'PASS_BID' };
}
