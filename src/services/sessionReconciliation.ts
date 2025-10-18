// src/services/sessionReconciliation.ts
import { normalizeState } from '../utils/normalizeState';
import { isProtectionActive } from '../utils/protectionFlags';
import { logger } from '../utils/logger';
import type { AppState } from '../types';

/**
 * Post-restore session reconciliation
 *
 * After restoring a backup, reconciles the local session state (daySessions)
 * with the current cloud state to ensure day tracking is accurate.
 *
 * ARCHITECTURAL FIX: Prevents session data from being lost when restoring
 * older backups that don't include current day session information.
 *
 * @param cloudSync - Cloud sync object with user information
 * @param setState - State setter function to update local state
 * @param supabase - Supabase client for fetching cloud state
 */
export async function reconcileSessionState(
  cloudSync: any,
  setState: (updater: (currentState: AppState) => AppState) => void,
  supabase: any
): Promise<void> {
  if (!cloudSync.user || !supabase) {
    return;
  }

  // 🔧 CRITICAL FIX: Check if restore is in progress before reconciling
  // (using centralized protection manager)
  if (isProtectionActive('navigator_restore_in_progress')) {
    logger.info('🛡️ RESTORE PROTECTION: Skipping session reconciliation to prevent data loss');
    return;
  }

  try {
    logger.info('Post-restore: Reconciling session state with cloud...');

    // Fetch latest state from cloud to get current session info
    const { data: cloudState, error } = await supabase
      .from("navigator_state")
      .select("data")
      .eq("user_id", cloudSync.user.id)
      .maybeSingle();

    if (error || !cloudState?.data) {
      logger.warn('No cloud state found for session reconciliation');
      return;
    }

    const normalized = normalizeState(cloudState.data);
    const cloudSessions = normalized.daySessions || [];

    // Update local state with cloud session data only
    setState((currentState: AppState) => ({
      ...currentState,
      daySessions: cloudSessions
    }));

    logger.info('Session state reconciled with cloud successfully');
  } catch (error) {
    logger.error('Failed to reconcile session state:', error);
    // Don't throw - this is a nice-to-have, not critical
  }
}
