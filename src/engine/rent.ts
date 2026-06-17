// Silicon Streets — rent resolution. Pure: derives the charge for landing on an
// owned, un-mortgaged tile. Mirrors classic mechanics, retheme to tech.

import { GameState, Property, TileType } from './types';
import { BOARD, SECTOR_GROUPS } from './board';

/** True if `ownerId` holds every tile in the landed tile's sector. */
function ownsFullSector(state: GameState, tile: Property, ownerId: string): boolean {
  return SECTOR_GROUPS[tile.sector].every(
    (idx) => state.boardState[idx].ownerId === ownerId,
  );
}

/** How many tiles of a given sector this owner controls (un-mortgaged not required). */
function sectorCount(state: GameState, sector: Property['sector'], ownerId: string): number {
  return SECTOR_GROUPS[sector].filter(
    (idx) => state.boardState[idx].ownerId === ownerId,
  ).length;
}

/**
 * Rent owed by the visitor landing on `tileIndex`. Returns 0 if unowned,
 * owned by the visitor, or mortgaged. `rollTotal` is only used by Grid tiles.
 */
export function calculateRent(
  state: GameState,
  tileIndex: number,
  visitorId: string,
  rollTotal: number,
): number {
  const tile = BOARD[tileIndex];
  if (!('cost' in tile)) return 0; // not ownable
  const ts = state.boardState[tileIndex];
  if (!ts.ownerId || ts.ownerId === visitorId || ts.isMortgaged) return 0;

  const owner = ts.ownerId;

  if (tile.type === TileType.Network) {
    const n = sectorCount(state, tile.sector, owner); // 1-4 Backbone nodes
    return tile.rentTiers[Math.max(0, n - 1)] ?? 0;
  }

  if (tile.type === TileType.Infrastructure) {
    const n = sectorCount(state, tile.sector, owner); // 1-2 Grid nodes
    const multiplier = tile.rentTiers[Math.max(0, n - 1)] ?? tile.rentTiers[0];
    return multiplier * rollTotal;
  }

  // Standard Property: rentTiers = [base, 1srv, 2srv, 3srv, 4srv, datacenter].
  const level = ts.developmentLevel; // 0-5
  if (level > 0) return tile.rentTiers[level] ?? 0;
  const base = tile.rentTiers[0];
  // Bare deed pays double when the owner holds the full sector.
  return ownsFullSector(state, tile, owner) ? base * 2 : base;
}
