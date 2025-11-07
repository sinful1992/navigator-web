// src/utils/syncRepairConsole.ts
// Console helper for diagnosing and repairing sync issues
// Usage: Open browser console and run: window.syncRepair.diagnose()

import { diagnoseSyncIssues, repairSequenceCollisions, clearAllFailedOperations, getSyncStatus } from './syncDiagnostics';
import { logger } from './logger';

/**
 * Global sync repair interface for console access
 *
 * USAGE INSTRUCTIONS:
 *
 * 1. Open browser console (F12)
 *
 * 2. Check sync status:
 *    await window.syncRepair.status()
 *
 * 3. Diagnose issues:
 *    await window.syncRepair.diagnose()
 *
 * 4. Repair sequence collisions:
 *    await window.syncRepair.repair()
 *
 * 5. Clear all failed operations (DESTRUCTIVE):
 *    await window.syncRepair.clearFailed()
 */
export class SyncRepairConsole {
  private userId: string | null = null;
  private deviceId: string | null = null;

  /**
   * Initialize with user and device IDs
   * Called automatically by App.tsx when user signs in
   */
  init(userId: string, deviceId: string): void {
    this.userId = userId;
    this.deviceId = deviceId;
    logger.info('🔧 Sync repair console initialized', { userId, deviceId });
  }

  /**
   * Check current sync status
   */
  async status(): Promise<void> {
    if (!this.userId || !this.deviceId) {
      console.error('❌ Not initialized. User must be signed in.');
      return;
    }

    console.log('🔍 Checking sync status...');
    const status = await getSyncStatus(this.userId, this.deviceId);

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('       SYNC STATUS');
    console.log('═══════════════════════════════════════');
    console.log('');

    const icon = status.status === 'healthy' ? '✅' : status.status === 'warning' ? '⚠️' : '❌';
    console.log(`${icon} Status: ${status.status.toUpperCase()}`);
    console.log(`   ${status.message}`);
    console.log('');
    console.log('Details:');
    console.log(`  Local max sequence:  ${status.details.localMaxSequence}`);
    console.log(`  Cloud max sequence:  ${status.details.cloudMaxSequence}`);
    console.log(`  Last synced:         ${status.details.localLastSynced}`);
    console.log(`  Gap:                 ${status.details.gap}`);
    console.log(`  Unsynced operations: ${status.details.unsyncedCount}`);
    console.log(`  Retry queue:         ${status.details.retryQueueCount}`);
    console.log(`  Dead letter queue:   ${status.details.deadLetterCount}`);
    console.log(`  Sequence collisions: ${status.details.sequenceCollisions.length}`);
    console.log('');
    console.log('Recommendation:');
    console.log(`  ${status.details.recommendation}`);
    console.log('');
    console.log('═══════════════════════════════════════');
  }

  /**
   * Run full diagnostics
   */
  async diagnose(): Promise<void> {
    if (!this.userId || !this.deviceId) {
      console.error('❌ Not initialized. User must be signed in.');
      return;
    }

    console.log('🔍 Running full diagnostics...');
    const diagnostics = await diagnoseSyncIssues(this.userId, this.deviceId);

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('       SYNC DIAGNOSTICS');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('Sequences:');
    console.log(`  Local max:     ${diagnostics.localMaxSequence}`);
    console.log(`  Cloud max:     ${diagnostics.cloudMaxSequence}`);
    console.log(`  Last synced:   ${diagnostics.localLastSynced}`);
    console.log(`  Gap:           ${diagnostics.gap}`);
    console.log('');
    console.log('Queue Status:');
    console.log(`  Unsynced:      ${diagnostics.unsyncedCount} operations`);
    console.log(`  Retry queue:   ${diagnostics.retryQueueCount} operations`);
    console.log(`  Dead letter:   ${diagnostics.deadLetterCount} operations`);
    console.log('');

    if (diagnostics.sequenceCollisions.length > 0) {
      console.log('⚠️ SEQUENCE COLLISIONS DETECTED:');
      console.log('');
      diagnostics.sequenceCollisions.forEach((collision, i) => {
        console.log(`  ${i + 1}. Sequence ${collision.sequence}`);
        console.log(`     ${collision.reason}`);
      });
      console.log('');
      console.log('  To fix: await window.syncRepair.repair()');
    } else {
      console.log('✅ No sequence collisions detected');
    }

    console.log('');
    console.log('Recommendation:');
    console.log(`  ${diagnostics.recommendation}`);
    console.log('');
    console.log('═══════════════════════════════════════');
  }

  /**
   * Repair sequence collisions
   */
  async repair(): Promise<void> {
    if (!this.userId || !this.deviceId) {
      console.error('❌ Not initialized. User must be signed in.');
      return;
    }

    console.log('🔧 Starting sequence collision repair...');
    console.log('');

    const result = await repairSequenceCollisions(this.userId, this.deviceId);

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('       REPAIR RESULTS');
    console.log('═══════════════════════════════════════');
    console.log('');

    if (result.success) {
      console.log('✅ Repair successful!');
      console.log(`   ${result.reassignedCount} operations reassigned new sequences`);
    } else {
      console.log('❌ Repair failed with errors:');
      result.errors.forEach((error, i) => {
        console.log(`   ${i + 1}. ${error}`);
      });
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Wait 10 seconds for auto-sync to retry');
    console.log('  2. Check status: await window.syncRepair.status()');
    console.log('  3. If still failing, check browser console for errors');
  }

  /**
   * Clear all failed operations (DESTRUCTIVE)
   */
  async clearFailed(): Promise<void> {
    console.log('⚠️ WARNING: This will permanently delete all failed operations!');
    console.log('   Operations in retry queue and dead letter queue will be lost.');
    console.log('');

    const confirmed = confirm(
      'Are you sure you want to clear all failed operations?\n\n' +
      'This action cannot be undone.\n\n' +
      'Click OK to proceed, Cancel to abort.'
    );

    if (!confirmed) {
      console.log('❌ Cancelled by user');
      return;
    }

    console.log('🗑️ Clearing all failed operations...');
    await clearAllFailedOperations();

    console.log('');
    console.log('✅ All failed operations cleared');
    console.log('   Retry queue: cleared');
    console.log('   Dead letter queue: cleared');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Refresh the page to rebuild state');
    console.log('  2. Check that data is correct');
    console.log('  3. Create new operations if needed');
  }

  /**
   * Show help
   */
  help(): void {
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('    SYNC REPAIR CONSOLE HELP');
    console.log('═══════════════════════════════════════');
    console.log('');
    console.log('Available commands:');
    console.log('');
    console.log('  await window.syncRepair.status()');
    console.log('    Quick status check');
    console.log('');
    console.log('  await window.syncRepair.diagnose()');
    console.log('    Full diagnostic report');
    console.log('');
    console.log('  await window.syncRepair.repair()');
    console.log('    Repair sequence collisions');
    console.log('');
    console.log('  await window.syncRepair.clearFailed()');
    console.log('    Clear all failed operations (DESTRUCTIVE)');
    console.log('');
    console.log('  window.syncRepair.help()');
    console.log('    Show this help message');
    console.log('');
    console.log('═══════════════════════════════════════');
  }
}

// Create singleton instance
export const syncRepairConsole = new SyncRepairConsole();

// Attach to window for console access
declare global {
  interface Window {
    syncRepair: SyncRepairConsole;
  }
}

if (typeof window !== 'undefined') {
  window.syncRepair = syncRepairConsole;
  console.log('🔧 Sync repair console loaded. Type "window.syncRepair.help()" for usage.');
}
