// Silicon Streets — server authority harness (run: npx tsx src/server/__tests__/gateway.test.ts)
// Drives the gateway + RoomManager + GameRoom through a FAKE transport (no
// socket.io needed) to prove: single authoritative writer, room-wide atomic
// broadcasts, out-of-turn rejection, and the anti-spoof edge guard.

import { connectGateway } from '../gateway';
import { RoomManager } from '../RoomManager';
import { GameRoom } from '../GameRoom';
import { InMemoryStore } from '../store';
import { C2S, S2C, ServerLike, SocketLike, GameStateMsg, JoinedRes } from '../protocol';

declare const process: { exit(code: number): never };
declare const console: { log(...args: unknown[]): void };

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}

// --- fake transport --------------------------------------------------------

class FakeSocket {
  data: { roomId?: string; playerId?: string } = {};
  rooms = new Set<string>();
  private handlers = new Map<string, ((p: unknown) => void)[]>();
  inbox: { event: string; payload: unknown }[] = [];
  constructor(readonly id: string, private hub: FakeIo) {}
  join(room: string): void { this.rooms.add(room); this.hub.register(room, this); }
  leave(room: string): void { this.rooms.delete(room); }
  emit(event: string, payload: unknown): void { this.inbox.push({ event, payload }); }
  on(event: string, handler: (p: unknown) => void): void {
    (this.handlers.get(event) ?? this.handlers.set(event, []).get(event)!).push(handler);
  }
  /** Test helper: simulate a client→server message. */
  send(event: string, payload?: unknown): void {
    (this.handlers.get(event) ?? []).forEach((h) => h(payload));
  }
  last<T>(event: string): T | undefined {
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      if (this.inbox[i].event === event) return this.inbox[i].payload as T;
    }
    return undefined;
  }
  count(event: string): number {
    return this.inbox.filter((m) => m.event === event).length;
  }
}

class FakeIo {
  private connHandler: ((s: SocketLike) => void) | null = null;
  private roomMembers = new Map<string, Set<FakeSocket>>();
  on(event: 'connection', handler: (s: SocketLike) => void): void {
    if (event === 'connection') this.connHandler = handler;
  }
  to(room: string): { emit(event: string, payload: unknown): void } {
    const members = this.roomMembers.get(room) ?? new Set<FakeSocket>();
    return { emit: (event, payload) => members.forEach((s) => s.emit(event, payload)) };
  }
  register(room: string, socket: FakeSocket): void {
    (this.roomMembers.get(room) ?? this.roomMembers.set(room, new Set()).get(room)!).add(socket);
  }
  connect(socket: FakeSocket): void {
    this.connHandler?.(socket as unknown as SocketLike);
  }
}

// --- wiring ----------------------------------------------------------------

const io = new FakeIo();
const manager = new RoomManager(new InMemoryStore(), () => 0xabc123); // fixed seed → reproducible
connectGateway(io as unknown as ServerLike, manager);

const host = new FakeSocket('sock-1', io);
const guest = new FakeSocket('sock-2', io);
io.connect(host);
io.connect(guest);

// 1. Host creates a room.
host.send(C2S.CreateRoom, { name: 'Ada' });
const hostJoin = host.last<JoinedRes>(S2C.Joined);
check('create room → Joined ack', !!hostJoin?.roomId && !!hostJoin?.playerId, hostJoin?.roomId);
const roomId = hostJoin!.roomId;
const p1 = hostJoin!.playerId;

// 2. Guest joins; both see a 2-seat lobby.
guest.send(C2S.JoinRoom, { roomId, name: 'Linus' });
const guestJoin = guest.last<JoinedRes>(S2C.Joined);
const p2 = guestJoin!.playerId;
const lobby = host.last<{ seats: unknown[] }>(S2C.LobbyUpdate);
check('guest joins → roster broadcast to host', lobby?.seats.length === 2);

// 3. Non-host cannot start.
guest.send(C2S.StartGame);
check('non-host start rejected', guest.last<{ code: string }>(S2C.Error)?.code === 'CONFLICT');

// 4. Start requires everyone ready.
host.send(C2S.StartGame);
check('start blocked until ready', host.last<{ code: string }>(S2C.Error)?.code === 'CONFLICT');

// 5. Both ready, host starts → both receive the opening snapshot.
host.send(C2S.SetReady, { ready: true });
guest.send(C2S.SetReady, { ready: true });
host.send(C2S.StartGame);
const opening = host.last<GameStateMsg>(S2C.GameState);
check('host start → game snapshot broadcast', !!opening && opening.seq === 0);
check('both clients receive identical opening hash', host.last<GameStateMsg>(S2C.GameState)?.hash === guest.last<GameStateMsg>(S2C.GameState)?.hash);
check('p1 (host, first seat) is the active player', opening?.state.activePlayerId === p1);
check('two distinct players seated', p1 !== p2 && opening?.state.playerOrder.includes(p2) === true);

const startHash = opening!.hash;
const gsBefore = host.count(S2C.GameState);

// 6. Out-of-turn: guest (p2) rolls while it's p1's turn → rejected, no broadcast.
guest.send(C2S.GameAction, { type: 'ROLL_DICE' });
check('out-of-turn action rejected', guest.last<{ code: string }>(S2C.Error)?.code === 'RULE_VIOLATION');
check('rejected action triggers no state broadcast', host.count(S2C.GameState) === gsBefore);
check('authoritative hash unchanged after rejection', host.last<GameStateMsg>(S2C.GameState)?.hash === startHash);

// 7. Anti-spoof: guest forges playerId=p1; gateway stamps the socket's own id → still rejected.
guest.send(C2S.GameAction, { type: 'ROLL_DICE', playerId: p1 });
check('spoofed playerId ignored, action still rejected', guest.last<{ code: string }>(S2C.Error)?.code === 'RULE_VIOLATION');
check('spoof attempt did not mutate state', host.last<GameStateMsg>(S2C.GameState)?.hash === startHash);

// 8. In-turn: host (p1) rolls → atomic broadcast to the whole room, version advances.
host.send(C2S.GameAction, { type: 'ROLL_DICE' });
const afterRoll = host.last<GameStateMsg>(S2C.GameState);
check('in-turn action broadcasts new snapshot', afterRoll?.hash !== startHash && afterRoll?.seq === 1);
check('single source of truth: both clients see same hash', host.last<GameStateMsg>(S2C.GameState)?.hash === guest.last<GameStateMsg>(S2C.GameState)?.hash);

// 9. Server-wrapper determinism: identical roomId + seats + seed → identical hash.
//    (Lobby IDs are random by design, so this is checked at the GameRoom layer,
//     where the inputs are fixed — engine determinism is proven in the engine test.)
{
  const seatsFixed = [{ id: 'pa', name: 'Ada' }, { id: 'pb', name: 'Linus' }];
  const a = new GameRoom('fixed-room', new InMemoryStore()).start(seatsFixed, 0x99);
  const b = new GameRoom('fixed-room', new InMemoryStore()).start(seatsFixed, 0x99);
  check('GameRoom determinism: same room/seats/seed → same hash', a.hash === b.hash, a.hash);
}

// 10. Disconnect marks the seat offline in the roster.
guest.send('disconnect');
const afterDc = host.last<{ seats: { connected: boolean }[] }>(S2C.LobbyUpdate);
check('disconnect flags seat as offline', afterDc?.seats.some((s) => !s.connected) === true);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
