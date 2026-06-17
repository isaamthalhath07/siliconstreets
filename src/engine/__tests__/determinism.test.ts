// Silicon Streets — engine test harness (run: npx tsx src/engine/__tests__/determinism.test.ts)
// Two parts:
//   1. Determinism: same seed + same actions => byte-identical stateHash sequence.
//   2. Scripted economics: monopolies are set up deterministically (random
//      autoplay almost never forms them) to exercise BUILD, every rent branch,
//      and a real bankruptcy -> liquidation -> game-over path through the reducer.
// No test framework — self-contained asserts, exit code 1 on any failure.

import { createGame } from '../state';
import { applyAction } from '../reducer';
import { calculateRent } from '../rent';
import { rollDice } from '../dice';
import { GameAction, GameState, PlayerId } from '../types';

declare const process: { exit(code: number): never };
declare const console: { log(...args: unknown[]): void };

const SEATS = [
  { id: 'p1', name: 'Ada' },
  { id: 'p2', name: 'Linus' },
  { id: 'p3', name: 'Grace' },
  { id: 'p4', name: 'Dennis' },
];
const DUO = [{ id: 'p1', name: 'Ada' }, { id: 'p2', name: 'Linus' }];
const MAX_ACTIONS = 2000;

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
}

const eq = (x: string[], y: string[]): boolean => JSON.stringify(x) === JSON.stringify(y);

// ===========================================================================
// Part 1 — determinism via passive autoplay
// ===========================================================================

/** Passive auto-pilot: buy on landing, never build. One legal action per phase. */
function choosePassive(s: GameState): GameAction | null {
  const pid = s.activePlayerId;
  switch (s.phase) {
    case 'AWAIT_ROLL':
      return { type: 'ROLL_DICE', playerId: pid };
    case 'AWAIT_ACTION':
      return { type: 'BUY_PROPERTY', playerId: pid, tile: s.players[pid].position };
    case 'RESOLVED':
      return { type: 'END_TURN', playerId: pid };
    default:
      return null;
  }
}

function play(seed: number): { transcript: GameAction[]; hashes: string[]; final: GameState } {
  let state = createGame('game-1', SEATS, seed);
  const transcript: GameAction[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < MAX_ACTIONS; i++) {
    const action = choosePassive(state);
    if (!action) break;
    const res = applyAction(state, action);
    if (!res.ok) throw new Error(`auto-pilot produced an illegal action: ${res.error}`);
    state = res.state;
    transcript.push(action);
    hashes.push(state.stateHash);
  }
  return { transcript, hashes, final: state };
}

function replay(seed: number, transcript: GameAction[]): string[] {
  let state = createGame('game-1', SEATS, seed);
  const hashes: string[] = [];
  for (const action of transcript) {
    const res = applyAction(state, action);
    if (!res.ok) throw new Error(`replay diverged — action rejected: ${res.error}`);
    state = res.state;
    hashes.push(state.stateHash);
  }
  return hashes;
}

const SEED_A = 0x5111c04;
const SEED_B = 0xc0ffee;
const runA1 = play(SEED_A);
const runA2 = play(SEED_A);
const runB = play(SEED_B);

check('identical seed → identical hash sequence', eq(runA1.hashes, runA2.hashes), `${runA1.hashes.length} steps`);
check('identical seed → identical final stateHash', runA1.final.stateHash === runA2.final.stateHash, runA1.final.stateHash);
check('transcript replay reproduces hash sequence', eq(runA1.hashes, replay(SEED_A, runA1.transcript)));
check('different seed → different hash sequence', !eq(runA1.hashes, runB.hashes));
check('state hash evolves across the game', new Set(runA1.hashes).size > 1, `${new Set(runA1.hashes).size} distinct`);

{
  const fresh = createGame('game-1', SEATS, SEED_A); // active = p1
  const res = applyAction(fresh, { type: 'ROLL_DICE', playerId: 'p2' });
  check('out-of-turn action rejected', res.ok === false, res.ok ? '' : res.error);
}
{
  const fresh = createGame('game-1', SEATS, SEED_A);
  const before = fresh.stateHash;
  applyAction(fresh, { type: 'END_TURN', playerId: 'p1' }); // illegal in AWAIT_ROLL
  check('rejected action does not mutate input state', fresh.stateHash === before);
}

// ===========================================================================
// Part 2 — scripted economics (white-box setup, real reducer execution)
// ===========================================================================

/** Directly grant deeds (and optional development) — used to stage monopolies
 *  that random autoplay won't produce. The reducer is still the only executor. */
function grant(s: GameState, owner: PlayerId, tiles: number[], dev = 0): void {
  for (const i of tiles) {
    s.boardState[i].ownerId = owner;
    s.boardState[i].developmentLevel = dev;
    s.players[owner].inventory.push(i);
  }
}

// --- 2a. BUILD path + even-build rule (OpenSource sector = tiles 6,8,9) ------
{
  let s = createGame('game-1', DUO, 1); // active = p1, phase AWAIT_ROLL
  grant(s, 'p1', [6, 8, 9]);
  s.players['p1'].balance = 1000;
  s.phase = 'RESOLVED'; // management allowed in RESOLVED

  const r1 = applyAction(s, { type: 'BUILD', playerId: 'p1', tile: 6 });
  check('build: first upgrade accepted', r1.ok === true, r1.ok ? '' : r1.error);
  if (r1.ok) s = r1.state;
  check('build: level incremented to 1', s.boardState[6].developmentLevel === 1);
  check('build: buildCost (50) charged', s.players['p1'].balance === 950);

  const r2 = applyAction(s, { type: 'BUILD', playerId: 'p1', tile: 6 });
  check('build: uneven second upgrade rejected', r2.ok === false, r2.ok ? '' : r2.error);

  const r3 = applyAction(s, { type: 'BUILD', playerId: 'p1', tile: 8 });
  if (r3.ok) s = r3.state;
  const r4 = applyAction(s, { type: 'BUILD', playerId: 'p1', tile: 9 });
  if (r4.ok) s = r4.state;
  const r5 = applyAction(s, { type: 'BUILD', playerId: 'p1', tile: 6 }); // now even again
  check('build: re-allowed once sector is even', r5.ok === true, r5.ok ? '' : r5.error);
  if (r5.ok) s = r5.state;
  check('build: sector at levels [2,1,1]', s.boardState[6].developmentLevel === 2 && s.boardState[8].developmentLevel === 1);
}

// --- 2b. Rent branches (calculateRent is pure) ------------------------------
{
  const s = createGame('game-1', DUO, 1);
  grant(s, 'p2', [6, 8, 9]); // full OpenSource monopoly, undeveloped
  check('rent: monopoly doubles a bare deed', calculateRent(s, 6, 'p1', 7) === 12); // base 6 ×2
  check('rent: owner is never charged', calculateRent(s, 6, 'p2', 7) === 0);
  s.boardState[6].developmentLevel = 3;
  check('rent: development overrides to tier rent', calculateRent(s, 6, 'p1', 7) === 270); // tiers[3]
  s.boardState[6].isMortgaged = true;
  check('rent: mortgaged tile charges nothing', calculateRent(s, 6, 'p1', 7) === 0);
}
{
  const s = createGame('game-1', DUO, 1);
  grant(s, 'p2', [5]); // 1 Backbone node
  check('rent: network with 1 node', calculateRent(s, 5, 'p1', 7) === 25);
  grant(s, 'p2', [15]); // 2 nodes
  check('rent: network with 2 nodes', calculateRent(s, 5, 'p1', 7) === 50);
}
{
  const s = createGame('game-1', DUO, 1);
  grant(s, 'p2', [12]); // 1 Grid node → ×4 dice
  check('rent: grid with 1 node (×4)', calculateRent(s, 12, 'p1', 7) === 28);
  grant(s, 'p2', [28]); // 2 Grid nodes → ×10 dice
  check('rent: grid with 2 nodes (×10)', calculateRent(s, 12, 'p1', 7) === 70);
}

// --- 2c. Bankruptcy by unpayable rent → liquidation → game over -------------
{
  // Find a seed whose opening roll totals 9, landing p1 on Mozilla Hub (idx 9).
  let seed = 1;
  for (; seed < 5_000_000; seed++) {
    const { roll } = rollDice(seed);
    if (roll.d1 + roll.d2 === 9) break;
  }
  const s = createGame('game-1', DUO, seed);
  grant(s, 'p2', [6, 8, 9], 5); // OpenSource fully built (Data Centers)
  s.players['p1'].balance = 100; // cannot cover the 600 rent on idx 9
  const p2Before = s.players['p2'].balance;

  check('bankruptcy: data-center rent preview = 600', calculateRent(s, 9, 'p1', 9) === 600);
  const res = applyAction(s, { type: 'ROLL_DICE', playerId: 'p1' });
  check('bankruptcy: roll resolved', res.ok === true, res.ok ? '' : res.error);
  if (res.ok) {
    const f = res.state;
    check('bankruptcy: p1 landed on Mozilla Hub (9)', f.players['p1'].position === 9);
    check('bankruptcy: p1 declared bankrupt', f.players['p1'].isBankrupt === true);
    check('bankruptcy: p1 liquidated (no deeds, zero balance)', f.players['p1'].inventory.length === 0 && f.players['p1'].balance === 0);
    check('bankruptcy: creditor p2 received remaining cash (100)', f.players['p2'].balance === p2Before + 100);
    check('bankruptcy: game over, p2 last solvent', f.phase === 'GAME_OVER' && f.activePlayerId === 'p2');
  }
}

console.log(
  `\nPassive run: ${runA1.transcript.length} actions, ` +
    `balances=${SEATS.map((s) => `${s.name}:${runA1.final.players[s.id].balance}`).join(' ')}`,
);
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
