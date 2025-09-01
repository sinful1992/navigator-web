// src/migrations/backfillCompletionSnapshots.ts
import type { AppState, Completion } from "../types";

/**
 * Safe backfill:
 * - If a completion lacks addressSnapshot:
 *   - Use c.address if present (some apps stored it historically),
 *   - Else, if c.listVersion matches current list, copy from addresses[c.index],
 *   - Else leave it as-is (Completed.tsx already renders a neutral fallback).
 * - We DO NOT auto-assign listVersion for legacy rows to avoid mis-scoping.
 */
export function backfillCompletionSnapshotsOnce(state: AppState): AppState {
  const already = state.migrations?.backfill_completion_snapshots_v1;
  if (already) return state;

  const currentLV = state.currentListVersion;
  const addresses = state.addresses ?? [];

  const updated: Completion[] = (state.completions ?? []).map((c) => {
    if (c.addressSnapshot && c.addressSnapshot.trim()) return c;

    // Prefer any stored address field
    if ((c as any).address && String((c as any).address).trim()) {
      return { ...c, addressSnapshot: String((c as any).address) };
    }

    // Only read from current list when versions match (index is safe)
    if (c.listVersion === currentLV) {
      const idx = Number(c.index);
      const row = addresses[idx];
      if (row?.address?.trim()) {
        return { ...c, addressSnapshot: row.address };
      }
    }

    // Otherwise leave it; UI will show a neutral label (#N (v–))
    return c;
  });

  return {
    ...state,
    completions: updated,
    migrations: {
      ...(state.migrations ?? {}),
      backfill_completion_snapshots_v1: true,
    },
  };
}
