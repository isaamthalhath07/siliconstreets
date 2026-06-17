// Silicon Streets — game bootstrap. Builds the initial authoritative GameState.

import { GameState, Player, PlayerId, TileState } from './types';
import { BOARD } from './board';
import { seedFromString } from './rng';
import { hashState } from './hash';

export const STARTING_BALANCE = 1500;

interface SeatInput {
  id: PlayerId;
  name: string;
}

/** Construct a fresh, deterministic game. `seed` defaults to gameId-derived. */
export function createGame(
  gameId: string,
  seats: SeatInput[],
  seed?: number,
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
    phase: 'AWAIT_ROLL',
    playerOrder: seats.map((s) => s.id),
    activePlayerId: seats[0].id,
    players,
    boardState,
    lastRoll: null,
    auction: null,
    doublesCount: 0,
    rngState: seed ?? seedFromString(gameId),
    turnHistory: [],
    stateHash: '',
  };

  state.stateHash = hashState(state);
  return state;
}
