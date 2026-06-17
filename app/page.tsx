'use client';

import { useMemo } from 'react';
import { useGameState } from '@/hooks/useGameState';
import { useChat } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { useSound } from '@/hooks/useSound';
import Lobby from '@/components/Lobby';
import Board from '@/components/Board';
import Controls from '@/components/Controls';
import PlayerPanel from '@/components/PlayerPanel';
import Auction from '@/components/Auction';
import Trade from '@/components/Trade';
import Chat from '@/components/Chat';
import VoiceBar from '@/components/VoiceBar';

export default function Page() {
  const game = useGameState();
  const { snapshot, lobby, me, error, dispatch, socket } = game;

  // Chat + voice ride on the shared socket and are always mounted once connected.
  const chat = useChat(socket, true);
  const voice = useVoice(socket, me);

  // Procedural sound effects, driven by the authoritative event log.
  const sound = useSound(
    snapshot ? { seq: snapshot.seq, events: snapshot.events, over: snapshot.state.phase === 'GAME_OVER' } : null,
  );

  // Voice peers = every other player; sourced from the live game once started,
  // otherwise from the lobby roster so comms work while waiting too.
  const peers = useMemo(() => {
    if (snapshot) {
      return snapshot.state.playerOrder
        .filter((id) => id !== me)
        .map((id) => ({ id, name: snapshot.state.players[id]?.name ?? id }));
    }
    if (lobby) {
      return lobby.seats.filter((s) => s.playerId !== me).map((s) => ({ id: s.playerId, name: s.name }));
    }
    return [];
  }, [snapshot, lobby, me]);

  if (!snapshot || !lobby?.started) {
    return <Lobby game={game} chat={chat} voice={voice} peers={peers} />;
  }

  const inAuction = snapshot.state.phase === 'AUCTION';

  return (
    <main className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_340px]">
      <section className="flex items-center justify-center">
        <Board state={snapshot.state} optimistic={game.optimistic} />
      </section>

      <aside className="flex flex-col gap-4">
        <div className="flex justify-end">
          <button
            onClick={sound.toggle}
            title={sound.enabled ? 'Mute sound' : 'Unmute sound'}
            className="btn-glass rounded-full px-3 py-1.5 text-xs font-semibold text-term-dim"
          >
            {sound.enabled ? '🔊 Sound on' : '🔇 Muted'}
          </button>
        </div>
        <Controls state={snapshot.state} me={me} error={error} dispatch={dispatch} />
        <Trade state={snapshot.state} me={me} dispatch={dispatch} />
        <VoiceBar voice={voice} peers={peers} />
        <PlayerPanel state={snapshot.state} me={me} events={snapshot.events} dispatch={dispatch} />
        <Chat chat={chat} me={me} />
      </aside>

      {inAuction && <Auction state={snapshot.state} me={me} dispatch={dispatch} />}
    </main>
  );
}
