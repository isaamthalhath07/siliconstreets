// Silicon Streets — dice. Pure wrapper over the engine PRNG.

import { DiceRoll } from './types';
import { nextRandom } from './rng';

function rollDie(state: number): [face: number, next: number] {
  const [v, next] = nextRandom(state);
  return [1 + Math.floor(v * 6), next];
}

/** Roll two dice from an RNG cursor. Returns the roll and the advanced cursor. */
export function rollDice(rngState: number): { roll: DiceRoll; rngState: number } {
  const [d1, s1] = rollDie(rngState);
  const [d2, s2] = rollDie(s1);
  return { roll: { d1, d2, isDouble: d1 === d2 }, rngState: s2 };
}
