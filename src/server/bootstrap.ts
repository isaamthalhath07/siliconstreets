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
import type { ServerLike } from './protocol';

const PORT = Number(process.env.PORT ?? 3001);

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? '*' },
});

// Swap InMemoryStore for an Upstash Redis adapter (same Store interface) in prod.
const manager = new RoomManager(new InMemoryStore());
connectGateway(io as unknown as ServerLike, manager);

httpServer.listen(PORT, () => {
  console.log(`[silicon-streets] socket authority listening on :${PORT}`);
});
