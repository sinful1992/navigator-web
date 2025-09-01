// src/state/createCompletion.ts
import type { AppState, Outcome, Completion } from "../types";

/** Build a new Completion stamped with current listVersion and a stable label. */
export function createCompletion(
  s: AppState,
  index: number,
  outcome: Outcome,
  amount?: string
): Completion {
  const lv = s.currentListVersion;
  const row = s.addresses?.[index];

  return {
    index,
    outcome,
    amount: outcome === "PIF" ? amount : undefined,
    completedAt: new Date().toISOString(),
    listVersion: lv, // ✅ scope to current list
    addressSnapshot: row?.address?.trim()
      ? row.address
      : `#${Number.isFinite(index) ? index + 1 : "?"}`, // ✅ stable label
    // Optional if your rows have stable IDs:
    addressId: (row as any)?.id,
  };
}

/** Insert or update a completion by (index, listVersion) to prevent duplicates. */
export function upsertCompletion(s: AppState, comp: Completion): AppState {
  const completions = (s.completions ?? []).slice();
  const pos = completions.findIndex(
    (c) => Number(c.index) === Number(comp.index) && c.listVersion === comp.listVersion
  );
  if (pos !== -1) {
    completions[pos] = {
      ...completions[pos],
      ...comp,
      updatedAt: new Date().toISOString(),
    };
  } else {
    completions.push(comp);
  }
  return { ...s, completions };
}
