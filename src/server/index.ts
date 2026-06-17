// Silicon Streets — server core barrel (transport-agnostic, no socket.io import).
export * from './protocol';
export * from './store';
export { GameRoom } from './GameRoom';
export type { DispatchResult } from './GameRoom';
export { RoomManager } from './RoomManager';
export type { Result } from './RoomManager';
export { connectGateway } from './gateway';
