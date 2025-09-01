// src/backup/backup.ts
import { supabase } from "../lib/supabaseClient";
import type { AppState } from "../types";

export type DaySnapshot = {
  capturedAt: string;
  dayKey: string;
  currentListVersion: number;
  day?: AppState["day"];
  addresses: AppState["addresses"];
  completions: AppState["completions"];
};

export function localDateKey(date: Date, timeZone = "Europe/London"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

export function makeDaySnapshot(state: AppState, dayKey: string, dayOverrides?: Partial<AppState["day"]>): DaySnapshot {
  return {
    capturedAt: new Date().toISOString(),
    dayKey,
    currentListVersion: state.currentListVersion,
    day: { ...(state.day ?? {}), ...(dayOverrides ?? {}) },
    addresses: state.addresses ?? [],
    completions: state.completions ?? [],
  };
}

async function backupDayToSupabase(uid: string, dayKey: string, snapshot: DaySnapshot) {
  const json = JSON.stringify(snapshot);
  const path = `${uid}/${dayKey}/day.json`;
  const { error: upErr } = await supabase.storage.from("app_backups").upload(
    path,
    new Blob([json], { type: "application/json" }),
    { upsert: true }
  );
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from("backups").insert({
    user_id: uid,
    day_key: dayKey,
    object_path: path,
    size_bytes: json.length,
    created_at: new Date().toISOString(),
  });
  if (insErr) throw insErr;
}

export async function performBackup(dayKey: string, snapshot: DaySnapshot) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new Error("Not authenticated");
  await backupDayToSupabase(data.user.id, dayKey, snapshot);
}
