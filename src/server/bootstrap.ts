// Silicon Streets — runtime entrypoint. The ONLY file that imports socket.io.
// Excluded from the strict typecheck until `npm install` provides the dep
// (see tsconfig "exclude"); run with: npx tsx src/server/bootstrap.ts
//
// socket.io's Server/Socket are structurally compatible with our ServerLike /
// SocketLike transport interfaces, so the cast is the single integration seam.

import { Server } from 'socket.io';
import { createServer } from 'node:http';
import { connectGateway } from './gateway';
import { RoomManager } from './RoomManager';
import { InMemoryStore } from './store';
import { S2C, type ServerLike, type KickedMsg } from './protocol';

const PORT = Number(process.env.PORT ?? 3001);
// Idle players are evicted from the pre-game lobby after this long without
// activity; the sweep runs on a fixed cadence. Both are env-tunable.
const IDLE_MS = Number(process.env.LOBBY_IDLE_MS ?? 90_000);
const SWEEP_MS = Number(process.env.LOBBY_SWEEP_MS ?? 20_000);
// Delay between a bot's moves so its turn is watchable (dice, tokens, sounds).
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 850);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? '*' },
});

// Swap InMemoryStore for an Upstash Redis adapter (same Store interface) in prod.
const manager = new RoomManager(new InMemoryStore());
connectGateway(io as unknown as ServerLike, manager, {
  schedule: (fn, ms) => setTimeout(fn, ms),
  botDelayMs: BOT_DELAY_MS,
});

// Periodic idle sweep: evict abandoned lobby seats and tell the room.
const sweep = setInterval(() => {
  const kicked = manager.sweepIdle(IDLE_MS);
  const rooms = new Set<string>();
  for (const k of kicked) {
    io.to(k.roomId).emit(S2C.Kicked, { playerId: k.playerId, reason: 'inactivity' } satisfies KickedMsg);
    rooms.add(k.roomId);
  }
  for (const roomId of rooms) {
    const view = manager.lobbyView(roomId);
    if (view) io.to(roomId).emit(S2C.LobbyUpdate, view);
  }
}, SWEEP_MS);
sweep.unref(); // never keep the process alive solely for the sweep

httpServer.listen(PORT, () => {
  console.log(`[silicon-streets] socket authority listening on :${PORT}`);
});
