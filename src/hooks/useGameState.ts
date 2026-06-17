'use client';

// Silicon Streets — client game hook. Holds the authoritative snapshot streamed
// from the server and applies actions OPTIMISTICALLY using the same isomorphic
// engine reducer for instant feedback. The server's GameState broadcast always
// reconciles (overrides) local state by hash; a rejection rolls back.

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { applyAction } from '@/engine/reducer';
import type { GameAction } from '@/engine/types';
import {
  C2S, S2C,
  type GameStateMsg, type JoinedRes, type LobbyUpdateMsg, type ErrorMsg,
} from '@/server/protocol';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3001';

export interface UseGame {
  connected: boolean;
  me: string | null;
  roomId: string | null;
  lobby: LobbyUpdateMsg | null;
  snapshot: GameStateMsg | null;
  optimistic: boolean;
  error: string | null;
  createRoom: (name: string) => void;
  joinRoom: (roomId: string, name: string) => void;
  setReady: (ready: boolean) => void;
  start: () => void;
  /** Submit an action; playerId is stamped server-side, so omit it here. */
  dispatch: (action: Omit<GameAction, 'playerId'>) => void;
}

export function useGameState(): UseGame {
  const socketRef = useRef<Socket | null>(null);
  const authRef = useRef<GameStateMsg | null>(null); // last server-confirmed snapshot
  const meRef = useRef<string | null>(null);

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

    return () => {
      socket.close();
    };
  }, []);

  const emit = (event: string, payload?: unknown): void => {
    socketRef.current?.emit(event, payload);
  };

  const createRoom = useCallback((name: string) => emit(C2S.CreateRoom, { name }), []);
  const joinRoom = useCallback((id: string, name: string) => emit(C2S.JoinRoom, { roomId: id, name }), []);
  const setReady = useCallback((ready: boolean) => emit(C2S.SetReady, { ready }), []);
  const start = useCallback(() => emit(C2S.StartGame), []);

  const dispatch = useCallback((partial: Omit<GameAction, 'playerId'>) => {
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
    connected, me, roomId, lobby, snapshot, optimistic, error,
    createRoom, joinRoom, setReady, start, dispatch,
  };
}
