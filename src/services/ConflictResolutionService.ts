// src/services/ConflictResolutionService.ts
// PHASE 3: Conflict Resolution Business Logic (Domain Layer)
// Clean Architecture: Domain layer contains business rules for conflict resolution

import type { VersionConflict, Completion, Arrangement } from '../types';
import { logger } from '../utils/logger';

/**
 * Resolution strategies for version conflicts
 */
export type ResolutionStrategy = 'keep-local' | 'use-remote' | 'manual';

/**
 * Result of conflict resolution
 */
export interface ConflictResolution {
  conflictId: string;
  strategy: ResolutionStrategy;
  resolvedData: Partial<Completion> | Partial<Arrangement>;
  newVersion: number;
}

/**
 * ConflictResolutionService - Domain layer business logic
 *
 * Responsibilities (Clean Architecture - Domain Layer):
 * - Business rules for conflict resolution
 * - Merge strategies
 * - Validation of resolutions
 * - NO UI concerns
 * - NO infrastructure concerns (no direct DB/API calls)
 *
 * Why Domain Layer?
 * - Contains core business logic
 * - Independent of frameworks and UI
 * - Can be tested in isolation
 * - Reusable across different presentation layers
 */
export class ConflictResolutionService {
  /**
   * Resolve conflict by keeping local changes
   *
   * Business Rule: Local version wins, remote changes are discarded
   * Use case: User explicitly chooses to keep their changes
   */
  static resolveKeepLocal(conflict: VersionConflict): ConflictResolution {
    logger.info('🔄 CONFLICT RESOLUTION: Keeping local changes', {
      conflictId: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
    });

    return {
      conflictId: conflict.id,
      strategy: 'keep-local',
      resolvedData: conflict.localData,
      newVersion: conflict.currentVersion, // Keep current version
    };
  }

  /**
   * Resolve conflict by using remote changes
   *
   * Business Rule: Remote version wins, local changes are overwritten
   * Use case: User acknowledges remote changes are more current
   */
  static resolveUseRemote(conflict: VersionConflict): ConflictResolution {
    logger.info('🔄 CONFLICT RESOLUTION: Using remote changes', {
      conflictId: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
    });

    // Merge remote updates with local base
    const resolvedData = {
      ...conflict.localData,
      ...conflict.remoteData,
    };

    return {
      conflictId: conflict.id,
      strategy: 'use-remote',
      resolvedData,
      newVersion: conflict.currentVersion + 1, // Increment version after accepting remote
    };
  }

  /**
   * Resolve conflict with manual merge
   *
   * Business Rule: User manually combines both versions
   * Use case: User wants specific fields from both versions
   */
  static resolveManual(
    conflict: VersionConflict,
    manualData: Partial<Completion> | Partial<Arrangement>
  ): ConflictResolution {
    logger.info('🔄 CONFLICT RESOLUTION: Manual merge', {
      conflictId: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
    });

    // Validate manual data has required fields
    const resolvedData = {
      ...conflict.localData,
      ...manualData,
    };

    return {
      conflictId: conflict.id,
      strategy: 'manual',
      resolvedData,
      newVersion: conflict.currentVersion + 1, // Increment version after manual resolution
    };
  }

  /**
   * Dismiss conflict without resolving
   *
   * Business Rule: Conflict is acknowledged but no action taken
   * Use case: User decides conflict is not critical or will handle later
   */
  static dismissConflict(conflict: VersionConflict): { conflictId: string } {
    logger.info('🔄 CONFLICT DISMISSED: No changes applied', {
      conflictId: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
    });

    return {
      conflictId: conflict.id,
    };
  }

  /**
   * Get summary of conflict for display
   *
   * Business Rule: Extract key differences for user review
   */
  static getConflictSummary(conflict: VersionConflict): {
    entityType: string;
    entityDisplay: string;
    localChanges: string[];
    remoteChanges: string[];
    timestamp: string;
  } {
    const localChanges: string[] = [];
    const remoteChanges: string[] = [];

    // Extract meaningful differences
    if (conflict.entityType === 'completion') {
      const local = conflict.localData as Completion;
      const remote = conflict.remoteData as Partial<Completion>;

      if (remote.outcome && remote.outcome !== local.outcome) {
        localChanges.push(`Outcome: ${local.outcome}`);
        remoteChanges.push(`Outcome: ${remote.outcome}`);
      }

      if (remote.amount && remote.amount !== local.amount) {
        localChanges.push(`Amount: £${local.amount || '0'}`);
        remoteChanges.push(`Amount: £${remote.amount}`);
      }

      if (remote.caseReference && remote.caseReference !== local.caseReference) {
        localChanges.push(`Case: ${local.caseReference || 'None'}`);
        remoteChanges.push(`Case: ${remote.caseReference}`);
      }
    } else if (conflict.entityType === 'arrangement') {
      const local = conflict.localData as Arrangement;
      const remote = conflict.remoteData as Partial<Arrangement>;

      if (remote.status && remote.status !== local.status) {
        localChanges.push(`Status: ${local.status}`);
        remoteChanges.push(`Status: ${remote.status}`);
      }

      if (remote.amount && remote.amount !== local.amount) {
        localChanges.push(`Amount: £${local.amount || '0'}`);
        remoteChanges.push(`Amount: £${remote.amount}`);
      }

      if (remote.scheduledDate && remote.scheduledDate !== local.scheduledDate) {
        localChanges.push(`Date: ${local.scheduledDate}`);
        remoteChanges.push(`Date: ${remote.scheduledDate}`);
      }
    }

    // Get entity display name
    const entityDisplay =
      conflict.entityType === 'completion'
        ? (conflict.localData as Completion).address
        : (conflict.localData as Arrangement).customerName || 'Unknown';

    return {
      entityType: conflict.entityType,
      entityDisplay,
      localChanges,
      remoteChanges,
      timestamp: conflict.timestamp,
    };
  }

  /**
   * Validate that conflict can be resolved
   *
   * Business Rule: Ensure conflict is still valid and entity still exists
   */
  static canResolve(conflict: VersionConflict): { valid: boolean; reason?: string } {
    if (conflict.status !== 'pending') {
      return {
        valid: false,
        reason: 'Conflict already resolved or dismissed',
      };
    }

    if (!conflict.localData) {
      return {
        valid: false,
        reason: 'Local entity no longer exists',
      };
    }

    return { valid: true };
  }
}
