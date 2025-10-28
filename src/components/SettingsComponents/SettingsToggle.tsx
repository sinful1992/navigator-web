// src/components/SettingsComponents/SettingsToggle.tsx
// Reusable toggle switch component for settings

import React from 'react';

export interface SettingsToggleProps {
  id: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}

/**
 * SettingsToggle - Reusable toggle switch with label and description
 * Used throughout the settings dropdown for boolean settings
 */
export const SettingsToggle: React.FC<SettingsToggleProps> = ({
  id,
  checked,
  onChange,
  label,
  description
}) => (
  <div className="modern-setting-row">
    <div className="modern-setting-info">
      <div className="modern-setting-label">{label}</div>
      {description && <div className="modern-setting-desc">{description}</div>}
    </div>
    <div className="modern-toggle-switch" onClick={onChange}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        className="modern-toggle-input"
      />
      <div className={`modern-toggle-slider ${checked ? 'checked' : ''}`}>
        <div className="modern-toggle-thumb"></div>
      </div>
    </div>
  </div>
);

SettingsToggle.displayName = 'SettingsToggle';
