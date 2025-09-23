import { coerceListVersion } from "../useAppState";

export function normalizeState(raw: any) {
  const r = raw ?? {};
  const currentListVersion = coerceListVersion(r.currentListVersion);

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
