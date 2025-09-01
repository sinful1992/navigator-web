// src/uploadBackup.ts
import { supabase } from "./lib/supabaseClient";

export async function uploadBackupToStorage(data: unknown, label: "finish" | "manual" = "manual") {
  if (!supabase) throw new Error("Supabase client not configured");
  const tz = "Europe/London";
  const now = new Date();
  const yyyy = now.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
  const mm = now.toLocaleDateString("en-GB", { timeZone: tz, month: "2-digit" });
  const dd = now.toLocaleDateString("en-GB", { timeZone: tz, day: "2-digit" });
  const time = now.toLocaleTimeString("en-GB", { timeZone: tz, hour12: false }).replace(/:/g, "");
  const bucket = import.meta.env.VITE_SUPABASE_BUCKET ?? "navigator-backups";
  const name = `backup_${yyyy}-${mm}-${dd}_${time}_${label}.json`;
  const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });

  const { error } = await supabase.storage.from(bucket).upload(name, file, {
    upsert: false,
    contentType: "application/json",
  });
  if (error) throw new Error(error.message);
  return name;
}
