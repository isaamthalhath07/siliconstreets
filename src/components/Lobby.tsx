'use client';

import { useState } from 'react';
import type { UseGame } from '@/hooks/useGameState';
import type { UseChat } from '@/hooks/useChat';
import type { UseVoice } from '@/hooks/useVoice';
import Chat from './Chat';
import VoiceBar from './VoiceBar';

interface LobbyProps {
  game: UseGame;
  chat: UseChat;
  voice: UseVoice;
  peers: { id: string; name: string }[];
}

export default function Lobby({ game, chat, voice, peers }: LobbyProps) {
  const { connected, me, roomId, lobby, error, createRoom, joinRoom, setReady, addBot, removeBot, start } = game;
  const [name, setName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [auctionsEnabled, setAuctionsEnabled] = useState(true);

  const inRoom = !!roomId && !!lobby;
  const mySeat = lobby?.seats.find((s) => s.playerId === me);
  const isHost = lobby?.hostId === me;
  const everyoneReady = (lobby?.seats.length ?? 0) >= 2 && !!lobby?.seats.every((s) => s.ready);
  const seatsFull = (lobby?.seats.length ?? 0) >= (lobby?.maxPlayers ?? 8);

  const field =
    'clay-inset px-3 py-2 text-sm text-term-text outline-none placeholder:text-term-dim/70';

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
        <div className="glass-strong flex flex-col gap-4 p-6">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="your handle" className={field} />

          {/* Room setup — player cap + auctions toggle apply to Create only. */}
          <div className="flex flex-col gap-3 rounded-2xl p-3 clay-inset">
            <label className="flex items-center justify-between text-xs text-term-dim">
              Player cap
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="rounded-lg bg-[#20243a] px-2 py-1 text-sm text-term-text outline-none"
              >
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setAuctionsEnabled((v) => !v)}
              className="flex items-center justify-between text-xs text-term-dim"
            >
              Property auctions
              <span
                className={`relative inline-flex h-5 w-10 items-center rounded-full transition ${
                  auctionsEnabled ? 'bg-matrix/70' : 'bg-white/15'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    auctionsEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>
          </div>

          <button
            disabled={!connected || !name}
            onClick={() => createRoom(name, { maxPlayers, auctionsEnabled })}
            className="btn-glass px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-matrix shadow-neon"
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
              className="btn-glass px-4 py-2 text-sm font-bold uppercase tracking-wider text-cyber shadow-cyber"
            >
              Join
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-strong flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between text-xs text-term-dim">
            <span>
              Room <span className="select-all font-semibold text-cyber">{roomId}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="rounded-full bg-white/5 px-2 py-0.5">
                {lobby!.seats.length}/{lobby!.maxPlayers}
              </span>
              <span className={lobby!.auctionsEnabled ? 'text-matrix' : 'text-magenta'}>
                auctions {lobby!.auctionsEnabled ? 'on' : 'off'}
              </span>
            </span>
          </div>

          <ul className="flex flex-col gap-1.5">
            {lobby!.seats.map((s) => (
              <li
                key={s.playerId}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-sm clay-inset"
              >
                <span className="flex items-center gap-2 text-term-text">
                  {s.name}
                  {s.playerId === lobby!.hostId && <span className="text-cyber">★</span>}
                  {s.playerId === me && <span className="text-term-dim">(you)</span>}
                  {s.isBot && (
                    <span className="rounded-full bg-violet/20 px-1.5 text-[9px] uppercase tracking-wider text-violet">
                      AI
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className={s.ready ? 'text-matrix' : 'text-term-dim'}>
                    {s.ready ? '● READY' : '○ waiting'}
                  </span>
                  {isHost && s.isBot && (
                    <button
                      onClick={() => removeBot(s.playerId)}
                      title="Remove bot"
                      className="text-term-dim transition hover:text-magenta"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {isHost && (
            <button
              disabled={seatsFull}
              onClick={addBot}
              className="btn-glass px-3 py-2 text-xs font-bold uppercase tracking-wider text-violet shadow-violet"
            >
              + Add Bot
            </button>
          )}

          <button
            onClick={() => setReady(!mySeat?.ready)}
            className="btn-glass px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-matrix"
          >
            {mySeat?.ready ? 'Unready' : 'Ready Up'}
          </button>
          {isHost && (
            <button
              disabled={!everyoneReady}
              onClick={start}
              className="btn-glass px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-cyber shadow-cyber"
            >
              ▸ Boot Game
            </button>
          )}
        </div>
      )}

      {/* Comms lounge — text + voice are available the moment you're in a room. */}
      {inRoom && (
        <div className="flex flex-col gap-4">
          <VoiceBar voice={voice} peers={peers} />
          <Chat chat={chat} me={me} />
        </div>
      )}

      {error && <p className="text-center text-xs text-magenta">⚠ {error}</p>}
    </main>
  );
}
