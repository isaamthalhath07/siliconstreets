'use client';

import { useGameState } from '@/hooks/useGameState';
import Lobby from '@/components/Lobby';
import Board from '@/components/Board';
import Controls from '@/components/Controls';
import PlayerPanel from '@/components/PlayerPanel';

export default function Page() {
  const game = useGameState();
  const { snapshot, lobby, me, error, dispatch } = game;

  // Show the live game once a snapshot exists and the lobby has started.
  if (!snapshot || !lobby?.started) {
    return <Lobby game={game} />;
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <section className="flex items-center justify-center">
        <Board state={snapshot.state} optimistic={game.optimistic} />
      </section>
      <aside className="flex flex-col gap-4">
        <Controls state={snapshot.state} me={me} error={error} dispatch={dispatch} />
        <PlayerPanel state={snapshot.state} me={me} events={snapshot.events} dispatch={dispatch} />
      </aside>
    </main>
  );
}
