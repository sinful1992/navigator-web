// src/storage.ts
import { get, set } from "idb-keyval";
import type { AppState } from "./types";

const STORAGE_KEY = "navigator_state_v2";

export async function loadState(): Promise<AppState | undefined> {
  return (await get(STORAGE_KEY)) as AppState | undefined;
}

export async function saveState(state: AppState) {
  await set(STORAGE_KEY, state);
}
