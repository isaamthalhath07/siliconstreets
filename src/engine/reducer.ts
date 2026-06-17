// Silicon Streets — deterministic state machine. The ONLY entry point that
// mutates a game. Pure: (state, action) => ActionResult. Never touches I/O.
// Invalid actions throw and surface as { ok:false }; valid ones return a fresh,
// re-hashed state plus an appended turnHistory record (atomicity, Rules §2).

import {
  ActionResult,
  GameAction,
  GameState,
  Player,
  Property,
  TileType,
  TurnRecord,
} from './types';
import { BOARD, BAIL_COST, SECTOR_GROUPS } from './board';
import { isOwnable } from './types';
import { rollDice } from './dice';
import { hashState } from './hash';
import { deepClone } from './clone';
import {
  advanceTurn,
  moveAndResolve,
  sendToQuarantine,
  setPostActionPhase,
  transfer,
} from './movement';

class RuleError extends Error {}
const fail = (msg: string): never => {
  throw new RuleError(msg);
};

const active = (s: GameState): Player => s.players[s.activePlayerId];

/** Actions that only the active, non-bankrupt player may issue. */
const ACTIVE_ONLY = new Set<GameAction['type']>([
  'ROLL_DICE', 'BUY_PROPERTY', 'DECLINE_PROPERTY', 'BUILD', 'SELL_BUILDING',
  'MORTGAGE', 'UNMORTGAGE', 'PAY_BAIL', 'END_TURN', 'DECLARE_BANKRUPTCY',
]);

export function applyAction(state: GameState, action: GameAction): ActionResult {
  const next: GameState = deepClone(state);
  const events: string[] = [];
  try {
    if (next.phase === 'GAME_OVER') fail('game is over');
    if (ACTIVE_ONLY.has(action.type)) {
      if (action.playerId !== next.activePlayerId) fail('not your turn');
      if (active(next).isBankrupt) fail('player is bankrupt');
    }
    route(next, action, events);
  } catch (err) {
    if (err instanceof RuleError) return { ok: false, error: err.message };
    throw err;
  }
  next.stateHash = hashState(next);
  const record: TurnRecord = {
    seq: next.turnHistory.length,
    playerId: action.playerId,
    action,
    resultHash: next.stateHash,
    timestamp: Date.now(),
  };
  next.turnHistory = [...next.turnHistory, record];
  return { ok: true, state: next, events };
}

function route(s: GameState, a: GameAction, ev: string[]): void {
  switch (a.type) {
    case 'ROLL_DICE': return rollAction(s, ev);
    case 'BUY_PROPERTY': return buyAction(s, a.tile, ev);
    case 'DECLINE_PROPERTY': return declineAction(s, ev);
    case 'BUILD': return buildAction(s, a.tile, ev);
    case 'SELL_BUILDING': return sellAction(s, a.tile, ev);
    case 'MORTGAGE': return mortgageAction(s, a.tile, ev);
    case 'UNMORTGAGE': return unmortgageAction(s, a.tile, ev);
    case 'PAY_BAIL': return bailAction(s, ev);
    case 'END_TURN': return endTurnAction(s);
    case 'DECLARE_BANKRUPTCY': return bankruptcyAction(s, ev);
    case 'PLACE_BID':
    case 'PROPOSE_TRADE':
    case 'RESOLVE_TRADE':
      return fail(`${a.type} not yet implemented`);
    default:
      return fail('unknown action');
  }
}

// --- turn actions ----------------------------------------------------------

function rollAction(s: GameState, ev: string[]): void {
  if (s.phase !== 'AWAIT_ROLL') fail('cannot roll right now');
  const { roll, rngState } = rollDice(s.rngState);
  s.rngState = rngState;
  s.lastRoll = roll;
  const player = active(s);
  const total = roll.d1 + roll.d2;
  ev.push(`${player.name} rolled ${roll.d1}+${roll.d2}${roll.isDouble ? ' (double)' : ''}`);

  if (player.inQuarantine) {
    if (roll.isDouble) {
      player.inQuarantine = false;
      player.quarantineTurns = 0;
      ev.push(`${player.name} compiled clean — released from Quarantine`);
      return moveAndResolve(s, total, ev);
    }
    player.quarantineTurns += 1;
    if (player.quarantineTurns >= 3) {
      transfer(s, player.id, null, BAIL_COST, ev);
      player.inQuarantine = false;
      player.quarantineTurns = 0;
      ev.push(`${player.name} paid bail after 3 turns`);
      return moveAndResolve(s, total, ev);
    }
    s.phase = 'RESOLVED';
    ev.push(`${player.name} stays in Quarantine (turn ${player.quarantineTurns})`);
    return;
  }

  s.doublesCount = roll.isDouble ? s.doublesCount + 1 : 0;
  if (s.doublesCount === 3) {
    sendToQuarantine(s, player);
    s.phase = 'RESOLVED';
    ev.push(`${player.name} rolled 3 doubles — speeding to Quarantine`);
    return;
  }
  moveAndResolve(s, total, ev);
}

function buyAction(s: GameState, tileIdx: number, ev: string[]): void {
  if (s.phase !== 'AWAIT_ACTION') fail('no purchase pending');
  const player = active(s);
  if (tileIdx !== player.position) fail('can only buy the tile you landed on');
  const tile = BOARD[tileIdx];
  if (!isOwnable(tile)) return fail('tile is not for sale');
  const ts = s.boardState[tileIdx];
  if (ts.ownerId) fail('already owned');
  if (player.balance < tile.cost) fail('insufficient funds');
  player.balance -= tile.cost;
  ts.ownerId = player.id;
  player.inventory.push(tileIdx);
  ev.push(`${player.name} acquired ${tile.name} for ${tile.cost}`);
  setPostActionPhase(s);
}

function declineAction(s: GameState, ev: string[]): void {
  if (s.phase !== 'AWAIT_ACTION') fail('nothing to decline');
  ev.push(`${active(s).name} declined to buy (auction not yet wired)`);
  setPostActionPhase(s);
}

// --- property management (allowed in AWAIT_ROLL or RESOLVED) ----------------

function assertManagePhase(s: GameState): void {
  if (s.phase !== 'AWAIT_ROLL' && s.phase !== 'RESOLVED') {
    fail('cannot manage property mid-resolution');
  }
}

function ownedProperty(s: GameState, tileIdx: number): Property {
  const tile = BOARD[tileIdx];
  if (!isOwnable(tile)) fail('not an ownable tile');
  if (s.boardState[tileIdx].ownerId !== s.activePlayerId) fail('you do not own this');
  return tile as Property;
}

function buildAction(s: GameState, tileIdx: number, ev: string[]): void {
  assertManagePhase(s);
  const tile = ownedProperty(s, tileIdx);
  if (tile.type !== TileType.Property) fail('only sector properties can be developed');
  const group = SECTOR_GROUPS[tile.sector];
  if (!group.every((i) => s.boardState[i].ownerId === s.activePlayerId)) {
    fail('must own the full sector to develop');
  }
  const ts = s.boardState[tileIdx];
  if (ts.isMortgaged) fail('cannot develop a mortgaged tile');
  if (ts.developmentLevel >= 5) fail('already at Data Center');
  const minLevel = Math.min(...group.map((i) => s.boardState[i].developmentLevel));
  if (ts.developmentLevel > minLevel) fail('must build evenly across the sector');
  if (active(s).balance < tile.buildCost) fail('insufficient funds to build');
  active(s).balance -= tile.buildCost;
  ts.developmentLevel += 1;
  ev.push(`${tile.name} upgraded to level ${ts.developmentLevel}`);
}

function sellAction(s: GameState, tileIdx: number, ev: string[]): void {
  assertManagePhase(s);
  const tile = ownedProperty(s, tileIdx);
  const ts = s.boardState[tileIdx];
  if (ts.developmentLevel <= 0) fail('nothing built here');
  const group = SECTOR_GROUPS[tile.sector];
  const maxLevel = Math.max(...group.map((i) => s.boardState[i].developmentLevel));
  if (ts.developmentLevel < maxLevel) fail('must sell evenly across the sector');
  ts.developmentLevel -= 1;
  active(s).balance += Math.floor(tile.buildCost / 2);
  ev.push(`${tile.name} downgraded to level ${ts.developmentLevel}`);
}

function mortgageAction(s: GameState, tileIdx: number, ev: string[]): void {
  assertManagePhase(s);
  const tile = ownedProperty(s, tileIdx);
  const ts = s.boardState[tileIdx];
  if (ts.isMortgaged) fail('already mortgaged');
  if (ts.developmentLevel > 0) fail('sell buildings before mortgaging');
  ts.isMortgaged = true;
  active(s).balance += tile.mortgageValue;
  ev.push(`${tile.name} mortgaged for ${tile.mortgageValue}`);
}

function unmortgageAction(s: GameState, tileIdx: number, ev: string[]): void {
  assertManagePhase(s);
  const tile = ownedProperty(s, tileIdx);
  const ts = s.boardState[tileIdx];
  if (!ts.isMortgaged) fail('not mortgaged');
  const payoff = Math.ceil(tile.mortgageValue * 1.1); // 10% interest
  if (active(s).balance < payoff) fail('insufficient funds to lift mortgage');
  active(s).balance -= payoff;
  ts.isMortgaged = false;
  ev.push(`${tile.name} mortgage lifted for ${payoff}`);
}

function bailAction(s: GameState, ev: string[]): void {
  if (s.phase !== 'AWAIT_ROLL') fail('cannot post bail now');
  const player = active(s);
  if (!player.inQuarantine) fail('not in Quarantine');
  if (player.balance < BAIL_COST) fail('insufficient funds for bail');
  transfer(s, player.id, null, BAIL_COST, ev);
  player.inQuarantine = false;
  player.quarantineTurns = 0;
  ev.push(`${player.name} posted ${BAIL_COST} bail`);
}

function endTurnAction(s: GameState): void {
  if (s.phase !== 'RESOLVED') fail('turn is not finished');
  advanceTurn(s);
}

function bankruptcyAction(s: GameState, ev: string[]): void {
  const player = active(s);
  player.balance = 0;
  for (const idx of player.inventory) {
    const ts = s.boardState[idx];
    ts.ownerId = null;
    ts.developmentLevel = 0;
    ts.isMortgaged = false;
  }
  player.inventory = [];
  player.isBankrupt = true;
  ev.push(`${player.name} declared bankruptcy`);
  advanceTurn(s);
}
