'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseChat } from '@/hooks/useChat';

interface ChatProps {
  chat: UseChat;
  me: string | null;
}

export default function Chat({ chat, me }: ChatProps) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    chat.markRead();
  }, [chat.messages, chat.markRead]);

  const submit = () => {
    chat.send(draft);
    setDraft('');
  };

  return (
    <div className="glass flex max-h-72 flex-col rounded-xl">
      <h2 className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs uppercase tracking-widest text-term-dim">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyber" /> Comms Channel
      </h2>

      <div className="scroll-thin flex-1 space-y-1.5 overflow-y-auto px-3 py-2 text-xs">
        {chat.messages.length === 0 && (
          <p className="text-term-dim">No transmissions yet. Say hello to the table.</p>
        )}
        {chat.messages.map((m, i) => {
          const mine = m.playerId === me;
          return (
            <div key={i} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="text-[9px] uppercase tracking-wider text-term-dim">
                {mine ? 'you' : m.name}
              </span>
              <span
                className={`max-w-[85%] break-words rounded-lg px-2.5 py-1.5 ${
                  mine ? 'bg-cyber/15 text-cyber' : 'bg-white/5 text-term-text'
                }`}
              >
                {m.text}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 border-t border-white/10 p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Message the table…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs text-term-text outline-none focus:border-cyber"
        />
        <button
          onClick={submit}
          disabled={!draft.trim()}
          className="btn-glass rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyber"
        >
          Send
        </button>
      </div>
    </div>
  );
}
