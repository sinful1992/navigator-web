// src/components/AccountSettings/ChangeEmailModal.tsx
import { useModalContext } from '../ModalProvider';
import { supabase } from '../../lib/supabaseClient';

export interface ChangeEmailModalProps {
  open: boolean;
  onClose: () => void;
  userEmail?: string;
}

export function ChangeEmailModal({ open, onClose, userEmail }: ChangeEmailModalProps) {
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
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>Change Email</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Update your account email address
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
          const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
          const newEmail = (form.elements.namedItem('newEmail') as HTMLInputElement).value;

          // Verify current password first
          if (!currentPassword) {
            await alert({
              title: 'Password Required',
              message: 'Please enter your current password to continue.',
              type: 'error'
            });
            return;
          }

          // Verify current password by attempting to sign in
          if (userEmail && supabase) {
            const { error: verifyError } = await supabase.auth.signInWithPassword({
              email: userEmail,
              password: currentPassword
            });

            if (verifyError) {
              await alert({
                title: 'Incorrect Password',
                message: 'The password you entered is incorrect.',
                type: 'error'
              });
              return;
            }
          }

          try {
            if (!supabase) throw new Error('Supabase not configured');
            const { error } = await supabase.auth.updateUser({ email: newEmail });
            if (error) throw error;

            await alert({
              title: 'Confirmation Email Sent',
              message: 'Please check your inbox and click the confirmation link to complete the email change.',
              type: 'success'
            });
            onClose();
          } catch (err: unknown) {
            await alert({
              title: 'Update Failed',
              message: (err as Error).message || 'Failed to update email. Please try again.',
              type: 'error'
            });
          }
        }}>
          {/* Current Password */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.9375rem',
              color: 'var(--text-primary)'
            }}>
              Current Password
            </label>
            <input
              type="password"
              name="currentPassword"
              className="input"
              required
              placeholder="Enter your password"
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
              Required for security verification
            </p>
          </div>

          {/* New Email */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.9375rem',
              color: 'var(--text-primary)'
            }}>
              New Email Address
            </label>
            <input
              type="email"
              name="newEmail"
              className="input"
              required
              placeholder="Enter new email address"
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
              You'll need to confirm your new email address
            </p>
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
              Update Email
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
