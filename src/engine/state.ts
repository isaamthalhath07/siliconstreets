// Silicon Streets — game bootstrap. Builds the initial authoritative GameState.

import { GameConfig, GameState, Player, PlayerId, TileState } from './types';
import { BOARD } from './board';
import { seedFromString } from './rng';
import { hashState } from './hash';

export const STARTING_BALANCE = 1500;

/** Defaults applied when the lobby leaves an option unset. */
export const DEFAULT_CONFIG: GameConfig = { auctionsEnabled: true };

interface SeatInput {
  id: PlayerId;
  name: string;
}

/** Construct a fresh, deterministic game. `seed` defaults to gameId-derived;
 *  `config` defaults to the standard ruleset. */
export function createGame(
  gameId: string,
  seats: SeatInput[],
  seed?: number,
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  if (seats.length < 2 || seats.length > 8) {
    throw new Error('Silicon Streets requires 2-8 players');
  }

  const players: Record<PlayerId, Player> = {};
  for (const seat of seats) {
    players[seat.id] = {
      id: seat.id,
      name: seat.name,
      balance: STARTING_BALANCE,
      position: 0,
      inventory: [],
      inQuarantine: false,
      quarantineTurns: 0,
      isBankrupt: false,
      isConnected: true,
    };
  }

  const boardState: TileState[] = BOARD.map((tile) => ({
    index: tile.index,
    ownerId: null,
    developmentLevel: 0,
    isMortgaged: false,
  }));

  const state: GameState = {
    gameId,
    auctionsEnabled: config.auctionsEnabled,
    phase: 'AWAIT_ROLL',
    playerOrder: seats.map((s) => s.id),
    activePlayerId: seats[0].id,
    players,
    boardState,
    lastRoll: null,
    auction: null,
    pendingTrade: null,
    doublesCount: 0,
    rngState: seed ?? seedFromString(gameId),
    turnHistory: [],
    stateHash: '',
  };

  state.stateHash = hashState(state);
  return state;
}
