// src/components/OwnershipPrompt.tsx
import * as React from 'react';
import { useModalContext } from './ModalProvider';
import { SmartUserDetection } from '../utils/userDetection';
import { logger } from '../utils/logger';
import type { AppState } from '../types';

export interface OwnershipPromptProps {
  isOpen: boolean;
  onClose: () => void;
  safeState: AppState;
  user: any;
  onKeepData: (state: AppState) => Promise<void>;
  onDiscardData: () => void;
}

/**
 * Data Ownership Resolution Prompt
 *
 * Displayed when local data is found but ownership is uncertain.
 * Allows user to:
 * - Keep and sync data to their account
 * - Discard local data and use cloud data
 * - Decide later
 */
export function OwnershipPrompt({
  isOpen,
  onClose,
  safeState,
  user,
  onKeepData,
  onDiscardData
}: OwnershipPromptProps) {
  const { alert, confirm } = useModalContext();

  if (!isOpen) return null;

  const handleKeep = async () => {
    // User confirmed ownership - sync to cloud
    localStorage.removeItem('navigator_ownership_uncertain');
    onClose();
    try {
      await onKeepData(safeState);
      SmartUserDetection.storeDeviceContext(user);
      await alert({
        title: "Success",
        message: "Your data has been synced to the cloud.",
        type: "success"
      });
    } catch (err) {
      logger.error("Failed to sync data:", err);
      await alert({
        title: "Sync Failed",
        message: "Failed to sync data to cloud. Please try again.",
        type: "error"
      });
    }
  };

  const handleDiscard = async () => {
    // User wants to discard local data
    const confirmed = await confirm({
      title: "Discard Local Data?",
      message: "This will permanently delete the local data and load your cloud data instead. This action cannot be undone.",
      confirmText: "Discard Local Data",
      cancelText: "Cancel",
      type: "warning"
    });

    if (confirmed) {
      localStorage.removeItem('navigator_ownership_uncertain');

      // Create safety backup before clearing
      try {
        const backupKey = `navigator_safety_backup_${Date.now()}_user_choice_discard`;
        localStorage.setItem(backupKey, JSON.stringify({
          ...safeState,
          _backup_timestamp: new Date().toISOString(),
          _backup_reason: 'user_chose_discard'
        }));
        logger.info(`Safety backup created: ${backupKey}`);
      } catch (err) {
        logger.warn("Failed to create safety backup:", err);
      }

      SmartUserDetection.storeDeviceContext(user);
      onDiscardData();
      onClose();

      await alert({
        title: "Data Cleared",
        message: "Local data has been cleared. Your cloud data will now load.",
        type: "success"
      });
    }
  };

  const handleLater = () => {
    // User wants to decide later - keep modal available
    onClose();
    alert({
      title: "Decision Deferred",
      message: "You can access this prompt again from Settings > Account > Resolve Data Ownership",
      type: "info"
    });
  };

  return (
    <>
      <div
        className="ownership-modal-backdrop"
        onClick={onClose}
      />
      <div className="ownership-modal-container">
        {/* Header with Warning Badge */}
        <div className="ownership-modal-header">
          <div className="ownership-warning-badge">
            <span className="ownership-warning-icon">⚠️</span>
          </div>
          <h2 className="ownership-modal-title">Data Ownership Unclear</h2>
          <p className="ownership-modal-subtitle">
            We found local data that may not belong to your current account
          </p>
        </div>

        {/* Content Body */}
        <div className="ownership-modal-body">
          {/* Current Account Card */}
          <div className="ownership-account-card">
            <div className="ownership-account-icon">👤</div>
            <div className="ownership-account-info">
              <div className="ownership-account-label">Currently logged in as</div>
              <div className="ownership-account-email">{user?.email || 'Unknown'}</div>
            </div>
          </div>

          {/* Data Summary Cards */}
          <div className="ownership-data-summary">
            <div className="ownership-summary-header">
              <span className="ownership-summary-icon">📊</span>
              <span className="ownership-summary-title">Local data found on this device</span>
            </div>
            <div className="ownership-stats-grid">
              <div className="ownership-stat-card">
                <div className="ownership-stat-icon">📍</div>
                <div className="ownership-stat-number">{safeState.addresses.length}</div>
                <div className="ownership-stat-label">Addresses</div>
              </div>
              <div className="ownership-stat-card">
                <div className="ownership-stat-icon">✅</div>
                <div className="ownership-stat-number">{safeState.completions.length}</div>
                <div className="ownership-stat-label">Completions</div>
              </div>
              <div className="ownership-stat-card">
                <div className="ownership-stat-icon">📅</div>
                <div className="ownership-stat-number">{safeState.arrangements.length}</div>
                <div className="ownership-stat-label">Arrangements</div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="ownership-info-section">
            <div className="ownership-info-title">This can happen when:</div>
            <ul className="ownership-info-list">
              <li>You're using a shared device</li>
              <li>Another user previously used this browser</li>
              <li>You're signing in from a different account</li>
            </ul>
          </div>

          {/* Question */}
          <div className="ownership-question">
            What would you like to do with this local data?
          </div>
        </div>

        {/* Action Buttons */}
        <div className="ownership-modal-actions">
          <button
            className="ownership-btn ownership-btn-keep"
            onClick={handleKeep}
          >
            <span className="ownership-btn-icon">✓</span>
            <span className="ownership-btn-text">
              <span className="ownership-btn-title">Keep & Sync to My Account</span>
              <span className="ownership-btn-desc">This data belongs to me</span>
            </span>
          </button>
          <button
            className="ownership-btn ownership-btn-discard"
            onClick={handleDiscard}
          >
            <span className="ownership-btn-icon">🗑️</span>
            <span className="ownership-btn-text">
              <span className="ownership-btn-title">Discard Local Data</span>
              <span className="ownership-btn-desc">Clear it and use cloud data</span>
            </span>
          </button>
          <button
            className="ownership-btn ownership-btn-later"
            onClick={handleLater}
          >
            <span className="ownership-btn-icon">⏱️</span>
            <span className="ownership-btn-text">
              <span className="ownership-btn-title">Decide Later</span>
              <span className="ownership-btn-desc">Access from Settings later</span>
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
