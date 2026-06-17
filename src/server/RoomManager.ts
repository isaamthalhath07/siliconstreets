// Silicon Streets — lobby & room lifecycle. Owns the socket.id <-> PlayerId
// mapping and one GameRoom per room. Pure orchestration: it never touches the
// transport (the gateway does the emitting), so it is fully unit-testable.

import { GameConfig, PlayerId } from '../engine/types';
import { GameRoom, DispatchResult } from './GameRoom';
import { Store } from './store';
import { GameStateMsg, LobbyUpdateMsg, LobbySeatView } from './protocol';

interface Member {
  playerId: PlayerId;
  name: string;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  /** Epoch ms of the member's last activity; drives the idle sweep. */
  lastSeen: number;
  /** True for AI-controlled seats; bots are always ready and never swept. */
  isBot: boolean;
}

interface Room {
  id: string;
  hostId: PlayerId;
  members: Map<PlayerId, Member>;
  game: GameRoom;
  /** Player cap (2-8) chosen at creation. */
  maxPlayers: number;
  config: GameConfig;
}

export interface CreateOpts {
  maxPlayers?: number;
  auctionsEnabled?: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: string): Result<never> => ({ ok: false, error });

const rid = (p: string): string => p + Math.random().toString(36).slice(2, 8);
const clampCap = (n: number | undefined): number =>
  Math.max(2, Math.min(8, Math.floor(Number(n) || 8)));

/** Handles drawn from in lobby order so added bots read as distinct players. */
const BOT_NAMES = ['Turing', 'Lovelace', 'Hopper', 'Knuth', 'Dijkstra', 'Torvalds', 'Ritchie', 'Babbage'];

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** Reverse index so a disconnect (which only knows socket.id) finds its seat. */
  private bySocket = new Map<string, { roomId: string; playerId: PlayerId }>();

  constructor(private readonly store: Store, private readonly seedFor?: (roomId: string) => number) {}

  createRoom(name: string, socketId: string, opts: CreateOpts = {}): Result<{ roomId: string; playerId: PlayerId }> {
    const roomId = rid('room_');
    const room: Room = {
      id: roomId,
      hostId: '',
      members: new Map(),
      game: new GameRoom(roomId, this.store),
      maxPlayers: clampCap(opts.maxPlayers),
      config: { auctionsEnabled: opts.auctionsEnabled !== false }, // default on
    };
    this.rooms.set(roomId, room);
    const joined = this.join(roomId, name, socketId);
    if (!joined.ok) return joined;
    room.hostId = joined.value.playerId;
    return joined;
  }

  join(roomId: string, name: string, socketId: string): Result<{ roomId: string; playerId: PlayerId }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('room not found');
    if (room.game.started) return err('game already in progress');
    if (room.members.size >= room.maxPlayers) return err('room is full');
    const playerId = rid('p_');
    room.members.set(playerId, {
      playerId, name, ready: false, connected: true, socketId, lastSeen: Date.now(), isBot: false,
    });
    this.bySocket.set(socketId, { roomId, playerId });
    return ok({ roomId, playerId });
  }

  /** Host-only: add an AI seat (always ready, never swept) up to the cap. */
  addBot(roomId: string, requesterId: PlayerId): Result<{ playerId: PlayerId }> {
    const room = this.rooms.get(roomId);
    if (!room) return err('room not found');
    if (room.hostId !== requesterId) return err('only the host can add bots');
    if (room.game.started) return err('game already in progress');
    if (room.members.size >= room.maxPlayers) return err('room is full');
    const playerId = rid('bot_');
    const used = new Set([...room.members.values()].map((m) => m.name));
    const name = `${BOT_NAMES.find((n) => !used.has(`🤖 ${n}`)) ?? 'CPU'}`;
    room.members.set(playerId, {
      playerId, name: `🤖 ${name}`, ready: true, connected: true, socketId: null,
      lastSeen: Date.now(), isBot: true,
    });
    return ok({ playerId });
  }

  /** Host-only: remove a bot seat it previously added. */
  removeBot(roomId: string, requesterId: PlayerId, botId: PlayerId): Result<void> {
    const room = this.rooms.get(roomId);
    if (!room) return err('room not found');
    if (room.hostId !== requesterId) return err('only the host can remove bots');
    const bot = room.members.get(botId);
    if (!bot || !bot.isBot) return err('not a bot seat');
    room.members.delete(botId);
    return ok(undefined);
  }

  /** Whether a seat is an AI player (used by the bot driver). */
  isBot(roomId: string, playerId: PlayerId): boolean {
    return this.rooms.get(roomId)?.members.get(playerId)?.isBot ?? false;
  }

  /** Current authoritative snapshot for a room, or null if not started. */
  snapshot(roomId: string): GameStateMsg | null {
    return this.rooms.get(roomId)?.game.current() ?? null;
  }

  /** Record activity for the member behind a socket (resets its idle clock). */
  touch(socketId: string): void {
    const ref = this.bySocket.get(socketId);
    const member = ref && this.rooms.get(ref.roomId)?.members.get(ref.playerId);
    if (member) member.lastSeen = Date.now();
  }

  /** Evict members idle longer than `idleMs` from rooms that haven't started
   *  (the pre-game lobby). Reassigns host / deletes empty rooms. Returns the
   *  evictions so the caller can notify the room. In-progress games are spared. */
  sweepIdle(idleMs: number): { roomId: string; playerId: PlayerId }[] {
    const now = Date.now();
    const kicked: { roomId: string; playerId: PlayerId }[] = [];
    for (const room of this.rooms.values()) {
      if (room.game.started) continue;
      for (const m of [...room.members.values()]) {
        if (m.isBot) continue; // bots never time out
        if (now - m.lastSeen <= idleMs) continue;
        room.members.delete(m.playerId);
        if (m.socketId) this.bySocket.delete(m.socketId);
        kicked.push({ roomId: room.id, playerId: m.playerId });
      }
      const humans = [...room.members.values()].filter((m) => !m.isBot);
      // A lobby with no humans left (only bots, or empty) is torn down.
      if (humans.length === 0) {
        this.rooms.delete(room.id);
        continue;
      }
      // If the host was swept, hand it to a remaining human.
      if (!room.members.has(room.hostId)) room.hostId = humans[0].playerId;
    }
    return kicked;
  }

  setReady(roomId: string, playerId: PlayerId, ready: boolean): Result<void> {
    const member = this.rooms.get(roomId)?.members.get(playerId);
    if (!member) return err('not a member of this room');
    member.ready = ready;
    return ok(undefined);
  }

  /** Host-only. Requires >=2 members, all ready. Returns the opening snapshot. */
  start(roomId: string, requesterId: PlayerId): Result<GameStateMsg> {
    const room = this.rooms.get(roomId);
    if (!room) return err('room not found');
    if (room.hostId !== requesterId) return err('only the host can start');
    if (room.game.started) return err('already started');
    const seats = [...room.members.values()];
    if (seats.length < 2) return err('need at least 2 players');
    if (!seats.every((m) => m.ready)) return err('all players must be ready');
    const msg = room.game.start(
      seats.map((m) => ({ id: m.playerId, name: m.name })),
      this.seedFor?.(roomId),
      room.config,
    );
    return ok(msg);
  }

  /** Route an action to its room's authoritative GameRoom. */
  dispatch(roomId: string, action: { playerId: PlayerId }): DispatchResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'room not found' };
    return room.game.dispatch(action as Parameters<GameRoom['dispatch']>[0]);
  }

  /** Mark the seat offline; returns the room so the gateway can rebroadcast. */
  disconnect(socketId: string): { roomId: string } | null {
    const ref = this.bySocket.get(socketId);
    if (!ref) return null;
    this.bySocket.delete(socketId);
    const member = this.rooms.get(ref.roomId)?.members.get(ref.playerId);
    if (member) {
      member.connected = false;
      member.socketId = null;
    }
    return { roomId: ref.roomId };
  }

  /** Display name for a seated player, or null if unknown. */
  memberName(roomId: string, playerId: PlayerId): string | null {
    return this.rooms.get(roomId)?.members.get(playerId)?.name ?? null;
  }

  lobbyView(roomId: string): LobbyUpdateMsg | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const seats: LobbySeatView[] = [...room.members.values()].map((m) => ({
      playerId: m.playerId,
      name: m.name,
      ready: m.ready,
      connected: m.connected,
      isBot: m.isBot,
    }));
    return {
      roomId,
      hostId: room.hostId,
      started: room.game.started,
      maxPlayers: room.maxPlayers,
      auctionsEnabled: room.config.auctionsEnabled,
      seats,
    };
  }
}
