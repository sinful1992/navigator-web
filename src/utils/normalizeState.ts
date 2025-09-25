import { coerceListVersion } from "../useAppState";

export function normalizeState(raw: any) {
  const r = raw ?? {};
  const currentListVersion = coerceListVersion(r.currentListVersion);
  const completions = Array.isArray(r.completions)
    ? r.completions.map((completion: any) => ({
        ...completion,
        listVersion: coerceListVersion(
          completion?.listVersion,
          currentListVersion
        ),
      }))
    : [];

  return {
    ...r,
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions,
    completionLedger: Array.isArray(r.completionLedger)
      ? r.completionLedger
      : undefined,
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    daySessions: Array.isArray(r.daySessions) ? r.daySessions : [],
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null,
    currentListVersion,
  };
}

// ARCHITECTURAL: Separate data from session state for backups
export function normalizeBackupData(raw: any) {
  const r = raw ?? {};
  const currentListVersion = coerceListVersion(r.currentListVersion);
  const completions = Array.isArray(r.completions)
    ? r.completions.map((completion: any) => ({
        ...completion,
        listVersion: coerceListVersion(
          completion?.listVersion,
          currentListVersion
        ),
      }))
    : [];
  return {
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions,
    completionLedger: Array.isArray(r.completionLedger)
      ? r.completionLedger
      : undefined,
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    // NOTE: daySessions deliberately excluded from backups - they're temporal state
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null,
    currentListVersion: coerceListVersion(r.currentListVersion),
  };
}
