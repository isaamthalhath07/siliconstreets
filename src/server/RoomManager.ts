// Silicon Streets — lobby & room lifecycle. Owns the socket.id <-> PlayerId
// mapping and one GameRoom per room. Pure orchestration: it never touches the
// transport (the gateway does the emitting), so it is fully unit-testable.

import { PlayerId } from '../engine/types';
import { GameRoom, DispatchResult } from './GameRoom';
import { Store } from './store';
import { GameStateMsg, LobbyUpdateMsg, LobbySeatView } from './protocol';

interface Member {
  playerId: PlayerId;
  name: string;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
}

interface Room {
  id: string;
  hostId: PlayerId;
  members: Map<PlayerId, Member>;
  game: GameRoom;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: string): Result<never> => ({ ok: false, error });

const rid = (p: string): string => p + Math.random().toString(36).slice(2, 8);

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** Reverse index so a disconnect (which only knows socket.id) finds its seat. */
  private bySocket = new Map<string, { roomId: string; playerId: PlayerId }>();

  constructor(private readonly store: Store, private readonly seedFor?: (roomId: string) => number) {}

  createRoom(name: string, socketId: string): Result<{ roomId: string; playerId: PlayerId }> {
    const roomId = rid('room_');
    const room: Room = {
      id: roomId,
      hostId: '',
      members: new Map(),
      game: new GameRoom(roomId, this.store),
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
    if (room.members.size >= 8) return err('room is full');
    const playerId = rid('p_');
    room.members.set(playerId, { playerId, name, ready: false, connected: true, socketId });
    this.bySocket.set(socketId, { roomId, playerId });
    return ok({ roomId, playerId });
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
    }));
    return { roomId, hostId: room.hostId, started: room.game.started, seats };
  }
}
