// src/utils/mergeState.ts - State merging utilities
import type { AppState } from "../types";
import { logger } from "./logger";

/**
 * Merge two states while preserving active index and resolving conflicts
 * Used when cloud data needs to be merged with local data
 */
export function mergeStatePreservingActiveIndex(
  current: AppState,
  incoming: AppState
): AppState {
  const currentListVersion =
    typeof current.currentListVersion === "number"
      ? current.currentListVersion
      : 1;
  const incomingListVersion =
    typeof incoming.currentListVersion === "number"
      ? incoming.currentListVersion
      : 1;

  const ensureListVersion = (listVersion?: number) =>
    typeof listVersion === "number"
      ? listVersion
      : Math.max(currentListVersion, incomingListVersion);

  const mergedCompletionMap = new Map<string, AppState["completions"][number]>();
  const pushCompletion = (
    completion: AppState["completions"][number] | undefined
  ) => {
    if (!completion) return;
    if (
      typeof completion.index !== "number" ||
      typeof completion.timestamp !== "string" ||
      !completion.outcome
    ) {
      return;
    }

    const normalized = {
      ...completion,
      listVersion: ensureListVersion(completion.listVersion),
    };

    const key = `${normalized.timestamp}_${normalized.index}_${normalized.outcome}`;
    const existing = mergedCompletionMap.get(key);

    if (!existing) {
      mergedCompletionMap.set(key, normalized);
      return;
    }

    // Merge extra fields (amount/arrangementId) while keeping most recent data
    const existingTime = new Date(existing.timestamp).getTime();
    const incomingTime = new Date(normalized.timestamp).getTime();

    if (incomingTime > existingTime) {
      mergedCompletionMap.set(key, {
        ...existing,
        ...normalized,
      });
      return;
    }

    mergedCompletionMap.set(key, {
      ...normalized,
      ...existing,
    });
  };

  incoming.completions?.forEach(pushCompletion);
  current.completions?.forEach(pushCompletion);

  const mergedCompletions = Array.from(mergedCompletionMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const selectAddresses = () => {
    const currentAddresses = Array.isArray(current.addresses)
      ? current.addresses
      : [];
    const incomingAddresses = Array.isArray(incoming.addresses)
      ? incoming.addresses
      : [];

    const hasMeaningfulAddresses = (addresses: AppState["addresses"]) =>
      addresses.some(address => address.address?.trim());

    const incomingHasMeaningful = hasMeaningfulAddresses(incomingAddresses);
    const currentHasMeaningful = hasMeaningfulAddresses(currentAddresses);

    // Respect list versions - prefer higher version unless it would drop real data
    if (incomingListVersion > currentListVersion) {
      if (!incomingHasMeaningful && currentHasMeaningful) {
        return {
          addresses: currentAddresses,
          listVersion: currentListVersion,
        };
      }

      return {
        addresses: incomingAddresses,
        listVersion: incomingListVersion,
      };
    }

    if (currentListVersion > incomingListVersion) {
      if (!currentHasMeaningful && incomingHasMeaningful) {
        return {
          addresses: incomingAddresses,
          listVersion: currentListVersion,
        };
      }

      return {
        addresses: currentAddresses,
        listVersion: currentListVersion,
      };
    }

    if (incomingHasMeaningful && !currentHasMeaningful) {
      return {
        addresses: incomingAddresses,
        listVersion: incomingListVersion,
      };
    }

    if (!incomingHasMeaningful && currentHasMeaningful) {
      return {
        addresses: currentAddresses,
        listVersion: currentListVersion,
      };
    }

    // 🔧 FIX: When versions are the same, check for manual address additions
    // If one list has exactly 1 more address than the other, merge them
    const lengthDiff = Math.abs(currentAddresses.length - incomingAddresses.length);

    if (lengthDiff === 1 && currentListVersion === incomingListVersion) {
      const [longerList, shorterList] = currentAddresses.length > incomingAddresses.length
        ? [currentAddresses, incomingAddresses]
        : [incomingAddresses, currentAddresses];

      // Check if the longer list contains all addresses from the shorter list
      const allShorterInLonger = shorterList.every(shortAddr =>
        longerList.some(longAddr =>
          longAddr.address?.trim()?.toLowerCase() === shortAddr.address?.trim()?.toLowerCase()
        )
      );

      if (allShorterInLonger) {
        // This is a manual address addition - use the longer list
        if (import.meta.env.DEV) {
          logger.info('🔧 SYNC FIX: Detected manual address addition, using longer list', {
            longerListLength: longerList.length,
            shorterListLength: shorterList.length
          });
        }

        return {
          addresses: longerList,
          listVersion: currentListVersion,
        };
      }
    }

    const useIncoming = incomingAddresses.length >= currentAddresses.length;

    return {
      addresses: useIncoming ? incomingAddresses : currentAddresses,
      listVersion: incomingListVersion,
    };
  };

  const { addresses: mergedAddresses, listVersion: resolvedListVersion } =
    selectAddresses();

  const mergedArrangementsMap = new Map<string, AppState["arrangements"][number]>();
  const pushArrangement = (
    arrangement: AppState["arrangements"][number] | undefined
  ) => {
    if (!arrangement?.id) return;
    const existing = mergedArrangementsMap.get(arrangement.id);
    if (!existing) {
      mergedArrangementsMap.set(arrangement.id, arrangement);
      return;
    }

    const existingUpdated = new Date(existing.updatedAt).getTime();
    const candidateUpdated = new Date(arrangement.updatedAt).getTime();
    if (candidateUpdated > existingUpdated) {
      mergedArrangementsMap.set(arrangement.id, arrangement);
    }
  };

  current.arrangements?.forEach(pushArrangement);
  incoming.arrangements?.forEach(pushArrangement);

  const mergedDaySessionsMap = new Map<string, AppState["daySessions"][number]>();
  const pushDaySession = (
    session: AppState["daySessions"][number] | undefined
  ) => {
    if (!session?.date) return;
    const existing = mergedDaySessionsMap.get(session.date);
    if (!existing) {
      mergedDaySessionsMap.set(session.date, session);
      return;
    }

    const existingHasEnd = Boolean(existing.end);
    const candidateHasEnd = Boolean(session.end);

    if (!existingHasEnd && candidateHasEnd) {
      mergedDaySessionsMap.set(session.date, session);
      return;
    }

    if (existingHasEnd && candidateHasEnd) {
      const existingEnd = new Date(existing.end ?? existing.start ?? new Date()).getTime();
      const candidateEnd = new Date(session.end ?? session.start ?? new Date()).getTime();
      if (candidateEnd > existingEnd) {
        mergedDaySessionsMap.set(session.date, session);
      }
    }
  };

  current.daySessions?.forEach(pushDaySession);
  incoming.daySessions?.forEach(pushDaySession);

  const mergedDaySessions = Array.from(mergedDaySessionsMap.values());

  const mergedArrangements = Array.from(mergedArrangementsMap.values());

  return {
    ...incoming,
    addresses: mergedAddresses,
    completions: mergedCompletions,
    arrangements: mergedArrangements,
    daySessions: mergedDaySessions,
    currentListVersion: resolvedListVersion,
    activeIndex: incoming.activeIndex ?? current.activeIndex ?? null,
  };
}
