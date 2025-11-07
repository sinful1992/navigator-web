// src/components/SettingsComponents/SettingsActionButton.tsx
// Reusable action button component with variants

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'accent' | 'small';

export interface SettingsActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string;
  text: string;
  variant?: ButtonVariant | ButtonVariant[];
  onClick: () => void;
}

/**
 * SettingsActionButton - Reusable action button with icon and text
 * Supports multiple variants: primary, secondary, danger, accent, small
 * Can be combined (e.g., ['primary', 'small'])
 */
export const SettingsActionButton: React.FC<SettingsActionButtonProps> = ({
  icon,
  text,
  variant = 'secondary',
  onClick,
  disabled = false,
  ...props
}) => {
  const variants = Array.isArray(variant) ? variant : [variant];
  const classNames = ['modern-action-button', ...variants].join(' ');

  return (
    <button
      type="button"
      className={classNames}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="modern-button-icon">{icon}</span>}
      <span className="modern-button-text">{text}</span>
    </button>
  );
};

SettingsActionButton.displayName = 'SettingsActionButton';
