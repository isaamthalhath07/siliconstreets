// Silicon Streets — auction bidding rules. `startAuction` (which opens the
// auction and flips the phase) lives in movement.ts to avoid an import cycle;
// this module handles the in-auction actions: PLACE_BID and PASS_BID. Pure,
// deterministic, turn-based — exactly one bidder acts per action.

import { GameState, PlayerId, Property } from './types';
import { BOARD } from './board';
import { fail } from './errors';
import { setPostActionPhase } from './movement';

/** Common guards for any in-auction action. Returns the live auction. */
function requireTurn(s: GameState, pid: PlayerId) {
  const a = s.auction;
  if (s.phase !== 'AUCTION' || !a) return fail('no auction in progress');
  if (!a.activeBidders.includes(pid)) return fail('you are not in this auction');
  if (pid !== a.bidTurnId) return fail('not your turn to bid');
  return a;
}

export function placeBid(s: GameState, pid: PlayerId, amount: number, ev: string[]): void {
  const a = requireTurn(s, pid);
  if (!Number.isInteger(amount) || amount <= a.currentBid) {
    fail(`bid must be a whole number above ${a.currentBid}`);
  }
  if (s.players[pid].balance < amount) fail('insufficient funds for that bid');
  a.currentBid = amount;
  a.highBidderId = pid;
  ev.push(`${s.players[pid].name} bids ${amount}`);
  advance(s, ev);
}

export function passBid(s: GameState, pid: PlayerId, ev: string[]): void {
  const a = requireTurn(s, pid);
  a.activeBidders = a.activeBidders.filter((id) => id !== pid);
  ev.push(`${s.players[pid].name} passes`);
  advance(s, ev);
}

/** After every bid/pass: settle if the field has collapsed, else pass the turn. */
function advance(s: GameState, ev: string[]): void {
  const a = s.auction!;
  if (a.activeBidders.length === 0) {
    ev.push('auction closed with no sale');
    return close(s);
  }
  // A single remaining bidder who already holds the high bid wins outright.
  if (a.activeBidders.length === 1 && a.highBidderId === a.activeBidders[0]) {
    return award(s, ev);
  }
  a.bidTurnId = nextBidder(s, a.bidTurnId);
}

/** Next still-active bidder after `from`, scanning playerOrder with wraparound.
 *  Works whether `from` is still active (a bid) or just removed (a pass). */
function nextBidder(s: GameState, from: PlayerId): PlayerId {
  const order = s.playerOrder;
  let i = order.indexOf(from);
  for (let n = 0; n < order.length; n++) {
    i = (i + 1) % order.length;
    if (s.auction!.activeBidders.includes(order[i])) return order[i];
  }
  return from; // unreachable: advance() handles the 0/1-bidder cases first
}

function award(s: GameState, ev: string[]): void {
  const a = s.auction!;
  const winner = s.players[a.highBidderId!];
  const def = BOARD[a.tile] as Property;
  winner.balance -= a.currentBid;
  s.boardState[a.tile].ownerId = winner.id;
  winner.inventory.push(a.tile);
  ev.push(`${winner.name} won ${def.name} at auction for ${a.currentBid}`);
  close(s);
}

/** Tear down the auction and hand the turn back to the active player. */
function close(s: GameState): void {
  s.auction = null;
  setPostActionPhase(s);
}
