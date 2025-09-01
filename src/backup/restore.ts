// src/backup/restore.ts
import { supabase } from "../lib/supabaseClient";
import type { AppState } from "../types";
import type { DaySnapshot } from "./backup";

export async function downloadSnapshot(objectPath: string): Promise<DaySnapshot> {
  const { data, error } = await supabase.storage.from("app_backups").download(objectPath);
  if (error || !data) throw (error ?? new Error("Download failed"));
  const txt = await data.text();
  return JSON.parse(txt) as DaySnapshot;
}

export function applySnapshotReplace(_state: AppState, snap: DaySnapshot): AppState {
  return {
    ..._state,
    currentListVersion: snap.currentListVersion ?? _state.currentListVersion,
    addresses: snap.addresses ?? [],
    completions: snap.completions ?? [],
    day: snap.day ?? {},
  };
}
