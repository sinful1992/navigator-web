// src/state/selectors.ts
import type { AppState, Completion } from "../types";

export function selectCompletionsForVersion(
  state: AppState,
  listVersion?: number
): Completion[] {
  const v = typeof listVersion === "number" ? listVersion : state.currentListVersion;
  return (state.completions ?? []).filter((c) => c.listVersion === v);
}

export function computeCurrentStats(state: AppState) {
  const curr = selectCompletionsForVersion(state);
  const completedIdx = new Set<number>(curr.map((c) => Number(c.index)));

  let pifCount = 0,
    daCount = 0,
    doneCount = 0,
    arrCount = 0;

  for (const c of curr) {
    if (c.outcome === "PIF") pifCount++;
    else if (c.outcome === "DA") daCount++;
    else if (c.outcome === "DONE") doneCount++;
    else if (c.outcome === "ARR") arrCount++;
  }

  return {
    total: curr.length,
    pifCount,
    daCount,
    doneCount,
    arrCount,
    completedIdx,
  };
}
