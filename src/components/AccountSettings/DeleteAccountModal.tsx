// src/components/AccountSettings/DeleteAccountModal.tsx
import { useModalContext } from '../ModalProvider';
import { supabase } from '../../lib/supabaseClient';

export interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  userEmail?: string;
}

export function DeleteAccountModal({ open, onClose, onConfirm, userEmail }: DeleteAccountModalProps) {
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
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--danger, #dc3545)' }}>Delete Account</h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Permanently delete your account
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

        {/* Warning Banner */}
        <div style={{
          padding: '1rem',
          backgroundColor: 'var(--danger-bg, #f8d7da)',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          border: '1px solid var(--danger-border, #f5c6cb)'
        }}>
          <p style={{
            margin: 0,
            color: 'var(--danger-text, #721c24)',
            fontWeight: 500
          }}>
            This action cannot be undone. All your data will be permanently deleted, including:
          </p>
          <ul style={{
            margin: '0.75rem 0 0 0',
            paddingLeft: '1.25rem',
            color: 'var(--danger-text, #721c24)',
            fontSize: '0.875rem'
          }}>
            <li>All addresses and completions</li>
            <li>Arrangements and payment history</li>
            <li>Earnings and session data</li>
            <li>Account settings and preferences</li>
          </ul>
        </div>

        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
          const confirmation = (form.elements.namedItem('confirmation') as HTMLInputElement).value;

          // Verify password first
          if (!currentPassword) {
            await alert({
              title: 'Password Required',
              message: 'Please enter your password to continue.',
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

          if (confirmation !== 'DELETE') {
            await alert({
              title: 'Confirmation Required',
              message: 'Please type DELETE to confirm account deletion.',
              type: 'error'
            });
            return;
          }

          try {
            if (!supabase) throw new Error('Supabase not configured');

            // Delete user account
            const { error } = await supabase.rpc('delete_user_account');
            if (error) throw error;

            await onConfirm();
            await alert({
              title: 'Account Deleted',
              message: 'Your account has been permanently deleted.',
              type: 'success'
            });
            onClose();
          } catch (err: unknown) {
            await alert({
              title: 'Deletion Failed',
              message: (err as Error).message || 'Failed to delete account. Please try again.',
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

          {/* Confirmation */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: 500,
              fontSize: '0.9375rem',
              color: 'var(--text-primary)'
            }}>
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              type="text"
              name="confirmation"
              className="input"
              required
              placeholder="Type DELETE"
              autoComplete="off"
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
              className="btn"
              style={{
                flex: 1,
                padding: '0.875rem',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'var(--danger, #dc3545)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Delete Account Permanently
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
