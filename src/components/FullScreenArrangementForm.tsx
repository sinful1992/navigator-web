import React from 'react';
import type { Arrangement, ArrangementStatus } from '../types';
import { LoadingButton } from './LoadingButton';

type Props = {
  address: string;
  addressIndex: number;
  onSave: (
    arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onCancel: () => void;
};

export default function FullScreenArrangementForm({
  address,
  addressIndex,
  onSave,
  onCancel,
}: Props) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    customerName: '',
    phoneNumber: '',
    scheduledDate: new Date().toISOString().slice(0, 10),
    scheduledTime: '',
    amount: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = React.useState<{ amount?: string }>({});

  const amountInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    // Avoid auto-focus on touch devices to prevent mobile keyboard layout glitches
    const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!isCoarsePointer && amountInputRef.current) {
      setTimeout(() => amountInputRef.current?.focus(), 120);
    }
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  const normalizeAmount = (value: string) => value.replace(/,/g, '.').trim();
  const validateAmount = (value: string) => {
    const amt = parseFloat(normalizeAmount(value) || '0');
    if (!value || Number.isNaN(amt) || amt <= 0) {
      setFormErrors((p) => ({ ...p, amount: 'Please enter a valid payment amount' }));
      return false;
    }
    setFormErrors((p) => ({ ...p, amount: undefined }));
    return true;
  };

  const handleAmountChange = (value: string) => {
    setFormData((p) => ({ ...p, amount: value }));
    if (!value) {
      setFormErrors((p) => ({ ...p, amount: undefined }));
    } else {
      validateAmount(value);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateAmount(formData.amount)) {
      amountInputRef.current?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const data: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'> = {
        addressIndex,
        address,
        customerName: formData.customerName,
        phoneNumber: formData.phoneNumber,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
        amount: normalizeAmount(formData.amount),
        notes: formData.notes,
        status: 'Scheduled' as ArrangementStatus,
      };
      await onSave(data);
    } catch (err) {
      console.error('Error saving arrangement:', err);
      alert(
        `Failed to save arrangement: ${
          err instanceof Error ? err.message : 'Please try again.'
        }`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fsaf-overlay" role="dialog" aria-modal="true">
      <div className="fsaf-container">
        <header className="fsaf-header">
          <button
            type="button"
            className="fsaf-close"
            aria-label="Close"
            onClick={onCancel}
            title="Close (Esc)"
          >
            ✕
          </button>
          <div className="fsaf-header-text">
            <h2 className="fsaf-title">Create Payment Arrangement</h2>
            <div className="fsaf-subtitle">{address}</div>
          </div>
        </header>

        <form className="fsaf-body" onSubmit={handleSubmit}>
          <div className={`fsaf-amount ${formErrors.amount ? 'fsaf-amount-error' : ''}`}>
            <label className="fsaf-label">Payment Amount *</label>
            <input
              ref={amountInputRef}
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              value={formData.amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              onFocus={(e) => {
                try {
                  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
                    setTimeout(() => e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
                  }
                } catch {}
              }}
              className={`fsaf-input fsaf-input-amount ${formErrors.amount ? 'fsaf-input-error' : ''}`}
              placeholder="0.00"
              required
              aria-describedby={formErrors.amount ? 'amount-error' : undefined}
            />
            {formErrors.amount && (
              <div id="amount-error" className="fsaf-error" role="alert">
                {formErrors.amount}
              </div>
            )}
          </div>

          <div className="fsaf-row">
            <div className="fsaf-field">
              <label className="fsaf-label">Customer Name</label>
              <input
                type="text"
                value={formData.customerName}
                onChange={(e) => setFormData((p) => ({ ...p, customerName: e.target.value }))}
                className="fsaf-input"
                placeholder="Customer name"
              />
            </div>
            <div className="fsaf-field">
              <label className="fsaf-label">Phone Number</label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData((p) => ({ ...p, phoneNumber: e.target.value }))}
                className="fsaf-input"
                placeholder="Phone number"
              />
            </div>
          </div>

          <div className="fsaf-row">
            <div className="fsaf-field">
              <label className="fsaf-label">Payment Due Date *</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData((p) => ({ ...p, scheduledDate: e.target.value }))}
                className="fsaf-input"
                required
              />
            </div>
            <div className="fsaf-field">
              <label className="fsaf-label">Time</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData((p) => ({ ...p, scheduledTime: e.target.value }))}
                className="fsaf-input"
              />
            </div>
          </div>

          <div className="fsaf-field">
            <label className="fsaf-label">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
              className="fsaf-input fsaf-textarea"
              rows={4}
              placeholder="Payment terms, special instructions, etc..."
            />
          </div>

          <div className="fsaf-actions">
            <button type="button" className="fsaf-btn fsaf-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <LoadingButton
              type="submit"
              className="fsaf-btn fsaf-btn-primary"
              isLoading={isLoading}
              loadingText="Creating..."
              disabled={!!formErrors.amount}
            >
              Create Arrangement
            </LoadingButton>
          </div>
        </form>
      </div>

      <style>{`
        .fsaf-overlay {
          position: fixed;
          inset: 0;
          background: var(--surface, #ffffff);
          z-index: 4000;
          display: flex;
          flex-direction: column;
          color: var(--text-primary, #1e293b);
          height: 100vh; /* fallback */
          height: 100svh; /* better on mobile */
          min-height: 100vh;
          overscroll-behavior-y: contain;
          touch-action: manipulation;
          overflow: hidden;
        }
        .fsaf-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
        }
        .fsaf-header {
          position: sticky;
          top: 0;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) 0.75rem max(1rem, env(safe-area-inset-left));
          border-bottom: 1px solid var(--border-light, #e2e8f0);
          background: var(--surface, #ffffff);
        }
        .fsaf-close {
          background: none;
          border: none;
          font-size: 1.25rem;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-muted, #64748b);
        }
        .fsaf-close:hover { background: var(--bg-secondary, #f1f5f9); }
        .fsaf-header-text { display: flex; flex-direction: column; gap: 0.25rem; }
        .fsaf-title { margin: 0; font-size: 1.25rem; font-weight: 600; }
        .fsaf-subtitle { font-size: 0.875rem; color: var(--text-secondary, #64748b); }

        .fsaf-body {
          display: grid;
          gap: 1rem;
          padding: 1rem;
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          flex: 1 1 auto;
          min-height: 0; /* allow proper scroll within flex container */
        }
        .fsaf-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .fsaf-field { display: flex; flex-direction: column; gap: 0.5rem; }
        .fsaf-label { font-size: 0.875rem; font-weight: 500; color: var(--text-secondary, #64748b); }
        .fsaf-input { border: 1px solid var(--border-light, #e2e8f0); border-radius: 8px; padding: 0.75rem; font: inherit; font-size: 16px; background: var(--surface, #fff); }
        .fsaf-textarea { resize: vertical; }

        .fsaf-amount { border: 2px solid var(--success, #16a34a); background: #dcfce7; border-radius: 12px; padding: 1rem; }
        .fsaf-amount-error { border-color: var(--danger, #dc2626); background: #fee2e2; }
        .fsaf-input-amount { font-size: 1.25rem; text-align: center; font-weight: 600; }
        .fsaf-input-error { border-color: var(--danger, #dc2626); }
        .fsaf-error { color: var(--danger, #dc2626); font-size: 0.8125rem; margin-top: 0.375rem; }

        .fsaf-actions { display: flex; gap: 0.75rem; justify-content: flex-end; padding-top: 0.5rem; }
        .fsaf-btn { border-radius: 10px; min-height: 44px; padding: 0.75rem 1rem; font-weight: 600; border: 1px solid transparent; }
        .fsaf-btn-ghost { background: transparent; border-color: var(--border-light, #e2e8f0); }
        .fsaf-btn-ghost:hover { background: var(--bg-secondary, #f1f5f9); }
        .fsaf-btn-primary { background: #0ea5e9; color: white; }
        .fsaf-btn-primary:hover { filter: brightness(0.95); }

        @media (max-width: 768px) {
          .fsaf-row { grid-template-columns: 1fr; }
          .fsaf-title { font-size: 1.125rem; }
        }
      `}</style>
    </div>
  );
}
