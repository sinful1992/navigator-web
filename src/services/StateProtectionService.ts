// src/services/StateProtectionService.ts
// Clean Architecture - Use Case Layer
// Centralized protection logic for state updates

import { isProtectionActive } from '../utils/protectionFlags';
import { logger } from '../utils/logger';

/**
 * Protection check result
 */
export interface ProtectionCheckResult {
  allowed: boolean;
  reason?: string;
  isInitialLoad?: boolean;
}

/**
 * StateProtectionService - Centralized protection logic
 *
 * Clean Architecture:
 * - Use Case Layer (application business rules)
 * - No infrastructure dependencies (protection flags are utilities)
 * - Testable in isolation
 * - Single source of truth for protection decisions
 *
 * Responsibilities:
 * - Determine if state updates should be allowed
 * - Handle initial bootstrap vs live update logic
 * - Provide clear reasons for blocked updates
 */
export class StateProtectionService {
  /**
   * Check if state update should be allowed
   *
   * Business Rules:
   * 1. Initial bootstrap (first load, flags not ready) → ALLOW (bypass protection)
   * 2. Initial bootstrap (first load, flags ready) → CHECK PROTECTIONS
   * 3. Live update (flags not ready) → BLOCK (defer until ready)
   * 4. Live update (flags ready) → CHECK PROTECTIONS
   *
   * @param isInitialLoad - Is this the first data load (bootstrap)?
   * @param flagsReady - Are protection flags initialized?
   * @returns Protection check result with allowed status and reason
   */
  shouldAllowStateUpdate(
    isInitialLoad: boolean,
    flagsReady: boolean
  ): ProtectionCheckResult {
    // Rule 1: Initial bootstrap with flags not ready → Allow (fixes race condition)
    if (isInitialLoad && !flagsReady) {
      logger.info('🚀 PROTECTION: Initial bootstrap, flags not ready - ALLOWING');
      return {
        allowed: true,
        isInitialLoad: true,
        reason: 'initial_bootstrap_bypass'
      };
    }

    // Rule 2: Live update with flags not ready → Block (defer)
    if (!isInitialLoad && !flagsReady) {
      logger.info('⏳ PROTECTION: Live update, flags not ready - DEFERRING');
      return {
        allowed: false,
        reason: 'protection_flags_not_ready'
      };
    }

    // Rule 3 & 4: Check all protection flags (initial load with flags ready OR live update with flags ready)
    const activeProtections = this.getActiveProtections();

    if (activeProtections.length > 0) {
      const reason = activeProtections.join(', ');
      logger.sync(`🛡️ PROTECTION: Active protections [${reason}] - BLOCKING`);
      return {
        allowed: false,
        reason
      };
    }

    // No protections active → Allow
    logger.info('✅ PROTECTION: No active protections - ALLOWING');
    return {
      allowed: true
    };
  }

  /**
   * Get list of currently active protection flags
   *
   * Protection Flags:
   * - navigator_restore_in_progress: Backup restore in progress (60s timeout)
   * - navigator_import_in_progress: Address import/add in progress (6s timeout)
   * - navigator_active_protection: Address time tracking active (Infinity timeout)
   * - navigator_session_protection: Session update in progress (Infinity timeout)
   *
   * @returns Array of active protection flag names
   */
  getActiveProtections(): string[] {
    const protections = [
      'navigator_restore_in_progress',
      'navigator_import_in_progress',
      'navigator_active_protection',
      'navigator_session_protection',
    ] as const;

    return protections.filter(flag => isProtectionActive(flag));
  }

  /**
   * Check if specific protection is active
   *
   * @param flag - Protection flag to check
   * @returns true if protection is active, false otherwise
   */
  isProtectionActive(flag: string): boolean {
    return isProtectionActive(flag as any);
  }

  /**
   * Get human-readable description of active protections
   *
   * @returns Description of active protections or "none"
   */
  getActiveProtectionsDescription(): string {
    const active = this.getActiveProtections();

    if (active.length === 0) {
      return 'none';
    }

    const descriptions: Record<string, string> = {
      'navigator_restore_in_progress': 'Backup restore',
      'navigator_import_in_progress': 'Address import',
      'navigator_active_protection': 'Time tracking',
      'navigator_session_protection': 'Session update',
    };

    return active.map(flag => descriptions[flag] || flag).join(', ');
  }
}
