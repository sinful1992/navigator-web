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

  // 🔧 COMPAT FIX: Handle both flat and nested backup formats
  // - New format: { addresses, completions, ... } at top level
  // - Old format: { data: { addresses, completions, ... } }
  const source = r.addresses !== undefined ? r : (r.data ?? {});

  return {
    addresses: Array.isArray(source.addresses) ? source.addresses : [],
    completions: Array.isArray(source.completions) ? source.completions : [],
    arrangements: Array.isArray(source.arrangements) ? source.arrangements : [],
    // NOTE: daySessions deliberately excluded from backups - they're temporal state
    activeIndex: typeof source.activeIndex === "number" ? source.activeIndex : null,
    currentListVersion:
      typeof source.currentListVersion === "number" ? source.currentListVersion : 1,
  };
}
