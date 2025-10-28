// src/utils/validationUtils.ts - Centralized validation logic
// PHASE 2: Extracted from useAppState.ts to reduce duplication

import type { AppState, Completion, AddressRow } from '../types';

/**
 * Type guard: Check if object is a valid Completion
 */
export function validateCompletion(c: any): c is Completion {
  return c &&
    typeof c.index === 'number' &&
    typeof c.address === 'string' &&
    typeof c.outcome === 'string' &&
    ['PIF', 'DA', 'Done', 'ARR'].includes(c.outcome) &&
    typeof c.timestamp === 'string' &&
    !isNaN(new Date(c.timestamp).getTime());
}

/**
 * Type guard: Check if object is a valid AddressRow
 */
export function validateAddressRow(a: any): a is AddressRow {
  return a &&
    typeof a.address === 'string' &&
    a.address.trim().length > 0;
}

/**
 * Type guard: Check if object is a valid AppState
 */
export function validateAppState(state: any): state is AppState {
  return state &&
    Array.isArray(state.addresses) &&
    Array.isArray(state.completions) &&
    Array.isArray(state.daySessions) &&
    Array.isArray(state.arrangements) &&
    (state.activeIndex === null || typeof state.activeIndex === 'number') &&
    typeof state.currentListVersion === 'number';
}

/**
 * Add listVersion to completions, defaulting to provided version
 * Used when loading completions from storage
 */
export function stampCompletionsWithVersion(
  completions: any[] | undefined,
  version: number
): Completion[] {
  const src = Array.isArray(completions) ? completions : [];
  return src
    .filter(validateCompletion)
    .map((c: any) => ({
      ...c,
      listVersion: typeof c?.listVersion === "number" ? c.listVersion : version,
    }));
}

/**
 * Generate a deterministic operation ID from type, entity, and data
 */
export function generateOperationId(type: string, entity: string, data: any): string {
  const key = `${type}_${entity}_${JSON.stringify(data).slice(0, 50)}_${Date.now()}`;
  // Use encodeURIComponent to handle Unicode characters before base64 encoding
  const unicodeSafeKey = encodeURIComponent(key);
  return btoa(unicodeSafeKey).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}
