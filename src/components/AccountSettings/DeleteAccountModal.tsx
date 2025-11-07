// src/components/AccountSettings/DeleteAccountModal.tsx
import { supabase } from '../../lib/supabaseClient';

export interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteAccountModal({ open, onClose, onConfirm }: DeleteAccountModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--danger)' }}>Delete Account</h2>
        <p style={{ marginBottom: '1rem' }}>
          ⚠️ This action cannot be undone. All your data will be permanently deleted.
        </p>
        <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Type <strong>DELETE</strong> to confirm:
        </p>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const confirmation = (form.elements.namedItem('confirmation') as HTMLInputElement).value;

          if (confirmation !== 'DELETE') {
            window.alert('Please type DELETE to confirm');
            return;
          }

          try {
            if (!supabase) throw new Error('Supabase not configured');

            // Delete user account
            const { error } = await supabase.rpc('delete_user_account');
            if (error) throw error;

            await onConfirm();
            window.alert('Account deleted successfully');
            onClose();
          } catch (err: unknown) {
            window.alert('Error: ' + (err as Error).message);
          }
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <input type="text" name="confirmation" className="input" required placeholder="Type DELETE" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn" style={{ flex: 1, background: 'var(--danger)', color: 'white' }}>Delete Account</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
