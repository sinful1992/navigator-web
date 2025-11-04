// src/components/ConflictResolutionModal.tsx
// PHASE 3: Conflict Resolution UI Component (UI Layer)
// Clean Architecture: UI layer presents conflicts and captures user choice

import React, { useState } from 'react';
import type { VersionConflict } from '../types';
import { ConflictResolutionService } from '../services/ConflictResolutionService';

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

  // Domain Service: Get conflict summary (business logic in service layer)
  const summary = ConflictResolutionService.getConflictSummary(conflict);

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
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
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
            borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05) 0%, rgba(220, 38, 38, 0.08) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.75rem' }}>⚠️</span>
            <h2 style={{ margin: 0, fontSize: '1.375rem', fontWeight: 700, color: '#dc2626' }}>
              Version Conflict Detected
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
            Changes to this {summary.entityType} were made on multiple devices simultaneously
          </p>
        </div>

        {/* Conflict Details */}
        <div style={{ padding: '1.5rem' }}>
          {/* Entity Info */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.05)',
            padding: '1rem',
            borderRadius: '10px',
            marginBottom: '1.5rem',
            border: '1.5px solid rgba(99, 102, 241, 0.15)',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6366f1', marginBottom: '0.375rem' }}>
              {summary.entityType === 'completion' ? 'COMPLETION' : 'ARRANGEMENT'}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#111827' }}>
              {summary.entityDisplay}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Conflict detected at {new Date(summary.timestamp).toLocaleString()}
            </div>
          </div>

          {/* Version Comparison */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#374151', marginBottom: '1rem' }}>
              Choose which version to keep:
            </h3>

            {/* Local Version Option */}
            <div
              onClick={() => setSelectedResolution('local')}
              style={{
                background: selectedResolution === 'local'
                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%)'
                  : 'white',
                border: `2px solid ${selectedResolution === 'local' ? '#6366f1' : 'rgba(0, 0, 0, 0.1)'}`,
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
                  border: `2px solid ${selectedResolution === 'local' ? '#6366f1' : '#d1d5db'}`,
                  background: selectedResolution === 'local' ? '#6366f1' : 'white',
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
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827', marginBottom: '0.5rem' }}>
                    Keep My Changes (This Device)
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Current version {conflict.currentVersion}
                  </div>
                  {summary.localChanges.length > 0 && (
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      padding: '0.625rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                    }}>
                      {summary.localChanges.map((change, idx) => (
                        <div key={idx} style={{ fontSize: '0.8125rem', color: '#059669', fontFamily: 'monospace' }}>
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
                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.08) 100%)'
                  : 'white',
                border: `2px solid ${selectedResolution === 'remote' ? '#6366f1' : 'rgba(0, 0, 0, 0.1)'}`,
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
                  border: `2px solid ${selectedResolution === 'remote' ? '#6366f1' : '#d1d5db'}`,
                  background: selectedResolution === 'remote' ? '#6366f1' : 'white',
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
                  <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827', marginBottom: '0.5rem' }}>
                    Use Remote Changes (Other Device)
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Expected version {conflict.expectedVersion}
                  </div>
                  {summary.remoteChanges.length > 0 && (
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      padding: '0.625rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(245, 158, 11, 0.2)',
                    }}>
                      {summary.remoteChanges.map((change, idx) => (
                        <div key={idx} style={{ fontSize: '0.8125rem', color: '#d97706', fontFamily: 'monospace' }}>
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
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1.5px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '10px',
            padding: '0.875rem',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>⚠️</span>
              <div style={{ fontSize: '0.8125rem', color: '#dc2626', lineHeight: 1.5 }}>
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
                  ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                  : '#e5e7eb',
                color: selectedResolution ? 'white' : '#9ca3af',
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
                background: 'white',
                color: '#6b7280',
                border: '1.5px solid rgba(0, 0, 0, 0.1)',
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
