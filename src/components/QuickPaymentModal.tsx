import React from 'react';
import type { Arrangement } from '../types';
import { LoadingButton } from './LoadingButton';

type Props = {
  arrangement: Arrangement;
  onConfirm: (amount: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
};

export function QuickPaymentModal({ arrangement, onConfirm, onCancel, isLoading = false }: Props) {
  const [amount, setAmount] = React.useState(arrangement.amount || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }
    await onConfirm(amount);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div className="qp-overlay" onClick={handleOverlayClick}>
      <div className="qp-modal">
        <form onSubmit={handleSubmit}>
          <div className="qp-header">
            <h3>💰 Record Payment</h3>
            <button
              type="button"
              className="qp-close"
              onClick={onCancel}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="qp-body">
            {/* Context Info */}
            <div className="qp-info-box">
              <div className="qp-info-title">📍 Payment For</div>
              <div className="qp-info-content">
                <div><strong>Address:</strong> {arrangement.address}</div>
                {arrangement.customerName && (
                  <div><strong>Customer:</strong> {arrangement.customerName}</div>
                )}
                {arrangement.amount && (
                  <div><strong>Expected:</strong> £{arrangement.amount}</div>
                )}
                {arrangement.recurrenceType && arrangement.recurrenceType !== 'none' && (
                  <div>
                    <strong>Payment:</strong> {(arrangement.paymentsMade || 0) + 1} of {arrangement.totalPayments || 1}{' '}
                    ({arrangement.recurrenceType === 'weekly' ? 'Weekly' :
                      arrangement.recurrenceType === 'biweekly' ? 'Bi-weekly' :
                      arrangement.recurrenceType === 'monthly' ? 'Monthly' : arrangement.recurrenceType})
                  </div>
                )}
              </div>
            </div>

            {/* Amount Input */}
            <div className="qp-form-group">
              <label className="qp-label">Payment Amount *</label>
              <div className="qp-amount-wrapper">
                <span className="qp-amount-symbol">£</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="qp-input qp-amount-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>
            </div>
          </div>

          <div className="qp-actions">
            <button type="button" className="qp-btn qp-btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <LoadingButton
              type="submit"
              className="qp-btn qp-btn-success"
              isLoading={isLoading}
              loadingText="Recording..."
            >
              ✅ Record Payment
            </LoadingButton>
          </div>
        </form>
      </div>

      <style>{`
        .qp-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 5000;
          animation: qpFadeIn 0.2s ease;
        }

        @keyframes qpFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .qp-modal {
          background: var(--card-bg, white);
          border-radius: 16px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
          width: 100%;
          max-width: 500px;
          animation: qpSlideUp 0.3s ease;
        }

        @keyframes qpSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .qp-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border, #e5e7eb);
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border-radius: 16px 16px 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .qp-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #065f46;
        }

        .qp-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          color: #6b7280;
          line-height: 1;
        }

        .qp-close:hover {
          background: rgba(0,0,0,0.1);
        }

        .qp-body {
          padding: 1.5rem;
        }

        .qp-info-box {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.25rem;
        }

        .qp-info-title {
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .qp-info-content {
          font-size: 0.875rem;
          color: #1e40af;
          line-height: 1.6;
        }

        .qp-info-content div {
          margin-bottom: 0.25rem;
        }

        .qp-info-content div:last-child {
          margin-bottom: 0;
        }

        .qp-form-group {
          margin-bottom: 1.25rem;
        }

        .qp-form-group:last-child {
          margin-bottom: 0;
        }

        .qp-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary, #374151);
          margin-bottom: 0.5rem;
        }

        .qp-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid var(--border, #e5e7eb);
          border-radius: 8px;
          font-size: 1rem;
          background: var(--input-bg, white);
          color: var(--text-primary, #1f2937);
          transition: border-color 0.2s ease;
        }

        .qp-input:focus {
          outline: none;
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        .qp-textarea {
          resize: vertical;
          font-family: inherit;
        }

        .qp-amount-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .qp-amount-symbol {
          position: absolute;
          left: 1rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: #10b981;
          pointer-events: none;
        }

        .qp-amount-input {
          padding-left: 2.5rem !important;
          font-size: 1.5rem;
          font-weight: 700;
          color: #059669;
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border-color: #86efac;
        }

        .qp-amount-input:focus {
          background: var(--input-bg, white);
          border-color: #10b981;
        }

        .qp-actions {
          display: flex;
          gap: 0.75rem;
          padding: 1.5rem;
          border-top: 1px solid var(--border, #e5e7eb);
          background: var(--gray-50, #f9fafb);
          border-radius: 0 0 16px 16px;
        }

        .qp-btn {
          flex: 1;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 1rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .qp-btn-ghost {
          background: white;
          border: 2px solid var(--border, #e5e7eb);
          color: var(--text-primary, #1f2937);
        }

        .qp-btn-ghost:hover {
          background: var(--gray-100, #f3f4f6);
        }

        .qp-btn-success {
          background: #10b981;
          color: white;
        }

        .qp-btn-success:hover {
          background: #059669;
        }

        .qp-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* Dark mode */
        .dark-mode .qp-modal {
          background: var(--gray-100);
        }

        .dark-mode .qp-header {
          background: linear-gradient(135deg, #065f46 0%, #047857 100%);
          border-color: var(--gray-300);
        }

        .dark-mode .qp-header h3 {
          color: white;
        }

        .dark-mode .qp-close {
          color: white;
        }

        .dark-mode .qp-close:hover {
          background: rgba(255,255,255,0.1);
        }

        .dark-mode .qp-info-box {
          background: var(--blue-900, #1e3a8a);
          border-color: var(--blue-700, #1d4ed8);
        }

        .dark-mode .qp-info-title {
          color: var(--blue-200, #bfdbfe);
        }

        .dark-mode .qp-info-content {
          color: var(--blue-200, #bfdbfe);
        }

        .dark-mode .qp-input {
          background: var(--gray-200);
          border-color: var(--gray-400);
          color: var(--gray-900);
        }

        .dark-mode .qp-amount-input {
          background: linear-gradient(135deg, #065f46 0%, #047857 100%);
          color: white;
        }

        .dark-mode .qp-amount-symbol {
          color: white;
        }

        .dark-mode .qp-actions {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        @media (max-width: 640px) {
          .qp-modal {
            margin: 0.5rem;
          }

          .qp-actions {
            flex-direction: column;
          }

          .qp-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
