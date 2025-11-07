// src/services/AutomaticConflictResolver.ts
// Clean Architecture - Use Case Layer
// Automatic conflict resolution based on business rules

import { logger } from '../utils/logger';
import type { Completion, Arrangement } from '../types';

/**
 * Resolution strategy result
 */
export interface ResolutionResult {
  strategy: 'prefer_incoming' | 'prefer_existing' | 'manual';
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * AutomaticConflictResolver - Resolves conflicts automatically when possible
 *
 * Clean Architecture:
 * - Use Case Layer (business rules for conflict resolution)
 * - No infrastructure dependencies
 * - Testable in isolation
 *
 * Resolution Strategies:
 * 1. Last-Write-Wins (LWW): Most recent timestamp wins
 * 2. Content-Based: If one is empty/default, prefer the other
 * 3. Manual: If both have significant data, defer to user
 */
export class AutomaticConflictResolver {
  /**
   * Attempt to automatically resolve a conflict
   *
   * @param existingEntity - Current entity in state
   * @param incomingEntity - Incoming entity from operation
   * @returns Resolution result with strategy and confidence
   */
  resolveConflict<T extends Completion | Arrangement>(
    existingEntity: T,
    incomingEntity: T
  ): ResolutionResult {
    logger.info('🤖 AUTO-RESOLVE: Attempting automatic conflict resolution');

    // Strategy 1: Last-Write-Wins (timestamp-based)
    const timestampResolution = this.resolveByTimestamp(
      existingEntity,
      incomingEntity
    );

    if (timestampResolution.confidence === 'high') {
      logger.info('✅ AUTO-RESOLVE: Using Last-Write-Wins strategy', timestampResolution);
      return timestampResolution;
    }

    // Strategy 2: Content-based (one is empty/default)
    const contentResolution = this.resolveByContent(
      existingEntity,
      incomingEntity
    );

    if (contentResolution.confidence === 'high') {
      logger.info('✅ AUTO-RESOLVE: Using content-based strategy', contentResolution);
      return contentResolution;
    }

    // Strategy 3: Manual resolution required
    logger.info('⚠️ AUTO-RESOLVE: Manual resolution required - both entities have significant data');

    return {
      strategy: 'manual',
      reason: 'Both entities have significant data - user decision required',
      confidence: 'low',
    };
  }

  /**
   * Resolve by timestamp (Last-Write-Wins)
   *
   * Business Rule: Most recent modification wins
   *
   * Confidence:
   * - HIGH: Timestamp difference > 1 minute (clear winner)
   * - MEDIUM: Timestamp difference 10s-60s (likely winner)
   * - LOW: Timestamp difference < 10s (too close to call)
   */
  private resolveByTimestamp<T extends Completion | Arrangement>(
    existingEntity: T,
    incomingEntity: T
  ): ResolutionResult {
    const existingTime = this.getTimestamp(existingEntity);
    const incomingTime = this.getTimestamp(incomingEntity);

    if (!existingTime || !incomingTime) {
      return {
        strategy: 'manual',
        reason: 'Missing timestamp data',
        confidence: 'low',
      };
    }

    const existingMs = new Date(existingTime).getTime();
    const incomingMs = new Date(incomingTime).getTime();
    const diffMs = Math.abs(existingMs - incomingMs);
    const diffSeconds = diffMs / 1000;

    // High confidence: > 1 minute difference
    if (diffSeconds > 60) {
      const preferIncoming = incomingMs > existingMs;
      return {
        strategy: preferIncoming ? 'prefer_incoming' : 'prefer_existing',
        reason: `Last-Write-Wins: ${preferIncoming ? 'Incoming' : 'Existing'} is ${Math.round(diffSeconds)}s newer`,
        confidence: 'high',
      };
    }

    // Medium confidence: 10s-60s difference
    if (diffSeconds > 10) {
      const preferIncoming = incomingMs > existingMs;
      return {
        strategy: preferIncoming ? 'prefer_incoming' : 'prefer_existing',
        reason: `Last-Write-Wins: ${preferIncoming ? 'Incoming' : 'Existing'} is ${Math.round(diffSeconds)}s newer`,
        confidence: 'medium',
      };
    }

    // Low confidence: < 10s difference (too close)
    return {
      strategy: 'manual',
      reason: `Timestamps too close (${diffSeconds.toFixed(1)}s difference)`,
      confidence: 'low',
    };
  }

  /**
   * Resolve by content (one is empty/default)
   *
   * Business Rule: Prefer entity with more data
   *
   * Confidence:
   * - HIGH: One entity is clearly empty/default
   * - LOW: Both have significant data
   */
  private resolveByContent<T extends Completion | Arrangement>(
    existingEntity: T,
    incomingEntity: T
  ): ResolutionResult {
    const existingScore = this.getContentScore(existingEntity);
    const incomingScore = this.getContentScore(incomingEntity);

    // One is significantly emptier than the other
    if (existingScore === 0 && incomingScore > 0) {
      return {
        strategy: 'prefer_incoming',
        reason: 'Existing entity is empty, incoming has data',
        confidence: 'high',
      };
    }

    if (incomingScore === 0 && existingScore > 0) {
      return {
        strategy: 'prefer_existing',
        reason: 'Incoming entity is empty, existing has data',
        confidence: 'high',
      };
    }

    // Both have data - can't automatically resolve
    return {
      strategy: 'manual',
      reason: 'Both entities have significant data',
      confidence: 'low',
    };
  }

  /**
   * Get timestamp from entity
   */
  private getTimestamp(entity: Completion | Arrangement): string | null {
    if ('timestamp' in entity && entity.timestamp) {
      return entity.timestamp;
    }
    if ('createdAt' in entity && entity.createdAt) {
      return entity.createdAt;
    }
    return null;
  }

  /**
   * Calculate content score (how much data the entity has)
   *
   * Higher score = more data
   */
  private getContentScore(entity: Completion | Arrangement): number {
    let score = 0;

    // Check for non-empty string fields
    const stringFields = Object.values(entity).filter(
      v => typeof v === 'string' && v.length > 0
    );
    score += stringFields.length;

    // Check for numeric fields with non-zero values
    const numericFields = Object.values(entity).filter(
      v => typeof v === 'number' && v !== 0
    );
    score += numericFields.length;

    // Check for array fields with items
    const arrayFields = Object.values(entity).filter(
      v => Array.isArray(v) && v.length > 0
    );
    score += arrayFields.length * 2; // Arrays worth more

    return score;
  }

  /**
   * Get human-readable description of resolution
   */
  getResolutionDescription(result: ResolutionResult): string {
    const confidenceEmoji = {
      high: '✅',
      medium: '⚠️',
      low: '❌',
    };

    return `${confidenceEmoji[result.confidence]} ${result.strategy}: ${result.reason}`;
  }
}
