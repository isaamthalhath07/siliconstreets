'use client';

// Silicon Streets — text chat. A thin layer over the shared game socket: it
// subscribes to broadcast chat lines and exposes a `send`. The server stamps
// the author identity, so this hook is pure transport + a bounded buffer.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { C2S, S2C, type ChatMsg } from '@/server/protocol';

const MAX_LINES = 100;

export interface UseChat {
  messages: ChatMsg[];
  send: (text: string) => void;
  unread: number;
  markRead: () => void;
}

export function useChat(socket: Socket | null, open: boolean): UseChat {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!socket) return;
    const onMsg = (m: ChatMsg) => {
      setMessages((prev) => [...prev, m].slice(-MAX_LINES));
      if (!openRef.current) setUnread((n) => n + 1);
    };
    socket.on(S2C.Chat, onMsg);
    return () => {
      socket.off(S2C.Chat, onMsg);
    };
  }, [socket]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed && socket) socket.emit(C2S.Chat, { text: trimmed });
    },
    [socket],
  );

  const markRead = useCallback(() => setUnread(0), []);

  return { messages, send, unread, markRead };
}
