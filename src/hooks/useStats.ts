// src/hooks/useStats.ts
import { useMemo } from 'react';
import type { AddressRow, Completion, Arrangement } from '../types';

/**
 * Calculate application statistics
 *
 * Computes various stats including:
 * - Total/pending/completed addresses
 * - Outcome counts (PIF, Done, DA, ARR)
 * - Pending arrangements
 * - Today's PIF total
 *
 * @param addresses - List of addresses
 * @param completions - List of completions
 * @param arrangements - List of arrangements
 * @param currentListVersion - Current list version to filter by
 * @returns Statistics object
 */
export function useStats(
  addresses: AddressRow[],
  completions: Completion[],
  arrangements: Arrangement[],
  currentListVersion: number
) {
  return useMemo(() => {
    // Filter completions by listVersion only (not by date)
    // This shows all completions for the current list version
    const completedIdx = new Set(
      completions
        .filter((c) => c.listVersion === currentListVersion)
        .map((c) => c.index)
    );
    const total = addresses.length;
    const pending = total - completedIdx.size;
    const pifCount = completions.filter(
      (c) => c.listVersion === currentListVersion && c.outcome === "PIF"
    ).length;
    const doneCount = completions.filter(
      (c) => c.listVersion === currentListVersion && c.outcome === "Done"
    ).length;
    const daCount = completions.filter(
      (c) => c.listVersion === currentListVersion && c.outcome === "DA"
    ).length;
    const arrCount = completions.filter(
      (c) => c.listVersion === currentListVersion && c.outcome === "ARR"
    ).length;
    const completed = completedIdx.size;

    // Today's date filter ONLY for todaysPIF calculation
    const todayStr = new Date().toISOString().slice(0, 10);

    const pendingArrangements = arrangements.filter(arr =>
      arr.status !== "Completed" && arr.status !== "Cancelled"
    ).length;

    const todaysPIF = completions
      .filter((c) =>
        c.outcome === "PIF" &&
        (c.timestamp || "").slice(0, 10) === todayStr
      )
      .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);

    return {
      total,
      pending,
      completed,
      pifCount,
      doneCount,
      daCount,
      arrCount,
      pendingArrangements,
      todaysPIF
    };
  }, [addresses, completions, arrangements, currentListVersion]);
}
