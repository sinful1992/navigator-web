// src/state/updateOutcome.ts
import type { AppState, Outcome } from "../types";

/**
 * Update a completion strictly by (index, listVersion),
 * so legacy rows or other versions are never touched.
 */
export function updateOutcomeByIndexAndVersion(
  s: AppState,
  index: number,
  outcome: Outcome,
  amount?: string,
  listVersion?: number
): AppState {
  const completions = (s.completions ?? []).slice();
  const lv = typeof listVersion === "number" ? listVersion : s.currentListVersion;

  const pos = completions.findIndex(
    (c) => Number(c.index) === Number(index) && c.listVersion === lv
  );
  if (pos === -1) return s;

  const old = completions[pos];
  completions[pos] = {
    ...old,
    outcome,
    amount: outcome === "PIF" ? amount : undefined,
    updatedAt: new Date().toISOString(),
  };

  return { ...s, completions };
}

/** Optional: delete a completion by (index, listVersion). */
export function deleteCompletionByIndexAndVersion(
  s: AppState,
  index: number,
  listVersion: number
): AppState {
  const completions = (s.completions ?? []).filter(
    (c) => !(Number(c.index) === Number(index) && c.listVersion === listVersion)
  );
  return { ...s, completions };
}
