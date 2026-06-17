// Silicon Streets — movement, money flow, and turn rotation helpers.
// These mutate a draft GameState (already cloned by the reducer) and append
// human-readable event strings the server can stream to clients.

import { GameState, Player, Property, TileType } from './types';
import { isOwnable } from './types';
import {
  BOARD,
  BOARD_SIZE,
  REBOOT_SALARY,
  QUARANTINE_INDEX,
} from './board';
import { calculateRent } from './rent';

const active = (s: GameState): Player => s.players[s.activePlayerId];
const nonBankrupt = (s: GameState): string[] =>
  s.playerOrder.filter((id) => !s.players[id].isBankrupt);

/** Release a player's deeds back to the bank and flag them out of the game. */
export function bankrupt(state: GameState, player: Player, events: string[]): void {
  for (const idx of player.inventory) {
    const ts = state.boardState[idx];
    ts.ownerId = null;
    ts.developmentLevel = 0;
    ts.isMortgaged = false;
  }
  player.inventory = [];
  player.isBankrupt = true;
  events.push(`${player.name} is bankrupt — assets returned to the bank`);
}

/** Move `amount` from one player to another (or to the bank when toId is null).
 *  Triggers bankruptcy if the payer cannot cover it. */
export function transfer(
  state: GameState,
  fromId: string,
  toId: string | null,
  amount: number,
  events: string[],
): void {
  if (amount <= 0) return;
  const from = state.players[fromId];
  if (from.balance >= amount) {
    from.balance -= amount;
    if (toId) state.players[toId].balance += amount;
    return;
  }
  const paid = Math.max(0, from.balance);
  from.balance = 0;
  if (toId) state.players[toId].balance += paid;
  bankrupt(state, from, events);
}

export function sendToQuarantine(state: GameState, player: Player): void {
  player.position = QUARANTINE_INDEX;
  player.inQuarantine = true;
  player.quarantineTurns = 0;
  state.doublesCount = 0;
}

/** Decide the phase after a landing/buy segment: re-roll on doubles, else resolved. */
export function setPostActionPhase(state: GameState): void {
  const p = active(state);
  if (p.isBankrupt) {
    advanceTurn(state);
    return;
  }
  const r = state.lastRoll;
  state.phase =
    r?.isDouble && !p.inQuarantine && state.doublesCount < 3 ? 'AWAIT_ROLL' : 'RESOLVED';
}

/** Rotate to the next solvent player, or end the game if only one remains. */
export function advanceTurn(state: GameState): void {
  const survivors = nonBankrupt(state);
  if (survivors.length <= 1) {
    state.phase = 'GAME_OVER';
    if (survivors.length === 1) state.activePlayerId = survivors[0];
    return;
  }
  state.doublesCount = 0;
  const order = state.playerOrder;
  let i = order.indexOf(state.activePlayerId);
  do {
    i = (i + 1) % order.length;
  } while (state.players[order[i]].isBankrupt);
  state.activePlayerId = order[i];
  state.phase = 'AWAIT_ROLL';
}

/** Open an auction for the tile the active player is standing on. Used both when
 *  a player DECLINEs a purchase and when they land on a tile they cannot afford.
 *  Every solvent player joins; the lander bids first. With no eligible bidders
 *  the turn simply resolves (no sale). */
export function startAuction(state: GameState, events: string[]): void {
  const tile = active(state).position;
  const def = BOARD[tile];
  if (!isOwnable(def) || state.boardState[tile].ownerId) {
    return setPostActionPhase(state); // nothing to auction
  }
  const bidders = state.playerOrder.filter((id) => !state.players[id].isBankrupt);
  if (bidders.length === 0) return setPostActionPhase(state);
  state.auction = {
    tile,
    currentBid: 0,
    highBidderId: null,
    activeBidders: bidders,
    bidTurnId: bidders.includes(state.activePlayerId) ? state.activePlayerId : bidders[0],
  };
  state.phase = 'AUCTION';
  events.push(`${def.name} goes to auction — opening bids`);
}

function resolveLanding(
  state: GameState,
  player: Player,
  rollTotal: number,
  events: string[],
): void {
  const tile = BOARD[player.position];
  switch (tile.type) {
    case TileType.Property:
    case TileType.Network:
    case TileType.Infrastructure: {
      const ts = state.boardState[player.position];
      if (!ts.ownerId) {
        if (player.balance >= (tile as Property).cost) {
          state.phase = 'AWAIT_ACTION';
          events.push(`${tile.name} is unclaimed — buy or decline`);
        } else {
          events.push(`${tile.name} unclaimed but unaffordable for ${player.name}`);
          startAuction(state, events);
        }
        return;
      }
      if (ts.ownerId === player.id || ts.isMortgaged) return;
      const rent = calculateRent(state, player.position, player.id, rollTotal);
      transfer(state, player.id, ts.ownerId, rent, events);
      events.push(`${player.name} paid ${rent} rent on ${tile.name}`);
      return;
    }
    case TileType.Tax:
      transfer(state, player.id, null, tile.amount ?? 0, events);
      events.push(`${player.name} paid ${tile.amount ?? 0} (${tile.name})`);
      return;
    case TileType.GotoQuarantine:
      sendToQuarantine(state, player);
      events.push(`${player.name} sent to Debugger Quarantine`);
      return;
    case TileType.Event:
    case TileType.Cache:
      events.push(`${player.name} drew ${tile.name} (deck not yet wired)`);
      return;
    default:
      return; // Reboot, Sandbox, Quarantine (just visiting)
  }
}

/** Advance the active player `steps` tiles, pay reboot salary on pass, resolve
 *  the landing, then settle the phase (unless a buy decision is pending). */
export function moveAndResolve(state: GameState, steps: number, events: string[]): void {
  const player = active(state);
  const from = player.position;
  if (from + steps >= BOARD_SIZE) {
    player.balance += REBOOT_SALARY;
    events.push(`${player.name} passed Reboot (+${REBOOT_SALARY})`);
  }
  player.position = (from + steps) % BOARD_SIZE;
  resolveLanding(state, player, steps, events);
  // AWAIT_ACTION (buy decision) and AUCTION both pause the turn until resolved.
  if (state.phase !== 'AWAIT_ACTION' && state.phase !== 'AUCTION') {
    setPostActionPhase(state);
  }
}
