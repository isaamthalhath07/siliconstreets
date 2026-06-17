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
  AddBot: 'lobby:addbot',     // host fills an open seat with a bot
  RemoveBot: 'lobby:removebot', // host removes a previously added bot
  GameAction: 'game:action',
  Chat: 'chat:send',          // text chat message
  Voice: 'voice:signal',      // WebRTC signaling relay (offer/answer/ICE)
  VoicePresence: 'voice:set', // announce mic on/off
  Heartbeat: 'presence:ping', // liveness ping emitted on user activity
} as const;

export const S2C = {
  Joined: 'lobby:joined',     // private ack to the joining socket
  LobbyUpdate: 'lobby:update', // room-wide roster/ready broadcast
  GameState: 'game:state',     // authoritative snapshot + hash (atomic transition)
  Chat: 'chat:msg',           // broadcast chat line
  Voice: 'voice:signal',      // relayed WebRTC signal (clients filter by `to`)
  VoicePresence: 'voice:set', // a peer toggled their mic
  Kicked: 'lobby:kicked',     // a member was removed (e.g. for inactivity)
  Error: 'error',
} as const;

// --- payloads --------------------------------------------------------------

export interface CreateRoomReq {
  name: string;
  /** Player cap (2-8). Defaults to 8 when omitted. */
  maxPlayers?: number;
  /** Whether property auctions are enabled. Defaults to true. */
  auctionsEnabled?: boolean;
}
export interface JoinRoomReq { roomId: string; name: string }
export interface SetReadyReq { ready: boolean }
export interface RemoveBotReq { botId: PlayerId }

export interface JoinedRes {
  roomId: string;
  playerId: PlayerId;
}

export interface LobbySeatView {
  playerId: PlayerId;
  name: string;
  ready: boolean;
  connected: boolean;
  /** True for AI-controlled seats added by the host. */
  isBot: boolean;
}

export interface LobbyUpdateMsg {
  roomId: string;
  hostId: PlayerId;
  started: boolean;
  /** Player cap chosen at creation. */
  maxPlayers: number;
  /** Whether auctions are enabled for this room. */
  auctionsEnabled: boolean;
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

// --- chat + voice (relay only — never touch the game engine) ---------------

export interface ChatSendReq { text: string }
export interface ChatMsg {
  playerId: PlayerId;
  name: string;
  text: string;
  ts: number;
}

/** WebRTC signaling envelope. The server relays `data` verbatim from `from`
 *  to the room; the addressed peer (`to`) consumes it, others ignore it. */
export interface VoiceSignalReq { to: PlayerId; data: unknown }
export interface VoiceSignalMsg { from: PlayerId; to: PlayerId; data: unknown }

/** A peer toggling their microphone on/off, broadcast for presence indicators. */
export interface VoicePresenceReq { active: boolean }
export interface VoicePresenceMsg {
  playerId: PlayerId;
  name: string;
  active: boolean;
}

/** Sent to a room when the server evicts a member (idle timeout). */
export interface KickedMsg {
  playerId: PlayerId;
  reason: string;
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
  /** socket.io's catch-all listener; optional so fake transports can omit it. */
  onAny?(handler: (event: string, ...args: unknown[]) => void): void;
}

export interface ServerLike {
  on(event: 'connection', handler: (socket: SocketLike) => void): void;
  to(room: string): { emit(event: string, payload: unknown): void };
}
