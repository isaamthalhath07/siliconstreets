// Silicon Streets — Static Board Configuration (immutable source of truth).
// 40 slots, indices 0-39, walked clockwise from Reboot. Rendered on the
// perimeter of an 11x11 CSS Grid (11*4 - 4 = 40). All names are original
// tech-themed retheme of classic real-estate slots — no trademarked terms.

import { BoardTile, Property, SpecialTile, Sector, TileType } from './types';

// --- compact builders -------------------------------------------------------

const prop = (
  index: number,
  name: string,
  sector: Sector,
  cost: number,
  rentTiers: readonly number[],
  buildCost: number,
): Property => ({
  index,
  type: TileType.Property,
  name,
  sector,
  cost,
  rentTiers,
  mortgageValue: cost / 2,
  buildCost,
});

// Backbone "railroad": rent scales with # of nodes owned [1,2,3,4].
const net = (index: number, name: string): Property => ({
  index,
  type: TileType.Network,
  name,
  sector: Sector.Backbone,
  cost: 200,
  rentTiers: [25, 50, 100, 200],
  mortgageValue: 100,
  buildCost: 0,
});

// Grid "utility": rentTiers are dice multipliers for 1 / 2 nodes owned.
const grid = (index: number, name: string): Property => ({
  index,
  type: TileType.Infrastructure,
  name,
  sector: Sector.Grid,
  cost: 150,
  rentTiers: [4, 10],
  mortgageValue: 75,
  buildCost: 0,
});

const special = (
  index: number,
  type: SpecialTile['type'],
  name: string,
  amount?: number,
): SpecialTile => ({ index, type, name, amount });

// --- the 40 slots -----------------------------------------------------------

export const BOARD: readonly BoardTile[] = [
  special(0, TileType.Reboot, 'Reboot'),
  prop(1, 'Garage Server', Sector.GarageStartups, 60, [2, 10, 30, 90, 160, 250], 50),
  special(2, TileType.Cache, 'Cache Drop'),
  prop(3, 'Dorm Room Stack', Sector.GarageStartups, 60, [4, 20, 60, 180, 320, 450], 50),
  special(4, TileType.Tax, 'Revenue Audit', 200),
  net(5, 'Fiber Mainline'),
  prop(6, 'Linux Kernel', Sector.OpenSource, 100, [6, 30, 90, 270, 400, 550], 50),
  special(7, TileType.Event, 'System Event'),
  prop(8, 'Apache Node', Sector.OpenSource, 100, [6, 30, 90, 270, 400, 550], 50),
  prop(9, 'Mozilla Hub', Sector.OpenSource, 120, [8, 40, 100, 300, 450, 600], 50),
  special(10, TileType.Quarantine, 'Debugger Quarantine'),
  prop(11, 'MicroBlog', Sector.SocialMedia, 140, [10, 50, 150, 450, 625, 750], 100),
  grid(12, 'Power Grid'),
  prop(13, 'PhotoFeed', Sector.SocialMedia, 140, [10, 50, 150, 450, 625, 750], 100),
  prop(14, 'ChatSphere', Sector.SocialMedia, 160, [12, 60, 180, 500, 700, 900], 100),
  net(15, '5G Tower Array'),
  prop(16, 'PayStream', Sector.FinTech, 180, [14, 70, 200, 550, 750, 950], 100),
  special(17, TileType.Cache, 'Cache Drop'),
  prop(18, 'CryptoVault', Sector.FinTech, 180, [14, 70, 200, 550, 750, 950], 100),
  prop(19, 'NeoBank', Sector.FinTech, 200, [16, 80, 220, 600, 800, 1000], 100),
  special(20, TileType.Sandbox, 'Sandbox'),
  prop(21, 'QuickCart', Sector.ECommerce, 220, [18, 90, 250, 700, 875, 1050], 150),
  special(22, TileType.Event, 'System Event'),
  prop(23, 'DropShip', Sector.ECommerce, 220, [18, 90, 250, 700, 875, 1050], 150),
  prop(24, 'MegaMart', Sector.ECommerce, 240, [20, 100, 300, 750, 925, 1100], 150),
  net(25, 'Satellite Uplink'),
  prop(26, 'EdgeCache', Sector.Cloud, 260, [22, 110, 330, 800, 975, 1150], 150),
  prop(27, 'Serverless One', Sector.Cloud, 260, [22, 110, 330, 800, 975, 1150], 150),
  grid(28, 'Bandwidth Exchange'),
  prop(29, 'Colo Center', Sector.Cloud, 280, [24, 120, 360, 850, 1025, 1200], 150),
  special(30, TileType.GotoQuarantine, 'Go To Quarantine'),
  prop(31, 'VisionNet', Sector.Ai, 300, [26, 130, 390, 900, 1100, 1275], 200),
  prop(32, 'DeepModel', Sector.Ai, 300, [26, 130, 390, 900, 1100, 1275], 200),
  special(33, TileType.Cache, 'Cache Drop'),
  prop(34, 'AGI Labs', Sector.Ai, 320, [28, 150, 450, 1000, 1200, 1400], 200),
  net(35, 'Submarine Cable'),
  special(36, TileType.Event, 'System Event'),
  prop(37, 'Qubit Foundry', Sector.Quantum, 350, [35, 175, 500, 1100, 1300, 1500], 200),
  special(38, TileType.Tax, 'Luxury Surcharge', 100),
  prop(39, 'Quantum Core', Sector.Quantum, 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

// --- derived lookups (built once) ------------------------------------------

/** Sector -> the tile indices forming a complete set (monopoly). */
export const SECTOR_GROUPS: Readonly<Record<Sector, readonly number[]>> = (() => {
  const groups = {} as Record<Sector, number[]>;
  for (const tile of BOARD) {
    if ('sector' in tile) (groups[tile.sector] ??= []).push(tile.index);
  }
  return groups;
})();

export const REBOOT_SALARY = 200;
export const QUARANTINE_INDEX = 10;
export const GOTO_QUARANTINE_INDEX = 30;
export const BAIL_COST = 50;
export const BOARD_SIZE = BOARD.length; // 40

if (BOARD.length !== 40) {
  throw new Error(`Silicon Streets board must be 40 slots, got ${BOARD.length}`);
}
