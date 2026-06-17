// Silicon Streets — client/server wire protocol.
// Pure types + a minimal transport abstraction so the server core never
// imports socket.io directly (only bootstrap.ts does). Keeps the authority
// layer testable with a fake transport and swappable if we change libraries.

import { GameAction, GameState, PlayerId } from '../engine/types';

// --- event names (single source of truth for both ends) --------------------

export const C2S = {
  CreateRoom: 'lobby:create',
  JoinRoom: 'lobby:join',
  SetReady: 'lobby:ready',
  StartGame: 'lobby:start',
  GameAction: 'game:action',
} as const;

export const S2C = {
  Joined: 'lobby:joined',     // private ack to the joining socket
  LobbyUpdate: 'lobby:update', // room-wide roster/ready broadcast
  GameState: 'game:state',     // authoritative snapshot + hash (atomic transition)
  Error: 'error',
} as const;

// --- payloads --------------------------------------------------------------

export interface CreateRoomReq { name: string }
export interface JoinRoomReq { roomId: string; name: string }
export interface SetReadyReq { ready: boolean }

export interface JoinedRes {
  roomId: string;
  playerId: PlayerId;
}

export interface LobbySeatView {
  playerId: PlayerId;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface LobbyUpdateMsg {
  roomId: string;
  hostId: PlayerId;
  started: boolean;
  seats: LobbySeatView[];
}

/** The atomic broadcast: every accepted action emits exactly one of these. */
export interface GameStateMsg {
  hash: string;
  seq: number;           // turnHistory length — monotonic version
  state: GameState;      // authoritative snapshot (client is view-only)
  events: string[];      // human-readable log lines for this transition
}

export interface ErrorMsg {
  code: 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' | 'RULE_VIOLATION' | 'CONFLICT';
  message: string;
}

export type ClientAction = GameAction; // re-export for the gateway boundary

// --- transport abstraction (structural subset of socket.io) ----------------

export interface SocketLike {
  readonly id: string;
  /** Per-connection scratch space (roomId / playerId binding). */
  data: { roomId?: string; playerId?: PlayerId };
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, payload: unknown): void;
  on(event: string, handler: (payload: unknown) => void): void;
  on(event: 'disconnect', handler: () => void): void;
}

export interface ServerLike {
  on(event: 'connection', handler: (socket: SocketLike) => void): void;
  to(room: string): { emit(event: string, payload: unknown): void };
}
