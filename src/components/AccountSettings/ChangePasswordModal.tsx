// src/components/AccountSettings/ChangePasswordModal.tsx
import * as React from 'react';
import { useModalContext } from '../ModalProvider';

export interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  onUpdatePassword: (newPassword: string) => Promise<void>;
}

export function ChangePasswordModal({ open, onClose, onUpdatePassword }: ChangePasswordModalProps) {
  const { alert } = useModalContext();

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--gray-200)'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>Change Password</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Update your account password
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0.25rem',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
          const confirmPassword = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value;

          if (newPassword !== confirmPassword) {
            await alert({
              title: 'Password Mismatch',
              message: 'The passwords you entered do not match. Please try again.',
              type: 'error'
            });
            return;
          }

          if (newPassword.length < 6) {
            await alert({
              title: 'Password Too Short',
              message: 'Password must be at least 6 characters long.',
              type: 'error'
            });
            return;
          }

          try {
            await onUpdatePassword(newPassword);
            onClose();
            await alert({
              title: 'Password Updated',
              message: 'Your password has been updated successfully!',
              type: 'success'
            });
          } catch (err: any) {
            await alert({
              title: 'Update Failed',
              message: err.message || 'Failed to update password. Please try again.',
              type: 'error'
            });
          }
        }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.9375rem',
              color: 'var(--text-primary)'
            }}>
              New Password
            </label>
            <input
              type="password"
              name="newPassword"
              className="input"
              required
              minLength={6}
              placeholder="Enter new password"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1.5px solid var(--gray-300)',
                fontSize: '1rem'
              }}
            />
            <p style={{
              margin: '0.5rem 0 0 0',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)'
            }}>
              Must be at least 6 characters
            </p>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.9375rem',
              color: 'var(--text-primary)'
            }}>
              Confirm Password
            </label>
            <input
              type="password"
              name="confirmPassword"
              className="input"
              required
              minLength={6}
              placeholder="Re-enter new password"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1.5px solid var(--gray-300)',
                fontSize: '1rem'
              }}
            />
          </div>

          <div style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--gray-200)'
          }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                flex: 1,
                padding: '0.875rem',
                fontSize: '1rem',
                fontWeight: 600
              }}
            >
              Update Password
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{
                padding: '0.875rem 1.5rem',
                fontSize: '1rem'
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
