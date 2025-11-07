// src/components/SettingsComponents/StorageInfo.tsx
// Storage usage display component

import React from 'react';

export interface StorageInfoProps {
  usedMB: string;
  quotaMB: string;
  percentage: number;
}

/**
 * StorageInfo - Displays current storage usage with progress bar
 * Shows used/quota in MB and percentage indicator
 * Changes color to warning (red) when usage exceeds 80%
 */
export const StorageInfo: React.FC<StorageInfoProps> = ({
  usedMB,
  quotaMB,
  percentage
}) => (
  <div className="modern-storage-card">
    <div className="modern-storage-header">
      <span className="modern-storage-label">Storage Usage</span>
      <span className="modern-storage-value">
        {usedMB} / {quotaMB} MB
      </span>
    </div>
    <div className="modern-storage-bar">
      <div
        className={`modern-storage-fill ${percentage > 80 ? 'warning' : ''}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
    <div className="modern-storage-percent">{percentage}% used</div>
  </div>
);

StorageInfo.displayName = 'StorageInfo';
