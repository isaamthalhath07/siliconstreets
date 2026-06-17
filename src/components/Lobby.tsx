'use client';

import { useState } from 'react';
import type { UseGame } from '@/hooks/useGameState';

export default function Lobby({ game }: { game: UseGame }) {
  const { connected, me, roomId, lobby, error, createRoom, joinRoom, setReady, start } = game;
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');

  const inRoom = !!roomId && !!lobby;
  const mySeat = lobby?.seats.find((s) => s.playerId === me);
  const isHost = lobby?.hostId === me;
  const everyoneReady = (lobby?.seats.length ?? 0) >= 2 && lobby!.seats.every((s) => s.ready);

  const field =
    'rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-term-text outline-none transition focus:border-cyber';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="holo-text animate-float text-4xl font-extrabold tracking-[0.25em]">
          SILICON STREETS
        </h1>
        <p className="mt-2 flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-term-dim">
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-matrix' : 'animate-pulse bg-magenta'}`} />
          {connected ? 'connection established' : 'connecting…'}
        </p>
      </header>

      {!inRoom ? (
        <div className="glass-strong flex flex-col gap-3 rounded-2xl p-5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your handle" className={field} />
          <button
            disabled={!connected || !name}
            onClick={() => createRoom(name)}
            className="btn-glass rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-matrix shadow-neon"
          >
            Create Room
          </button>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-term-dim">
            <span className="h-px flex-1 bg-white/10" /> or join <span className="h-px flex-1 bg-white/10" />
          </div>
          <div className="flex gap-2">
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="room id"
              className={`min-w-0 flex-1 ${field}`}
            />
            <button
              disabled={!connected || !name || !joinId}
              onClick={() => joinRoom(joinId, name)}
              className="btn-glass rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wider text-cyber shadow-cyber"
            >
              Join
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-strong flex flex-col gap-3 rounded-2xl p-5">
          <p className="text-xs text-term-dim">
            Room <span className="select-all font-semibold text-cyber">{roomId}</span> — share to invite
          </p>
          <ul className="flex flex-col gap-1.5">
            {lobby!.seats.map((s) => (
              <li
                key={s.playerId}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
              >
                <span className="text-term-text">
                  {s.name}
                  {s.playerId === lobby!.hostId ? ' ★' : ''}
                  {s.playerId === me ? ' (you)' : ''}
                </span>
                <span className={s.ready ? 'text-matrix' : 'text-term-dim'}>
                  {s.ready ? '● READY' : '○ waiting'}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setReady(!mySeat?.ready)}
            className="btn-glass rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-matrix"
          >
            {mySeat?.ready ? 'Unready' : 'Ready Up'}
          </button>
          {isHost && (
            <button
              disabled={!everyoneReady}
              onClick={start}
              className="btn-glass rounded-lg px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-cyber shadow-cyber"
            >
              ▸ Boot Game
            </button>
          )}
        </div>
      )}

      {error && <p className="text-center text-xs text-magenta">⚠ {error}</p>}
    </main>
  );
}
