'use client';

import { useMemo } from 'react';
import { useGameState } from '@/hooks/useGameState';
import { useChat } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import Lobby from '@/components/Lobby';
import Board from '@/components/Board';
import Controls from '@/components/Controls';
import PlayerPanel from '@/components/PlayerPanel';
import Auction from '@/components/Auction';
import Chat from '@/components/Chat';
import VoiceBar from '@/components/VoiceBar';

export default function Page() {
  const game = useGameState();
  const { snapshot, lobby, me, error, dispatch, socket } = game;

  // Chat + voice ride on the shared socket and are always mounted once connected.
  const chat = useChat(socket, true);
  const voice = useVoice(socket, me);

  // Voice peers = every other seated player.
  const peers = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.state.playerOrder
      .filter((id) => id !== me)
      .map((id) => ({ id, name: snapshot.state.players[id]?.name ?? id }));
  }, [snapshot, me]);

  if (!snapshot || !lobby?.started) {
    return <Lobby game={game} />;
  }

  const inAuction = snapshot.state.phase === 'AUCTION';

  return (
    <main className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_340px]">
      <section className="flex items-center justify-center">
        <Board state={snapshot.state} optimistic={game.optimistic} />
      </section>

      <aside className="flex flex-col gap-4">
        <Controls state={snapshot.state} me={me} error={error} dispatch={dispatch} />
        <VoiceBar voice={voice} peers={peers} />
        <PlayerPanel state={snapshot.state} me={me} events={snapshot.events} dispatch={dispatch} />
        <Chat chat={chat} me={me} />
      </aside>

      {inAuction && <Auction state={snapshot.state} me={me} dispatch={dispatch} />}
    </main>
  );
}
