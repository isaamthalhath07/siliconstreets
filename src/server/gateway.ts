// Silicon Streets — socket gateway. Translates transport events into RoomManager
// calls and broadcasts authoritative snapshots. Defense-in-depth: a socket may
// only submit actions as its OWN bound PlayerId (anti-spoof); the engine reducer
// independently enforces turn order and every rule beneath this layer.

import { GameAction } from '../engine/types';
import { nextBotAction } from '../engine/bot';
import { RoomManager } from './RoomManager';
import {
  C2S, S2C, SocketLike, ServerLike,
  JoinRoomReq, SetReadyReq, ErrorMsg,
  ChatMsg, VoiceSignalMsg, VoicePresenceMsg,
} from './protocol';

const asObj = (p: unknown): Record<string, unknown> | null =>
  typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : null;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Optional wiring so bot turns can be paced. `schedule` defaults to running
 *  synchronously (handy for tests); bootstrap supplies a setTimeout-backed one. */
export interface GatewayOpts {
  schedule?: (fn: () => void, ms: number) => void;
  botDelayMs?: number;
}

export function connectGateway(io: ServerLike, manager: RoomManager, opts: GatewayOpts = {}): void {
  const schedule = opts.schedule ?? ((fn) => fn());
  const botDelayMs = opts.botDelayMs ?? 0;

  const fail = (socket: SocketLike, code: ErrorMsg['code'], message: string): void =>
    socket.emit(S2C.Error, { code, message } satisfies ErrorMsg);

  const pushLobby = (roomId: string): void => {
    const view = manager.lobbyView(roomId);
    if (view) io.to(roomId).emit(S2C.LobbyUpdate, view);
  };

  // Drive any bot-controlled seat. Each accepted bot move broadcasts a fresh
  // snapshot, then re-checks for the next one — so a bot's whole turn (and any
  // following bots) play out one paced step at a time. Stops the moment control
  // returns to a human or the game ends.
  const driveBots = (roomId: string): void => {
    const snap = manager.snapshot(roomId);
    if (!snap) return;
    const isBot = (id: string): boolean => manager.isBot(roomId, id);
    if (!nextBotAction(snap.state, isBot)) return; // nothing for a bot to do
    schedule(() => {
      const cur = manager.snapshot(roomId);
      if (!cur) return;
      const move = nextBotAction(cur.state, (id) => manager.isBot(roomId, id));
      if (!move) return;
      const res = manager.dispatch(roomId, { ...move.action, playerId: move.actor } as GameAction);
      if (!res.ok) return; // defensive: a rejected bot move just halts the chain
      io.to(roomId).emit(S2C.GameState, res.message);
      driveBots(roomId);
    }, botDelayMs);
  };

  io.on('connection', (socket: SocketLike) => {
    // Any inbound event counts as activity (resets the idle clock); clients also
    // emit a lightweight Heartbeat on user interaction. `onAny` is optional, so a
    // dedicated Heartbeat handler keeps liveness working on transports without it.
    socket.onAny?.(() => manager.touch(socket.id));
    socket.on(C2S.Heartbeat, () => manager.touch(socket.id));

    socket.on(C2S.CreateRoom, (payload) => {
      const body = asObj(payload);
      const name = str(body?.name);
      if (!name) return fail(socket, 'BAD_REQUEST', 'name is required');
      const res = manager.createRoom(name, socket.id, {
        maxPlayers: num(body?.maxPlayers),
        auctionsEnabled: body?.auctionsEnabled !== false,
      });
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
      driveBots(ctx.roomId); // first player may be a bot
    });

    // Host fills an empty seat with an AI player (always ready).
    socket.on(C2S.AddBot, () => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const res = manager.addBot(ctx.roomId, ctx.playerId);
      if (!res.ok) return fail(socket, 'CONFLICT', res.error);
      pushLobby(ctx.roomId);
    });

    socket.on(C2S.RemoveBot, (payload) => {
      const ctx = ctxOf(socket);
      if (!ctx) return fail(socket, 'FORBIDDEN', 'join a room first');
      const botId = str(asObj(payload)?.botId);
      if (!botId) return fail(socket, 'BAD_REQUEST', 'botId is required');
      const res = manager.removeBot(ctx.roomId, ctx.playerId, botId);
      if (!res.ok) return fail(socket, 'CONFLICT', res.error);
      pushLobby(ctx.roomId);
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
      driveBots(ctx.roomId); // a human action may hand control to bot(s)
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
