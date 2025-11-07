// src/components/ConflictMetricsPanel.tsx
// PHASE 3: Conflict Metrics Monitoring UI (UI Layer)
// Clean Architecture: UI layer displays metrics from domain service

import React, { useState, useEffect } from 'react';
import { ConflictMetricsService, type ConflictMetrics } from '../services/ConflictMetricsService';

export interface ConflictMetricsPanelProps {
  onClose?: () => void;
}

/**
 * ConflictMetricsPanel - UI Layer Component
 *
 * Responsibilities (Clean Architecture - UI Layer):
 * - Display conflict resolution metrics
 * - Show health score and sync health
 * - Provide metrics summary for monitoring
 * - NO business logic (delegates to service for metrics)
 * - NO state management (reads from service)
 *
 * Why UI Layer?
 * - Pure presentation
 * - React-specific rendering
 * - User interaction only
 * - No business rules
 */
export const ConflictMetricsPanel: React.FC<ConflictMetricsPanelProps> = ({ onClose }) => {
  const [metrics, setMetrics] = useState<ConflictMetrics | null>(null);
  const [summary, setSummary] = useState<{
    healthScore: number;
    conflictRate: string;
    resolutionRate: string;
    favoriteStrategy: string;
    averageResolutionTime: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const [metricsData, summaryData] = await Promise.all([
          ConflictMetricsService.getMetrics(),
          ConflictMetricsService.getMetricsSummary(),
        ]);

        setMetrics(metricsData);
        setSummary(summaryData);
      } catch (error) {
        console.error('Failed to load conflict metrics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMetrics();

    // Refresh metrics every 5 seconds if panel is open
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset all conflict metrics? This cannot be undone.')) {
      await ConflictMetricsService.resetMetrics();
      // Reload metrics
      const [metricsData, summaryData] = await Promise.all([
        ConflictMetricsService.getMetrics(),
        ConflictMetricsService.getMetricsSummary(),
      ]);
      setMetrics(metricsData);
      setSummary(summaryData);
    }
  };

  if (isLoading || !metrics || !summary) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
        Loading metrics...
      </div>
    );
  }

  // Determine health color based on score
  const getHealthColor = (score: number): string => {
    if (score >= 80) return '#10b981'; // Green
    if (score >= 60) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  const healthColor = getHealthColor(summary.healthScore);

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      padding: '1.5rem',
      maxWidth: '600px',
      margin: '1rem auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '1.25rem',
          fontWeight: 600,
          color: '#111827',
        }}>
          📊 Conflict Resolution Metrics
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Health Score */}
      <div style={{
        background: `linear-gradient(135deg, ${healthColor}15 0%, ${healthColor}08 100%)`,
        border: `2px solid ${healthColor}40`,
        borderRadius: '10px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.5rem',
        }}>
          Sync Health Score
        </div>
        <div style={{
          fontSize: '3rem',
          fontWeight: 700,
          color: healthColor,
          marginBottom: '0.25rem',
        }}>
          {summary.healthScore}
        </div>
        <div style={{
          fontSize: '0.875rem',
          color: '#6b7280',
        }}>
          {summary.healthScore >= 80 && '✅ Excellent - No issues detected'}
          {summary.healthScore >= 60 && summary.healthScore < 80 && '⚠️ Fair - Minor sync issues'}
          {summary.healthScore < 60 && '🚨 Poor - Frequent conflicts detected'}
        </div>
      </div>

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{
          background: 'rgba(99, 102, 241, 0.05)',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid rgba(99, 102, 241, 0.1)',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Conflict Rate
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#6366f1' }}>
            {summary.conflictRate}
          </div>
        </div>

        <div style={{
          background: 'rgba(16, 185, 129, 0.05)',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid rgba(16, 185, 129, 0.1)',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Resolution Rate
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#10b981' }}>
            {summary.resolutionRate}
          </div>
        </div>

        <div style={{
          background: 'rgba(245, 158, 11, 0.05)',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid rgba(245, 158, 11, 0.1)',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Avg Resolution Time
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f59e0b' }}>
            {summary.averageResolutionTime}
          </div>
        </div>

        <div style={{
          background: 'rgba(139, 92, 246, 0.05)',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid rgba(139, 92, 246, 0.1)',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Favorite Strategy
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#8b5cf6' }}>
            {summary.favoriteStrategy}
          </div>
        </div>
      </div>

      {/* Detailed Stats */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.02)',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '1rem',
      }}>
        <div style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '0.75rem',
        }}>
          Detailed Statistics
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>Total Conflicts Detected:</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{metrics.totalDetected}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>- Completions:</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{metrics.detectedByEntityType.completion}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>- Arrangements:</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{metrics.detectedByEntityType.arrangement}</span>
          </div>

          <div style={{ borderTop: '1px solid rgba(0, 0, 0, 0.1)', margin: '0.5rem 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>Total Resolved:</span>
            <span style={{ fontWeight: 600, color: '#10b981' }}>{metrics.totalResolved}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>- Keep Local:</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{metrics.resolvedByStrategy['keep-local']}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>- Use Remote:</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{metrics.resolvedByStrategy['use-remote']}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>- Manual Merge:</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{metrics.resolvedByStrategy['manual']}</span>
          </div>

          <div style={{ borderTop: '1px solid rgba(0, 0, 0, 0.1)', margin: '0.5rem 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: '#6b7280' }}>Total Dismissed:</span>
            <span style={{ fontWeight: 600, color: '#ef4444' }}>{metrics.totalDismissed}</span>
          </div>
        </div>
      </div>

      {/* Reset Button */}
      <button
        onClick={handleReset}
        style={{
          width: '100%',
          padding: '0.75rem',
          background: 'white',
          color: '#ef4444',
          border: '1.5px solid #ef4444',
          borderRadius: '8px',
          fontWeight: 500,
          fontSize: '0.875rem',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        Reset All Metrics
      </button>

      {/* Last Updated */}
      <div style={{
        marginTop: '1rem',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: '#9ca3af',
      }}>
        Last updated: {new Date(metrics.updatedAt).toLocaleString()}
      </div>
    </div>
  );
};
