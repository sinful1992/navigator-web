// src/components/AccountSettings/ChangeEmailModal.tsx
import { supabase } from '../../lib/supabaseClient';

export interface ChangeEmailModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangeEmailModal({ open, onClose }: ChangeEmailModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '1rem' }}>Change Email</h2>
        <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Note: You'll need to confirm your new email address.
        </p>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const newEmail = (form.elements.namedItem('newEmail') as HTMLInputElement).value;

          try {
            if (!supabase) throw new Error('Supabase not configured');
            const { error } = await supabase.auth.updateUser({ email: newEmail });
            if (error) throw error;
            window.alert('Confirmation email sent! Please check your inbox.');
            onClose();
          } catch (err: any) {
            window.alert('Error: ' + err.message);
          }
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>New Email</label>
            <input type="email" name="newEmail" className="input" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Update Email</button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
