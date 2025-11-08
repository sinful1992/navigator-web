// src/components/ConflictResolutionModal.tsx
// PHASE 3: Conflict Resolution UI Component (UI Layer)
// Clean Architecture: UI layer presents conflicts and captures user choice

import React, { useState } from 'react';
import type { VersionConflict } from '../types';
import { ConflictResolutionService } from '../services/ConflictResolutionService';
import { useSettings } from '../hooks/useSettings';

export interface ConflictResolutionModalProps {
  conflict: VersionConflict;
  onResolveKeepLocal: () => void;
  onResolveUseRemote: () => void;
  onDismiss: () => void;
  onClose: () => void;
}

/**
 * ConflictResolutionModal - UI Layer Component
 *
 * Responsibilities (Clean Architecture - UI Layer):
 * - Display conflict information
 * - Capture user resolution choice
 * - NO business logic (delegates to service for summaries)
 * - NO state management (receives callbacks from parent)
 *
 * Why UI Layer?
 * - Pure presentation
 * - React-specific rendering
 * - User interaction only
 * - No business rules
 */
export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflict,
  onResolveKeepLocal,
  onResolveUseRemote,
  onDismiss,
  onClose,
}) => {
  const [selectedResolution, setSelectedResolution] = useState<'local' | 'remote' | null>(null);
  const { settings } = useSettings();
  const isDark = settings.darkMode;

  // Domain Service: Get conflict summary (business logic in service layer)
  const summary = ConflictResolutionService.getConflictSummary(conflict);

  // Theme colors based on dark mode
  const theme = {
    background: isDark ? '#1f2937' : 'white',
    surface: isDark ? '#374151' : 'white',
    surfaceHover: isDark ? '#4b5563' : 'rgba(99, 102, 241, 0.05)',
    textPrimary: isDark ? '#f9fafb' : '#111827',
    textSecondary: isDark ? '#d1d5db' : '#6b7280',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    border: isDark ? '#4b5563' : 'rgba(0, 0, 0, 0.1)',
    borderLight: isDark ? '#374151' : 'rgba(0, 0, 0, 0.1)',
    borderSelected: isDark ? '#818cf8' : '#6366f1',
    overlay: isDark ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)',
    headerBg: isDark
      ? 'linear-gradient(135deg, rgba(185, 28, 28, 0.2) 0%, rgba(153, 27, 27, 0.3) 100%)'
      : 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.08) 100%)',
    headerBorder: isDark ? '#4b5563' : 'rgba(0, 0, 0, 0.1)',
    cardBg: isDark ? '#4b5563' : 'rgba(99, 102, 241, 0.05)',
    cardBorder: isDark ? '#6b7280' : 'rgba(99, 102, 241, 0.15)',
    localChangeBg: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)',
    localChangeBorder: isDark ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.2)',
    localChangeText: isDark ? '#6ee7b7' : '#059669',
    remoteChangeBg: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.08)',
    remoteChangeBorder: isDark ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.2)',
    remoteChangeText: isDark ? '#fcd34d' : '#d97706',
    warningBg: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.05)',
    warningBorder: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
    warningText: isDark ? '#fca5a5' : '#dc2626',
    selectedBg: isDark
      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.15) 100%)'
      : 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%)',
    buttonPrimary: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    buttonDisabled: isDark ? '#4b5563' : '#e5e7eb',
    buttonDisabledText: isDark ? '#6b7280' : '#9ca3af',
    buttonSecondary: isDark ? '#374151' : 'white',
    buttonSecondaryText: isDark ? '#d1d5db' : '#6b7280',
    buttonSecondaryBorder: isDark ? '#4b5563' : 'rgba(0, 0, 0, 0.1)',
  };

  const handleResolve = () => {
    if (selectedResolution === 'local') {
      onResolveKeepLocal();
    } else if (selectedResolution === 'remote') {
      onResolveUseRemote();
    }
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: theme.overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: theme.background,
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.2)',
          maxWidth: '600px',
          width: 'calc(100% - 2rem)',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: `1px solid ${theme.headerBorder}`,
            background: theme.headerBg,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.75rem' }}>⚠️</span>
            <h2 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 700, color: theme.warningText }}>
              Version Conflict Detected
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: theme.textSecondary }}>
            Changes to this {summary.entityType} were made on multiple devices simultaneously
          </p>
        </div>

        {/* Conflict Details */}
        <div style={{ padding: '1.5rem' }}>
          {/* Entity Info */}
          <div style={{
            background: theme.cardBg,
            padding: '1rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            border: `1.5px solid ${theme.cardBorder}`,
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6366f1', marginBottom: '0.375rem' }}>
              {summary.entityType === 'completion' ? 'COMPLETION' : 'ARRANGEMENT'}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: theme.textPrimary }}>
              {summary.entityDisplay}
            </div>
            <div style={{ fontSize: '0.8125rem', color: theme.textSecondary, marginTop: '0.25rem' }}>
              Conflict detected at {new Date(summary.timestamp).toLocaleString()}
            </div>
          </div>

          {/* Version Comparison */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: theme.textPrimary, marginBottom: '1rem' }}>
              Choose which version to keep:
            </h3>

            {/* Local Version Option */}
            <div
              onClick={() => setSelectedResolution('local')}
              style={{
                background: selectedResolution === 'local'
                  ? theme.selectedBg
                  : theme.surface,
                border: `2px solid ${selectedResolution === 'local' ? theme.borderSelected : theme.border}`,
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: `2px solid ${selectedResolution === 'local' ? theme.borderSelected : theme.border}`,
                  background: selectedResolution === 'local' ? theme.borderSelected : theme.surface,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '0.125rem',
                }}>
                  {selectedResolution === 'local' && (
                    <span style={{ color: 'white', fontSize: '0.75rem' }}>✓</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: theme.textPrimary, marginBottom: '0.5rem' }}>
                    Keep My Changes (This Device)
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: theme.textSecondary, marginBottom: '0.5rem' }}>
                    Current version {conflict.currentVersion}
                  </div>
                  {summary.localChanges.length > 0 && (
                    <div style={{
                      background: theme.localChangeBg,
                      padding: '0.625rem',
                      borderRadius: '6px',
                      border: `1px solid ${theme.localChangeBorder}`,
                    }}>
                      {summary.localChanges.map((change, idx) => (
                        <div key={idx} style={{ fontSize: '0.8125rem', color: theme.localChangeText, fontFamily: 'monospace' }}>
                          {change}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Remote Version Option */}
            <div
              onClick={() => setSelectedResolution('remote')}
              style={{
                background: selectedResolution === 'remote'
                  ? theme.selectedBg
                  : theme.surface,
                border: `2px solid ${selectedResolution === 'remote' ? theme.borderSelected : theme.border}`,
                borderRadius: '10px',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  border: `2px solid ${selectedResolution === 'remote' ? theme.borderSelected : theme.border}`,
                  background: selectedResolution === 'remote' ? theme.borderSelected : theme.surface,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '0.125rem',
                }}>
                  {selectedResolution === 'remote' && (
                    <span style={{ color: 'white', fontSize: '0.75rem' }}>✓</span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: theme.textPrimary, marginBottom: '0.5rem' }}>
                    Use Remote Changes (Other Device)
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: theme.textSecondary, marginBottom: '0.5rem' }}>
                    Expected version {conflict.expectedVersion}
                  </div>
                  {summary.remoteChanges.length > 0 && (
                    <div style={{
                      background: theme.remoteChangeBg,
                      padding: '0.625rem',
                      borderRadius: '6px',
                      border: `1px solid ${theme.remoteChangeBorder}`,
                    }}>
                      {summary.remoteChanges.map((change, idx) => (
                        <div key={idx} style={{ fontSize: '0.8125rem', color: theme.remoteChangeText, fontFamily: 'monospace' }}>
                          {change}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div style={{
            background: theme.warningBg,
            border: `1.5px solid ${theme.warningBorder}`,
            borderRadius: '10px',
            padding: '0.875rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>⚠️</span>
              <div style={{ fontSize: '0.8125rem', color: theme.warningText, lineHeight: 1.5 }}>
                <strong>Warning:</strong> The version you don't choose will be permanently discarded. Make sure you select the correct changes before proceeding.
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleResolve}
              disabled={!selectedResolution}
              style={{
                flex: 1,
                padding: '0.875rem',
                background: selectedResolution
                  ? theme.buttonPrimary
                  : theme.buttonDisabled,
                color: selectedResolution ? 'white' : theme.buttonDisabledText,
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: selectedResolution ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
              }}
            >
              Resolve Conflict
            </button>
            <button
              onClick={() => {
                onDismiss();
                onClose();
              }}
              style={{
                padding: '0.875rem 1.25rem',
                background: theme.buttonSecondary,
                color: theme.buttonSecondaryText,
                border: `1.5px solid ${theme.buttonSecondaryBorder}`,
                borderRadius: '10px',
                fontWeight: 500,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
