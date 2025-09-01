// src/backup/listBackups.ts
import { supabase } from "../lib/supabaseClient";

export type BackupRow = {
  id: number;
  user_id: string;
  day_key: string;
  object_path: string;
  size_bytes: number;
  created_at: string;
};

export async function listUserBackups(limit = 100): Promise<BackupRow[]> {
  const { data: user, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user?.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("backups")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as BackupRow[];
}

export async function getBackupSignedUrl(objectPath: string, expiresIn = 60): Promise<string> {
  const { data, error } = await supabase.storage.from("app_backups").createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) throw (error ?? new Error("No signed URL"));
  return data.signedUrl;
}
