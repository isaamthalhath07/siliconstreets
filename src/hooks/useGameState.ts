'use client';

// Silicon Streets — client game hook. Holds the authoritative snapshot streamed
// from the server and applies actions OPTIMISTICALLY using the same isomorphic
// engine reducer for instant feedback. The server's GameState broadcast always
// reconciles (overrides) local state by hash; a rejection rolls back.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { applyAction } from '@/engine/reducer';
import type { GameAction, PlayerAction } from '@/engine/types';
import {
  C2S, S2C,
  type GameStateMsg, type JoinedRes, type LobbyUpdateMsg, type ErrorMsg, type KickedMsg,
} from '@/server/protocol';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export interface UseGame {
  /** Live socket, exposed so chat/voice hooks can share the one connection. */
  socket: Socket | null;
  connected: boolean;
  me: string | null;
  roomId: string | null;
  lobby: LobbyUpdateMsg | null;
  snapshot: GameStateMsg | null;
  optimistic: boolean;
  error: string | null;
  createRoom: (name: string, opts?: { maxPlayers?: number; auctionsEnabled?: boolean }) => void;
  joinRoom: (roomId: string, name: string) => void;
  setReady: (ready: boolean) => void;
  /** Host: add an AI player to fill a seat. */
  addBot: () => void;
  /** Host: remove a previously added bot. */
  removeBot: (botId: string) => void;
  start: () => void;
  /** Submit an action; playerId is stamped server-side, so omit it here. */
  dispatch: (action: PlayerAction) => void;
}

export function useGameState(): UseGame {
  const socketRef = useRef<Socket | null>(null);
  const authRef = useRef<GameStateMsg | null>(null); // last server-confirmed snapshot
  const meRef = useRef<string | null>(null);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyUpdateMsg | null>(null);
  const [snapshot, setSnapshot] = useState<GameStateMsg | null>(null);
  const [optimistic, setOptimistic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket'] });
    socketRef.current = socket;
    setSocket(socket);

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(S2C.Joined, (m: JoinedRes) => {
      meRef.current = m.playerId;
      setMe(m.playerId);
      setRoomId(m.roomId);
    });
    socket.on(S2C.LobbyUpdate, (m: LobbyUpdateMsg) => setLobby(m));
    socket.on(S2C.GameState, (m: GameStateMsg) => {
      authRef.current = m;      // authoritative — reconciles any optimistic state
      setSnapshot(m);
      setOptimistic(false);
    });
    socket.on(S2C.Error, (e: ErrorMsg) => {
      setError(e.message);
      if (authRef.current) setSnapshot(authRef.current); // roll back optimism
      setOptimistic(false);
    });
    socket.on(S2C.Kicked, (m: KickedMsg) => {
      if (m.playerId !== meRef.current) return; // someone else left the roster
      authRef.current = null;
      meRef.current = null;
      setMe(null);
      setRoomId(null);
      setSnapshot(null);
      setError('You were removed from the lobby for inactivity.');
    });

    // Liveness: emit a throttled heartbeat on real user activity so present-but-
    // quiet players aren't swept, while genuinely abandoned tabs time out.
    let lastPing = 0;
    const ping = (): void => {
      const now = Date.now();
      if (now - lastPing > 15_000) {
        lastPing = now;
        socket.emit(C2S.Heartbeat);
      }
    };
    const activity = ['mousemove', 'keydown', 'click', 'touchstart'];
    activity.forEach((e) => window.addEventListener(e, ping, { passive: true }));

    return () => {
      activity.forEach((e) => window.removeEventListener(e, ping));
      socket.close();
    };
  }, []);

  const emit = (event: string, payload?: unknown): void => {
    socketRef.current?.emit(event, payload);
  };

  const createRoom = useCallback(
    (name: string, opts?: { maxPlayers?: number; auctionsEnabled?: boolean }) =>
      emit(C2S.CreateRoom, { name, ...opts }),
    [],
  );
  const joinRoom = useCallback((id: string, name: string) => emit(C2S.JoinRoom, { roomId: id, name }), []);
  const setReady = useCallback((ready: boolean) => emit(C2S.SetReady, { ready }), []);
  const addBot = useCallback(() => emit(C2S.AddBot), []);
  const removeBot = useCallback((botId: string) => emit(C2S.RemoveBot, { botId }), []);
  const start = useCallback(() => emit(C2S.StartGame), []);

  const dispatch = useCallback((partial: PlayerAction) => {
    setError(null);
    const current = authRef.current;
    const pid = meRef.current;
    if (current && pid) {
      // Optimistic: run the action locally through the shared engine.
      const action = { ...partial, playerId: pid } as GameAction;
      const res = applyAction(current.state, action);
      if (res.ok) {
        setSnapshot({
          hash: res.state.stateHash,
          seq: res.state.turnHistory.length,
          state: res.state,
          events: res.events,
        });
        setOptimistic(true);
      }
    }
    emit(C2S.GameAction, partial); // server validates authoritatively
  }, []);

  return {
    socket, connected, me, roomId, lobby, snapshot, optimistic, error,
    createRoom, joinRoom, setReady, addBot, removeBot, start, dispatch,
  };
}
