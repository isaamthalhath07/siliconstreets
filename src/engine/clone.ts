// Silicon Streets — dependency-free deep clone. GameState is pure JSON data
// (no functions, Dates, or Maps), so structural cloning is exact and keeps the
// engine isomorphic (no reliance on the Node/DOM structuredClone global).

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
