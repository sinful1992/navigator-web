// src/services/ConflictMetricsService.ts
// PHASE 3: Conflict Metrics and Monitoring (Domain Layer)
// Clean Architecture: Domain layer tracks and analyzes conflict metrics

import { get, set } from 'idb-keyval';
import type { VersionConflict } from '../types';
import { logger } from '../utils/logger';

/**
 * Metrics for version conflict resolution (Phase 3 UI conflicts)
 * Separate from Phase 1.3 operation-level conflict metrics
 */
export interface ConflictMetrics {
  // Detection metrics
  totalDetected: number;
  detectedByEntityType: {
    completion: number;
    arrangement: number;
  };

  // Resolution metrics
  totalResolved: number;
  resolvedByStrategy: {
    'keep-local': number;
    'use-remote': number;
    'manual': number;
  };
  totalDismissed: number;

  // Performance metrics
  averageResolutionTimeMs: number;
  fastestResolutionMs: number;
  slowestResolutionMs: number;

  // Temporal metrics
  firstConflictAt?: string; // ISO timestamp
  lastConflictAt?: string; // ISO timestamp
  lastResolutionAt?: string; // ISO timestamp

  // Health metrics
  conflictsPerDay: number;
  resolutionRate: number; // Percentage of conflicts resolved vs dismissed

  // Updated timestamp
  updatedAt: string;
}

/**
 * Individual conflict event for detailed analytics
 */
export interface ConflictEvent {
  id: string;
  conflictId: string;
  timestamp: string;
  eventType: 'detected' | 'resolved' | 'dismissed';
  entityType: 'completion' | 'arrangement';
  entityId: string;
  resolution?: 'keep-local' | 'use-remote' | 'manual';
  resolutionTimeMs?: number; // Time from detection to resolution
}

/**
 * ConflictMetricsService - Domain layer metrics tracking
 *
 * Responsibilities (Clean Architecture - Domain Layer):
 * - Track conflict detection and resolution metrics
 * - Calculate performance and health metrics
 * - Persist metrics across sessions
 * - Provide metrics for monitoring UI
 * - NO UI concerns
 * - NO infrastructure concerns (uses minimal persistence)
 *
 * Why Domain Layer?
 * - Pure business logic for metrics
 * - No framework dependencies
 * - Can be tested in isolation
 * - Reusable across different presentation layers
 */
export class ConflictMetricsService {
  private static readonly METRICS_KEY = 'conflict_metrics_v1';
  private static readonly EVENTS_KEY_PREFIX = 'conflict_event_';
  private static readonly MAX_EVENTS_TO_KEEP = 1000; // Keep last 1000 events

  /**
   * Get current conflict metrics
   * Loads from persistent storage
   */
  static async getMetrics(): Promise<ConflictMetrics> {
    const stored = await get<ConflictMetrics>(this.METRICS_KEY);

    if (stored) {
      return stored;
    }

    // Return initial metrics if none exist
    return this.getInitialMetrics();
  }

  /**
   * Track conflict detection
   * Business Rule: Record when conflict is first detected
   */
  static async trackConflictDetected(conflict: VersionConflict): Promise<void> {
    const metrics = await this.getMetrics();
    const now = new Date().toISOString();

    // Update detection metrics
    metrics.totalDetected += 1;
    metrics.detectedByEntityType[conflict.entityType] += 1;
    metrics.lastConflictAt = now;

    if (!metrics.firstConflictAt) {
      metrics.firstConflictAt = now;
    }

    // Update temporal metrics
    this.updateTemporalMetrics(metrics);

    metrics.updatedAt = now;
    await set(this.METRICS_KEY, metrics);

    // Record event for detailed analytics
    const event: ConflictEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      conflictId: conflict.id,
      timestamp: now,
      eventType: 'detected',
      entityType: conflict.entityType,
      entityId: conflict.entityId,
    };
    await this.recordEvent(event);

    logger.info('📊 CONFLICT METRICS: Detection tracked', {
      conflictId: conflict.id,
      totalDetected: metrics.totalDetected,
    });
  }

  /**
   * Track conflict resolution
   * Business Rule: Record resolution strategy and timing
   */
  static async trackConflictResolved(
    conflict: VersionConflict,
    strategy: 'keep-local' | 'use-remote' | 'manual'
  ): Promise<void> {
    const metrics = await this.getMetrics();
    const now = new Date().toISOString();

    // Update resolution metrics
    metrics.totalResolved += 1;
    metrics.resolvedByStrategy[strategy] += 1;
    metrics.lastResolutionAt = now;

    // Calculate resolution time
    const detectedAt = new Date(conflict.timestamp).getTime();
    const resolvedAt = new Date(now).getTime();
    const resolutionTimeMs = resolvedAt - detectedAt;

    // Update performance metrics
    this.updatePerformanceMetrics(metrics, resolutionTimeMs);

    // Update health metrics
    this.updateHealthMetrics(metrics);

    metrics.updatedAt = now;
    await set(this.METRICS_KEY, metrics);

    // Record event for detailed analytics
    const event: ConflictEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      conflictId: conflict.id,
      timestamp: now,
      eventType: 'resolved',
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      resolution: strategy,
      resolutionTimeMs,
    };
    await this.recordEvent(event);

    logger.info('📊 CONFLICT METRICS: Resolution tracked', {
      conflictId: conflict.id,
      strategy,
      resolutionTimeMs,
      totalResolved: metrics.totalResolved,
    });
  }

  /**
   * Track conflict dismissal
   * Business Rule: Record when user dismisses without resolving
   */
  static async trackConflictDismissed(conflict: VersionConflict): Promise<void> {
    const metrics = await this.getMetrics();
    const now = new Date().toISOString();

    // Update dismissal metrics
    metrics.totalDismissed += 1;

    // Update health metrics
    this.updateHealthMetrics(metrics);

    metrics.updatedAt = now;
    await set(this.METRICS_KEY, metrics);

    // Record event for detailed analytics
    const event: ConflictEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      conflictId: conflict.id,
      timestamp: now,
      eventType: 'dismissed',
      entityType: conflict.entityType,
      entityId: conflict.entityId,
    };
    await this.recordEvent(event);

    logger.info('📊 CONFLICT METRICS: Dismissal tracked', {
      conflictId: conflict.id,
      totalDismissed: metrics.totalDismissed,
    });
  }

  /**
   * Get conflict metrics summary for display
   * Business Rule: Format metrics for UI consumption
   */
  static async getMetricsSummary(): Promise<{
    healthScore: number; // 0-100, higher is better
    conflictRate: string; // "X conflicts per day"
    resolutionRate: string; // "X% resolved"
    favoriteStrategy: string; // Most common resolution strategy
    averageResolutionTime: string; // "X seconds"
  }> {
    const metrics = await this.getMetrics();

    // Calculate health score (0-100)
    // - Low conflict rate = good
    // - High resolution rate = good
    // - Fast resolution time = good
    const healthScore = this.calculateHealthScore(metrics);

    // Format conflict rate
    const conflictRate = `${metrics.conflictsPerDay.toFixed(1)} conflicts/day`;

    // Format resolution rate
    const resolutionRate = `${metrics.resolutionRate.toFixed(0)}% resolved`;

    // Find favorite strategy
    const strategies = metrics.resolvedByStrategy;
    const favoriteStrategy = Object.entries(strategies).reduce((a, b) =>
      b[1] > a[1] ? b : a
    )[0] || 'none';

    // Format average resolution time
    const avgTimeSeconds = metrics.averageResolutionTimeMs / 1000;
    const averageResolutionTime = avgTimeSeconds < 60
      ? `${avgTimeSeconds.toFixed(0)}s`
      : `${(avgTimeSeconds / 60).toFixed(1)}m`;

    return {
      healthScore,
      conflictRate,
      resolutionRate,
      favoriteStrategy,
      averageResolutionTime,
    };
  }

  /**
   * Reset all metrics
   * Business Rule: Allow user to clear metrics history
   */
  static async resetMetrics(): Promise<void> {
    const initial = this.getInitialMetrics();
    await set(this.METRICS_KEY, initial);

    // Clear all events (future enhancement)
    // await this.clearAllEvents();

    logger.info('📊 CONFLICT METRICS: Metrics reset');
  }

  // ==================== Private Helper Methods ====================

  private static getInitialMetrics(): ConflictMetrics {
    return {
      totalDetected: 0,
      detectedByEntityType: {
        completion: 0,
        arrangement: 0,
      },
      totalResolved: 0,
      resolvedByStrategy: {
        'keep-local': 0,
        'use-remote': 0,
        'manual': 0,
      },
      totalDismissed: 0,
      averageResolutionTimeMs: 0,
      fastestResolutionMs: Infinity,
      slowestResolutionMs: 0,
      conflictsPerDay: 0,
      resolutionRate: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  private static updatePerformanceMetrics(
    metrics: ConflictMetrics,
    resolutionTimeMs: number
  ): void {
    // Update average (running average)
    const totalResolutions = metrics.totalResolved + 1;
    const currentSum = metrics.averageResolutionTimeMs * metrics.totalResolved;
    metrics.averageResolutionTimeMs = (currentSum + resolutionTimeMs) / totalResolutions;

    // Update fastest/slowest
    if (resolutionTimeMs < metrics.fastestResolutionMs) {
      metrics.fastestResolutionMs = resolutionTimeMs;
    }
    if (resolutionTimeMs > metrics.slowestResolutionMs) {
      metrics.slowestResolutionMs = resolutionTimeMs;
    }
  }

  private static updateTemporalMetrics(metrics: ConflictMetrics): void {
    // Calculate conflicts per day
    if (metrics.firstConflictAt && metrics.lastConflictAt) {
      const firstTime = new Date(metrics.firstConflictAt).getTime();
      const lastTime = new Date(metrics.lastConflictAt).getTime();
      const daysDiff = (lastTime - firstTime) / (1000 * 60 * 60 * 24);

      if (daysDiff > 0) {
        metrics.conflictsPerDay = metrics.totalDetected / daysDiff;
      } else {
        // Same day - use totalDetected as conflicts today
        metrics.conflictsPerDay = metrics.totalDetected;
      }
    }
  }

  private static updateHealthMetrics(metrics: ConflictMetrics): void {
    // Calculate resolution rate (percentage of conflicts resolved vs dismissed)
    const totalHandled = metrics.totalResolved + metrics.totalDismissed;
    if (totalHandled > 0) {
      metrics.resolutionRate = (metrics.totalResolved / totalHandled) * 100;
    }
  }

  private static calculateHealthScore(metrics: ConflictMetrics): number {
    let score = 100;

    // Penalty for high conflict rate (more than 1 per day is concerning)
    if (metrics.conflictsPerDay > 1) {
      score -= Math.min(30, metrics.conflictsPerDay * 5);
    }

    // Penalty for low resolution rate (less than 80% is concerning)
    if (metrics.resolutionRate < 80) {
      score -= (80 - metrics.resolutionRate) / 2;
    }

    // Penalty for slow resolutions (more than 60 seconds is slow)
    const avgTimeSeconds = metrics.averageResolutionTimeMs / 1000;
    if (avgTimeSeconds > 60) {
      score -= Math.min(20, (avgTimeSeconds - 60) / 6);
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private static async recordEvent(event: ConflictEvent): Promise<void> {
    const key = `${this.EVENTS_KEY_PREFIX}${event.id}`;
    await set(key, event);

    // Future enhancement: Cleanup old events to prevent storage bloat
    // This would require tracking event IDs in a separate index
  }
}
