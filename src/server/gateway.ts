// Silicon Streets — socket gateway. Translates transport events into RoomManager
// calls and broadcasts authoritative snapshots. Defense-in-depth: a socket may
// only submit actions as its OWN bound PlayerId (anti-spoof); the engine reducer
// independently enforces turn order and every rule beneath this layer.

import { GameAction } from '../engine/types';
import { RoomManager } from './RoomManager';
import {
  C2S, S2C, SocketLike, ServerLike,
  JoinRoomReq, SetReadyReq, ErrorMsg,
  ChatMsg, VoiceSignalMsg, VoicePresenceMsg,
} from './protocol';

const asObj = (p: unknown): Record<string, unknown> | null =>
  typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : null;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function connectGateway(io: ServerLike, manager: RoomManager): void {
  const fail = (socket: SocketLike, code: ErrorMsg['code'], message: string): void =>
    socket.emit(S2C.Error, { code, message } satisfies ErrorMsg);

  const pushLobby = (roomId: string): void => {
    const view = manager.lobbyView(roomId);
    if (view) io.to(roomId).emit(S2C.LobbyUpdate, view);
  };

  io.on('connection', (socket: SocketLike) => {
    socket.on(C2S.CreateRoom, (payload) => {
      const name = str(asObj(payload)?.name);
      if (!name) return fail(socket, 'BAD_REQUEST', 'name is required');
      const res = manager.createRoom(name, socket.id);
      if (!res.ok) return fail(socket, 'CONFLICT', res.error);
      bind(socket, res.value.roomId, res.value.playerId);
      socket.emit(S2C.Joined, res.value);
      pushLobby(res.value.roomId);
    });

    socket.on(C2S.JoinRoom, (payload) => {
      const body = asObj(payload) as (JoinRoomReq & Record<string, unknown>) | null;
      const roomId = str(body?.roomId);
      const name = str(body?.name);
      if (!roomId || !name) return fail(socket, 'BAD_REQUEST', 'roomId and name are required');
      const res = manager.join(roomId, name, socket.id);
      if (!res.ok) return fail(socket, 'NOT_FOUND', res.error);
      bind(socket, roomId, res.value.playerId);
      socket.emit(S2C.Joined, res.value);
      pushLobby(roomId);
    });

    socket.on(C2S.SetReady, (payload) => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const ready = (asObj(payload) as SetReadyReq | null)?.ready;
      const res = manager.setReady(ctx.roomId, ctx.playerId, ready === true);
      if (!res.ok) return fail(socket, 'NOT_FOUND', res.error);
      pushLobby(ctx.roomId);
    });

    socket.on(C2S.StartGame, () => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const res = manager.start(ctx.roomId, ctx.playerId);
      if (!res.ok) return fail(socket, 'CONFLICT', res.error);
      pushLobby(ctx.roomId);
      io.to(ctx.roomId).emit(S2C.GameState, res.value);
    });

    socket.on(C2S.GameAction, (payload) => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const action = asObj(payload);
      const type = str(action?.type);
      if (!type) return fail(socket, 'BAD_REQUEST', 'malformed action');
      // Anti-spoof: ignore any playerId the client sends; stamp our own.
      const stamped = { ...action, type, playerId: ctx.playerId } as GameAction;
      const res = manager.dispatch(ctx.roomId, stamped);
      if (!res.ok) return fail(socket, 'RULE_VIOLATION', res.error);
      io.to(ctx.roomId).emit(S2C.GameState, res.message);
    });

    // --- text chat: validate, stamp identity server-side, broadcast --------
    socket.on(C2S.Chat, (payload) => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const raw = str(asObj(payload)?.text)?.trim();
      if (!raw) return fail(socket, 'BAD_REQUEST', 'empty message');
      const text = raw.slice(0, 500); // clamp
      const name = manager.memberName(ctx.roomId, ctx.playerId) ?? 'unknown';
      const msg: ChatMsg = { playerId: ctx.playerId, name, text, ts: Date.now() };
      io.to(ctx.roomId).emit(S2C.Chat, msg);
    });

    // --- voice signaling: relay verbatim to the room (peers filter by `to`) -
    socket.on(C2S.Voice, (payload) => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const body = asObj(payload);
      const to = str(body?.to);
      if (!to) return fail(socket, 'BAD_REQUEST', 'signal needs a target');
      const out: VoiceSignalMsg = { from: ctx.playerId, to, data: body?.data };
      io.to(ctx.roomId).emit(S2C.Voice, out);
    });

    socket.on(C2S.VoicePresence, (payload) => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const name = manager.memberName(ctx.roomId, ctx.playerId) ?? 'unknown';
      const out: VoicePresenceMsg = {
        playerId: ctx.playerId,
        name,
        active: asObj(payload)?.active === true,
      };
      io.to(ctx.roomId).emit(S2C.VoicePresence, out);
    });

    socket.on('disconnect', () => {
      const affected = manager.disconnect(socket.id);
      if (affected) pushLobby(affected.roomId);
    });
  });
}

function bind(socket: SocketLike, roomId: string, playerId: string): void {
  socket.data.roomId = roomId;
  socket.data.playerId = playerId;
  socket.join(roomId);
}

function ctxOf(socket: SocketLike): { roomId: string; playerId: string } | null {
  const { roomId, playerId } = socket.data;
  return roomId && playerId ? { roomId, playerId } : null;
}
