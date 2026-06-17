// Silicon Streets — authoritative game wrapper. The ONLY component that mutates
// a game's state. Wraps the pure engine reducer, enforces single-writer
// atomicity, and produces the broadcast payload for every accepted action.

import { GameAction, GameState, PlayerId } from '../engine/types';
import { createGame } from '../engine/state';
import { applyAction } from '../engine/reducer';
import { GameStateMsg } from './protocol';
import { Store } from './store';

export type DispatchResult =
  | { ok: true; message: GameStateMsg }
  | { ok: false; error: string };

interface Seat {
  id: PlayerId;
  name: string;
}

export class GameRoom {
  private state: GameState | null = null;

  constructor(
    readonly roomId: string,
    private readonly store: Store,
  ) {}

  get started(): boolean {
    return this.state !== null;
  }

  /** Build the authoritative initial state. Seed defaults to gameId-derived
   *  (deterministic); pass an explicit seed for reproducible test games. */
  start(seats: Seat[], seed?: number): GameStateMsg {
    if (this.state) throw new Error('game already started');
    this.state = createGame(this.roomId, seats, seed);
    void this.store.saveGame(this.roomId, this.state);
    return this.snapshot([`game started with ${seats.length} players`]);
  }

  /**
   * Apply one action atomically. Because Node is single-threaded and this method
   * never awaits between reading and replacing `this.state`, the in-memory commit
   * is atomic; persistence is fired afterward without blocking the broadcast.
   * The reducer itself enforces turn order and all rules — this is the choke point.
   */
  dispatch(action: GameAction): DispatchResult {
    if (!this.state) return { ok: false, error: 'game not started' };
    const result = applyAction(this.state, action);
    if (!result.ok) return { ok: false, error: result.error };
    this.state = result.state; // atomic commit (no await above this line)
    void this.store.saveGame(this.roomId, this.state); // best-effort persist
    return { ok: true, message: this.snapshot(result.events) };
  }

  /** Read-only authoritative snapshot, e.g. for a (re)connecting client. */
  current(): GameStateMsg | null {
    return this.state ? this.snapshot([]) : null;
  }

  private snapshot(events: string[]): GameStateMsg {
    const state = this.state!;
    return {
      hash: state.stateHash,
      seq: state.turnHistory.length,
      state,
      events,
    };
  }
}
