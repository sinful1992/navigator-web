export function normalizeState(raw: any) {
  const r = raw ?? {};
  const currentListVersion =
    typeof r.currentListVersion === "number" ? r.currentListVersion : 1;

  return {
    ...r,
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions: Array.isArray(r.completions) ? r.completions : [],
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    daySessions: Array.isArray(r.daySessions) ? r.daySessions : [],
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null,
    currentListVersion,
  };
}

// ARCHITECTURAL: Separate data from session state for backups
export function normalizeBackupData(raw: any) {
  const r = raw ?? {};
  return {
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    completions: Array.isArray(r.completions) ? r.completions : [],
    arrangements: Array.isArray(r.arrangements) ? r.arrangements : [],
    // NOTE: daySessions deliberately excluded from backups - they're temporal state
    activeIndex: typeof r.activeIndex === "number" ? r.activeIndex : null,
    currentListVersion:
      typeof r.currentListVersion === "number" ? r.currentListVersion : 1,
  };
}
