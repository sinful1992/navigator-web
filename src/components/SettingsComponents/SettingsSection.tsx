// src/components/SettingsComponents/SettingsSection.tsx
// Reusable collapsible section component

import React from 'react';

export interface SettingsSectionProps {
  title: string;
  icon: string;
  sectionKey: string;
  isExpanded: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}

/**
 * SettingsSection - Collapsible section with icon, title, and chevron
 * Used for grouping related settings (General, Data & Backup, Route Planning, etc.)
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  icon,
  sectionKey,
  isExpanded,
  onToggle,
  children
}) => (
  <div className="modern-settings-section-container">
    <button
      type="button"
      className="modern-section-header"
      onClick={() => onToggle(sectionKey)}
      aria-expanded={isExpanded}
      aria-label={`${title} settings section`}
    >
      <div className="modern-section-title-area">
        <span className="modern-section-icon">{icon}</span>
        <span className="modern-section-title">{title}</span>
      </div>
      <span className={`modern-section-chevron ${isExpanded ? 'expanded' : ''}`}>
        ›
      </span>
    </button>

    <div className={`modern-section-content ${isExpanded ? 'expanded' : ''}`}>
      <div className="modern-section-inner">
        {children}
      </div>
    </div>
  </div>
);

SettingsSection.displayName = 'SettingsSection';
