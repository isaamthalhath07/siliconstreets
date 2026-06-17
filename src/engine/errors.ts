// Silicon Streets — shared rule-violation primitive. The reducer catches
// `RuleError` and surfaces it as { ok:false }; any other throw is a real bug and
// propagates. Lives in its own module so engine sub-modules (auction, movement)
// can fail uniformly without importing the reducer (avoids cycles).

export class RuleError extends Error {}

/** Reject an action with a human-readable reason. Return type `never` lets call
 *  sites write `return fail(...)` while keeping control-flow analysis happy. */
export const fail = (msg: string): never => {
  throw new RuleError(msg);
};
