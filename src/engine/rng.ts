// Silicon Streets — deterministic PRNG (mulberry32, pure functional form).
// State is a single 32-bit integer carried in GameState.rngState, so every
// roll is reproducible from the seed. Never use Math.random() in the engine.

/** Returns [unitFloat in [0,1), nextState]. Pure. */
export function nextRandom(state: number): [value: number, next: number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, a];
}

/** Derive a stable numeric seed from an arbitrary string (e.g. gameId). */
export function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
