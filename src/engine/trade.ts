// Silicon Streets — peer-to-peer trade negotiation. The active player proposes
// a deal (deeds + cash, both directions) to one counterparty during a manage
// phase; the counterparty accepts/rejects (or the proposer withdraws). Pure and
// deterministic: the trade id is derived from turnHistory length, never random.

import { GameState, PlayerId, TileIndex } from './types';
import { BOARD } from './board';
import { fail } from './errors';

export interface ProposeInput {
  playerId: PlayerId;
  to: PlayerId;
  offerTiles: TileIndex[];
  offerCash: number;
  wantTiles: TileIndex[];
  wantCash: number;
}

/** Trades may only be floated on the proposer's own turn, between segments. */
function assertManagePhase(s: GameState): void {
  if (s.phase !== 'AWAIT_ROLL' && s.phase !== 'RESOLVED') {
    fail('you can only negotiate on your turn');
  }
}

const cleanCash = (n: number): number => {
  if (!Number.isInteger(n) || n < 0) fail('cash must be a non-negative whole number');
  return n;
};

const cleanTiles = (tiles: TileIndex[]): TileIndex[] => {
  if (!Array.isArray(tiles)) fail('malformed tile list');
  return [...new Set(tiles)];
};

/** A party must own each listed deed (undeveloped) and cover its cash leg. */
function validateSide(s: GameState, owner: PlayerId, tiles: TileIndex[], cash: number): void {
  if (s.players[owner].balance < cash) fail(`${s.players[owner].name} cannot cover ${cash}`);
  for (const idx of tiles) {
    const ts = s.boardState[idx];
    if (!ts || ts.ownerId !== owner) fail(`${s.players[owner].name} does not own ${BOARD[idx]?.name ?? idx}`);
    if (ts.developmentLevel > 0) fail(`sell buildings on ${BOARD[idx].name} before trading it`);
  }
}

export function proposeTrade(s: GameState, a: ProposeInput, ev: string[]): void {
  assertManagePhase(s);
  if (s.pendingTrade) fail('resolve the open trade first');
  if (a.to === a.playerId) fail('you cannot trade with yourself');
  const to = s.players[a.to];
  if (!to) fail('unknown counterparty');
  if (to.isBankrupt) fail('counterparty is out of the game');

  const offerTiles = cleanTiles(a.offerTiles);
  const wantTiles = cleanTiles(a.wantTiles);
  const offerCash = cleanCash(a.offerCash);
  const wantCash = cleanCash(a.wantCash);
  if (offerTiles.length + wantTiles.length + offerCash + wantCash === 0) {
    fail('a trade must move at least one asset');
  }
  validateSide(s, a.playerId, offerTiles, offerCash);
  validateSide(s, a.to, wantTiles, wantCash);

  s.pendingTrade = {
    id: `trade-${s.turnHistory.length}`,
    from: a.playerId,
    to: a.to,
    offerTiles,
    offerCash,
    wantTiles,
    wantCash,
  };
  ev.push(`${s.players[a.playerId].name} proposed a trade to ${to.name}`);
}

function moveTile(s: GameState, idx: TileIndex, owner: PlayerId, newOwner: PlayerId): void {
  s.boardState[idx].ownerId = newOwner;
  const o = s.players[owner];
  o.inventory = o.inventory.filter((i) => i !== idx);
  s.players[newOwner].inventory.push(idx);
}

export function resolveTrade(
  s: GameState,
  playerId: PlayerId,
  tradeId: string,
  accept: boolean,
  ev: string[],
): void {
  const t = s.pendingTrade;
  if (!t || t.id !== tradeId) return fail('no such trade');
  const isRecipient = playerId === t.to;
  const isProposer = playerId === t.from;
  if (!isRecipient && !isProposer) fail('this trade is not yours to resolve');
  if (isProposer && accept) fail('the proposer cannot accept their own offer');

  if (!accept) {
    s.pendingTrade = null;
    ev.push(`trade ${isProposer ? 'withdrawn' : 'declined'}`);
    return;
  }

  // Accepted by the recipient — re-validate (state may have shifted) then swap.
  validateSide(s, t.from, t.offerTiles, t.offerCash);
  validateSide(s, t.to, t.wantTiles, t.wantCash);
  for (const idx of t.offerTiles) moveTile(s, idx, t.from, t.to);
  for (const idx of t.wantTiles) moveTile(s, idx, t.to, t.from);
  s.players[t.from].balance += t.wantCash - t.offerCash;
  s.players[t.to].balance += t.offerCash - t.wantCash;
  s.pendingTrade = null;
  ev.push(`${s.players[t.to].name} accepted the trade with ${s.players[t.from].name}`);
}
