// Silicon Streets — persistence seam. GameRoom commits state in memory first
// (authoritative, synchronous) then best-effort persists through this interface.
// InMemoryStore is the default; an Upstash Redis (ephemeral game state) and a
// PostgreSQL (completed-match history) adapter implement the same contract.

import { GameState } from '../engine/types';

export interface Store {
  saveGame(roomId: string, state: GameState): Promise<void>;
  loadGame(roomId: string): Promise<GameState | null>;
  deleteGame(roomId: string): Promise<void>;
}

export class InMemoryStore implements Store {
  private games = new Map<string, GameState>();

  async saveGame(roomId: string, state: GameState): Promise<void> {
    // Clone on write so callers can't mutate the stored snapshot by reference.
    this.games.set(roomId, JSON.parse(JSON.stringify(state)) as GameState);
  }

  async loadGame(roomId: string): Promise<GameState | null> {
    const s = this.games.get(roomId);
    return s ? (JSON.parse(JSON.stringify(s)) as GameState) : null;
  }

  async deleteGame(roomId: string): Promise<void> {
    this.games.delete(roomId);
  }
}
