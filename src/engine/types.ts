// Silicon Streets — Core Engine Schema
// Server-authoritative, strict types. No external (UI/socket) imports allowed here.
// All copyrighted Monopoly terminology is remapped to tech equivalents.

export type PlayerId = string;
/** Board index 0-39. Ownable tiles reuse this as their PropertyId. */
export type TileIndex = number;

// ---------------------------------------------------------------------------
// Tile taxonomy
// ---------------------------------------------------------------------------

/** Functional category of a board slot. */
export enum TileType {
  Reboot = 'REBOOT',                   // 0  — "Go": collect salary on pass
  Property = 'PROPERTY',               // ownable sector asset
  Network = 'NETWORK',                 // "railroad": Backbone node
  Infrastructure = 'INFRASTRUCTURE',   // "utility": Grid node
  Tax = 'TAX',                         // pay treasury
  Event = 'EVENT',                     // "Chance": System Event card
  Cache = 'CACHE',                     // "Community Chest": Cache draw
  Quarantine = 'QUARANTINE',           // 10 — "Jail" / Just Visiting
  Sandbox = 'SANDBOX',                 // 20 — "Free Parking"
  GotoQuarantine = 'GOTO_QUARANTINE',  // 30 — "Go To Jail"
}

/** Ownable color groups, retheme as tech sectors. Monopoly = full-set bonus. */
export enum Sector {
  GarageStartups = 'GARAGE_STARTUPS', // brown
  OpenSource = 'OPEN_SOURCE',         // light blue
  SocialMedia = 'SOCIAL_MEDIA',       // pink
  FinTech = 'FINTECH',                // orange
  ECommerce = 'ECOMMERCE',            // red
  Cloud = 'CLOUD',                    // yellow
  Ai = 'AI_ML',                       // green
  Quantum = 'QUANTUM',                // dark blue
  Backbone = 'BACKBONE',              // railroads
  Grid = 'GRID',                      // utilities
}

// ---------------------------------------------------------------------------
// Static board configuration (immutable — lives in board.ts)
// ---------------------------------------------------------------------------

interface TileBase {
  readonly index: TileIndex;
  readonly type: TileType;
  readonly name: string;
}

/** Ownable tile definition. Satisfies the spec's `Property` contract. */
export interface Property extends TileBase {
  readonly type: TileType.Property | TileType.Network | TileType.Infrastructure;
  readonly sector: Sector;
  readonly cost: number;
  /** Rent ladder. Property: [base, 1srv, 2srv, 3srv, 4srv, datacenter].
   *  Network: rent by # of Backbone nodes owned (1-4).
   *  Infrastructure: dice-multipliers by # of Grid nodes owned. */
  readonly rentTiers: readonly number[];
  readonly mortgageValue: number;
  /** Cost per development step (server upgrade). 0 for Network/Infrastructure. */
  readonly buildCost: number;
}

/** Non-ownable slot (corners, taxes, card draws). */
export interface SpecialTile extends TileBase {
  readonly type: Exclude<
    TileType,
    TileType.Property | TileType.Network | TileType.Infrastructure
  >;
  /** Flat charge for Tax tiles; omitted otherwise. */
  readonly amount?: number;
}

export type BoardTile = Property | SpecialTile;

export function isOwnable(tile: BoardTile): tile is Property {
  return (
    tile.type === TileType.Property ||
    tile.type === TileType.Network ||
    tile.type === TileType.Infrastructure
  );
}

// ---------------------------------------------------------------------------
// Runtime state (mutable per game, replaces nothing in board.ts)
// ---------------------------------------------------------------------------

/** Per-tile dynamic ownership/development, indexed parallel to BOARD. */
export interface TileState {
  readonly index: TileIndex;
  ownerId: PlayerId | null;
  /** 0 = bare deed, 1-4 = servers, 5 = data center. Always 0 for non-Property. */
  developmentLevel: number;
  isMortgaged: boolean;
}

export interface Player {
  readonly id: PlayerId;
  readonly name: string;
  balance: number;
  /** Board index 0-39. */
  position: TileIndex;
  /** Tile indices of owned deeds. */
  inventory: TileIndex[];
  inQuarantine: boolean;
  /** Turns spent in Quarantine (0-3). */
  quarantineTurns: number;
  isBankrupt: boolean;
  isConnected: boolean;
}

export type GamePhase =
  | 'LOBBY'
  | 'AWAIT_ROLL'
  | 'AWAIT_ACTION'  // landed: buy / decline / build / trade
  | 'AUCTION'
  | 'RESOLVED'      // turn complete, awaiting EndTurn
  | 'GAME_OVER';

export interface DiceRoll {
  readonly d1: number;
  readonly d2: number;
  readonly isDouble: boolean;
}

/** Live state of a property auction. Present only while phase === 'AUCTION'.
 *  Turn-based: exactly one bidder (`bidTurnId`) may act at a time, so the flow
 *  stays deterministic and replayable like every other action. */
export interface AuctionState {
  /** Board index of the tile under the hammer. */
  readonly tile: TileIndex;
  /** Highest bid so far; 0 until the first PLACE_BID. */
  currentBid: number;
  highBidderId: PlayerId | null;
  /** Players still in the running, in playerOrder; shrinks as they PASS_BID. */
  activeBidders: PlayerId[];
  /** Whose turn it is to bid or pass. */
  bidTurnId: PlayerId;
}

/** One immutable entry appended per applied action (audit + replay). */
export interface TurnRecord {
  readonly seq: number;
  readonly playerId: PlayerId;
  readonly action: GameAction;
  readonly resultHash: string;
  readonly timestamp: number;
}

export interface GameState {
  readonly gameId: string;
  phase: GamePhase;
  /** Authoritative turn order; activePlayerId must be a member. */
  readonly playerOrder: PlayerId[];
  activePlayerId: PlayerId;
  players: Record<PlayerId, Player>;
  /** Length-40, parallel to BOARD. */
  boardState: TileState[];
  lastRoll: DiceRoll | null;
  /** Active auction, or null. Non-null iff phase === 'AUCTION'. */
  auction: AuctionState | null;
  /** Consecutive doubles this turn; 3 => Quarantine. */
  doublesCount: number;
  /** Pure PRNG cursor. Advanced on every dice roll; makes games replayable. */
  rngState: number;
  turnHistory: TurnRecord[];
  /** SHA-256 of the canonical state, recomputed each atomic transition. */
  stateHash: string;
}

// ---------------------------------------------------------------------------
// Action contract (input to the deterministic state machine)
// ---------------------------------------------------------------------------

interface ActionBase {
  readonly playerId: PlayerId;
}

export type GameAction =
  | (ActionBase & { type: 'ROLL_DICE' })
  | (ActionBase & { type: 'BUY_PROPERTY'; tile: TileIndex })
  | (ActionBase & { type: 'DECLINE_PROPERTY'; tile: TileIndex }) // -> AUCTION
  | (ActionBase & { type: 'PLACE_BID'; tile: TileIndex; amount: number })
  | (ActionBase & { type: 'PASS_BID' })
  | (ActionBase & { type: 'BUILD'; tile: TileIndex })
  | (ActionBase & { type: 'SELL_BUILDING'; tile: TileIndex })
  | (ActionBase & { type: 'MORTGAGE'; tile: TileIndex })
  | (ActionBase & { type: 'UNMORTGAGE'; tile: TileIndex })
  | (ActionBase & { type: 'PAY_BAIL' })
  | (ActionBase & {
      type: 'PROPOSE_TRADE';
      to: PlayerId;
      offerTiles: TileIndex[];
      offerCash: number;
      wantTiles: TileIndex[];
      wantCash: number;
    })
  | (ActionBase & { type: 'RESOLVE_TRADE'; tradeId: string; accept: boolean })
  | (ActionBase & { type: 'DECLARE_BANKRUPTCY' })
  | (ActionBase & { type: 'END_TURN' });

/** Omit that distributes over a union so each variant keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A client-submitted action: identical to GameAction minus playerId, which the
 *  gateway stamps server-side (anti-spoof). Distributive so `tile`/`amount`/etc.
 *  survive on each variant. */
export type PlayerAction = DistributiveOmit<GameAction, 'playerId'>;

/** Discriminated result so the server can broadcast deltas, not full snapshots. */
export type ActionResult =
  | { ok: true; state: GameState; events: string[] }
  | { ok: false; error: string };
