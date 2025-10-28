// src/components/SettingsComponents/ConfirmModal.tsx
// Simple confirmation modal component

import React from 'react';

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDanger?: boolean;
}

/**
 * ConfirmModal - Simple confirmation dialog
 * Used for confirmation of destructive or important actions
 * Can be styled as danger (red) or normal (blue)
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDanger = false
}) => (
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
      zIndex: 1000000,
      animation: 'fadeIn 0.2s ease-out'
    }}
  >
    <div
      style={{
        background: 'white',
        borderRadius: '12px',
        padding: '1.5rem',
        maxWidth: '400px',
        width: 'calc(100% - 2rem)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      <h2
        style={{
          margin: '0 0 0.5rem 0',
          fontSize: '1.25rem',
          fontWeight: '700',
          color: '#111827'
        }}
      >
        {title}
      </h2>
      <p
        style={{
          margin: '0 0 1.5rem 0',
          fontSize: '0.875rem',
          color: '#6b7280',
          lineHeight: '1.5'
        }}
      >
        {message}
      </p>
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end'
        }}
      >
        <button
          onClick={onCancel}
          style={{
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#374151',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#e5e7eb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#f3f4f6';
          }}
        >
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          style={{
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            background: isDanger ? '#dc2626' : '#6366f1',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'white',
            fontWeight: '500',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          {confirmText}
        </button>
      </div>
    </div>

    <style>{`
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(16px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `}</style>
  </div>
);

ConfirmModal.displayName = 'ConfirmModal';
