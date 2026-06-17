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

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="neon-text text-3xl font-bold tracking-[0.3em] text-matrix">SILICON STREETS</h1>
        <p className="mt-1 text-xs uppercase tracking-widest text-term-dim">
          {connected ? 'connection established' : 'connecting…'}
        </p>
      </header>

      {!inRoom ? (
        <div className="flex flex-col gap-3 rounded border border-term-line bg-term-panel p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="handle"
            className="rounded border border-term-line bg-term-bg px-3 py-2 text-sm text-term-text outline-none focus:border-matrix"
          />
          <button
            disabled={!connected || !name}
            onClick={() => createRoom(name)}
            className="rounded border border-matrix bg-term-bg px-3 py-2 text-sm font-bold uppercase tracking-wider text-matrix shadow-neon disabled:opacity-40"
          >
            Create Room
          </button>
          <div className="flex gap-2">
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="room id"
              className="min-w-0 flex-1 rounded border border-term-line bg-term-bg px-3 py-2 text-sm text-term-text outline-none focus:border-cyber"
            />
            <button
              disabled={!connected || !name || !joinId}
              onClick={() => joinRoom(joinId, name)}
              className="rounded border border-cyber bg-term-bg px-3 py-2 text-sm font-bold uppercase tracking-wider text-cyber shadow-cyber disabled:opacity-40"
            >
              Join
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded border border-term-line bg-term-panel p-4">
          <p className="text-xs text-term-dim">
            Room <span className="select-all text-cyber">{roomId}</span> — share to invite
          </p>
          <ul className="flex flex-col gap-1">
            {lobby!.seats.map((s) => (
              <li key={s.playerId} className="flex items-center justify-between text-sm">
                <span className="text-term-text">
                  {s.name}
                  {s.playerId === lobby!.hostId ? ' ★' : ''}
                  {s.playerId === me ? ' (you)' : ''}
                </span>
                <span className={s.ready ? 'text-matrix' : 'text-term-dim'}>{s.ready ? 'READY' : 'waiting'}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => setReady(!mySeat?.ready)}
            className="rounded border border-matrix bg-term-bg px-3 py-2 text-sm font-bold uppercase tracking-wider text-matrix"
          >
            {mySeat?.ready ? 'Unready' : 'Ready Up'}
          </button>
          {isHost && (
            <button
              disabled={!everyoneReady}
              onClick={start}
              className="rounded border border-cyber bg-term-bg px-3 py-2 text-sm font-bold uppercase tracking-wider text-cyber shadow-cyber disabled:opacity-40"
            >
              Boot Game
            </button>
          )}
        </div>
      )}

      {error && <p className="text-center text-xs text-[#ff3864]">⚠ {error}</p>}
    </main>
  );
}
