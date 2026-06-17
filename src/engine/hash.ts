// Silicon Streets — canonical state hashing (FNV-1a, isomorphic, no Node deps).
// Used to version every atomic transition; the client reconciles against it.

import { GameState } from './types';

/** Stable JSON: object keys sorted recursively so hashing is order-independent. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',');
  return `{${body}}`;
}

function fnv1a(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash the authoritative core of a state. Excludes stateHash (self) and the
 *  append-only turnHistory, which are derived rather than authoritative. */
export function hashState(state: GameState): string {
  const { stateHash, turnHistory, ...core } = state;
  void stateHash;
  void turnHistory;
  return fnv1a(canonical(core));
}
