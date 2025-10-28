// src/components/SettingsComponents/SubsectionTitle.tsx
// Subsection title component for grouping related items

import React from 'react';

export interface SubsectionTitleProps {
  children: React.ReactNode;
  isDanger?: boolean;
}

/**
 * SubsectionTitle - Small uppercase title for grouping related settings
 * Used to organize items within a section (e.g., "Import & Export", "Backup Management")
 */
export const SubsectionTitle: React.FC<SubsectionTitleProps> = ({
  children,
  isDanger = false
}) => (
  <div
    className={`modern-subsection-title ${isDanger ? 'danger' : ''}`}
  >
    {children}
  </div>
);

SubsectionTitle.displayName = 'SubsectionTitle';
