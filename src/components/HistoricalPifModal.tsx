// src/components/HistoricalPifModal.tsx
import React from 'react';
import { calculateEnforcementFee } from '../utils/bonusCalculator';

type Props = {
  onConfirm: (data: {
    date: string; // ISO date string (YYYY-MM-DD)
    address: string;
    amount: string;
    caseReference: string;
    numberOfCases: number;
    enforcementFees?: number[];
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
};

export function HistoricalPifModal({ onConfirm, onCancel, isLoading = false }: Props) {
  // Initialize with today's date
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = React.useState(today);
  const [address, setAddress] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [caseReference, setCaseReference] = React.useState('');
  const [numberOfCases, setNumberOfCases] = React.useState('1');
  const [enforcementFees, setEnforcementFees] = React.useState<string[]>(['']);

  // Auto-calculate enforcement fee for single case
  const calculatedSingleCaseFee = React.useMemo(() => {
    const numCases = Number(numberOfCases);
    const pifAmount = Number(amount);

    if (numCases !== 1 || !amount || !pifAmount || pifAmount <= 0) {
      return null;
    }

    const complianceFee = 75;
    const baseEnfFee = 235;

    // Reverse formula to get debt: debt = (pifAmount - compliance - baseEnf) / 1.075
    const debt = (pifAmount - complianceFee - baseEnfFee) / 1.075;

    if (debt <= 0) return null;

    // Use existing function to calculate enforcement fee
    const enfFee = calculateEnforcementFee(debt);

    return enfFee;
  }, [amount, numberOfCases]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const pifAmount = Number(amount);
    const numCases = Number(numberOfCases);
    const caseRefNum = Number(caseReference);

    // Validation
    if (!date) {
      alert("Please select a date");
      return;
    }

    if (!address || !address.trim()) {
      alert("Please enter an address or case identifier");
      return;
    }

    if (!amount || !Number.isFinite(pifAmount) || pifAmount <= 0) {
      alert("Please enter a valid PIF amount");
      return;
    }

    if (!caseReference || !caseReference.trim()) {
      alert("Please enter a case reference number");
      return;
    }

    if (!Number.isFinite(caseRefNum) || caseRefNum <= 0 || !Number.isInteger(caseRefNum)) {
      alert("Case reference must be a valid whole number");
      return;
    }

    if (!Number.isFinite(numCases) || numCases <= 0 || !Number.isInteger(numCases)) {
      alert("Number of cases must be a valid whole number");
      return;
    }

    // Handle enforcement fees based on number of cases
    let finalEnforcementFees: number[] | undefined;

    if (numCases === 1) {
      // Single case: use auto-calculated fee
      if (calculatedSingleCaseFee !== null) {
        finalEnforcementFees = [calculatedSingleCaseFee];
      }
    } else {
      // Multiple cases: parse user-entered fees
      const parsedFees = enforcementFees
        .filter(f => f && f.trim())
        .map(f => parseFloat(f));

      // Validate all enforcement fees are valid non-negative numbers
      if (parsedFees.some(f => !Number.isFinite(f) || f < 0)) {
        alert("All enforcement fees must be valid non-negative numbers");
        return;
      }

      finalEnforcementFees = parsedFees.length > 0 ? parsedFees : undefined;
    }

    onConfirm({
      date,
      address: address.trim(),
      amount: pifAmount.toFixed(2),
      caseReference: caseReference.trim(),
      numberOfCases: numCases,
      enforcementFees: finalEnforcementFees
    });
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return (
    <div className="historical-pif-modal-overlay" onClick={handleOverlayClick}>
      <div className="historical-pif-modal" onClick={(e) => e.stopPropagation()}>
        <div className="historical-pif-modal-header">
          <h3>📅 Record Historical PIF</h3>
          <button className="historical-pif-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="historical-pif-modal-body">
          {/* Date Picker */}
          <div className="historical-pif-form-group">
            <label htmlFor="historical-date">Payment Date *</label>
            <input
              id="historical-date"
              type="date"
              className="historical-pif-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={today}
              autoFocus
            />
            <small className="historical-pif-hint">
              Select the date when the payment was received
            </small>
          </div>

          {/* Address/Case Identifier */}
          <div className="historical-pif-form-group">
            <label htmlFor="historical-address">Address/Case Identifier *</label>
            <input
              id="historical-address"
              type="text"
              className="historical-pif-input"
              placeholder="e.g. 123 Main St or Case #12345"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="off"
            />
            <small className="historical-pif-hint">
              Enter an address or identifier for this payment
            </small>
          </div>

          {/* PIF Amount */}
          <div className="historical-pif-form-group">
            <label htmlFor="historical-amount">PIF Amount *</label>
            <div className="historical-pif-amount-wrapper">
              <span className="historical-pif-currency-symbol">£</span>
              <input
                id="historical-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="historical-pif-input historical-pif-amount-input"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Case Reference */}
          <div className="historical-pif-form-group">
            <label htmlFor="historical-case-ref">Case Reference Number *</label>
            <input
              id="historical-case-ref"
              type="number"
              inputMode="numeric"
              className="historical-pif-input"
              placeholder="e.g. 123456"
              value={caseReference}
              onChange={(e) => setCaseReference(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Number of Cases */}
          <div className="historical-pif-form-group">
            <label htmlFor="historical-num-cases">Number of Cases *</label>
            <input
              id="historical-num-cases"
              type="number"
              inputMode="numeric"
              className="historical-pif-input"
              placeholder="e.g. 1"
              min="1"
              value={numberOfCases}
              onChange={(e) => setNumberOfCases(e.target.value)}
              autoComplete="off"
            />
            <small className="historical-pif-hint">
              If 1 debtor has 3 linked cases, enter 3
            </small>
          </div>

          {/* Auto-calculated Enforcement Fee (Single Case) */}
          {Number(numberOfCases) === 1 && calculatedSingleCaseFee !== null && (
            <div className="historical-pif-info-box">
              <div className="historical-pif-info-title">✅ Enforcement Fee (Auto-calculated)</div>
              <div className="historical-pif-info-content">
                <strong>£{calculatedSingleCaseFee.toFixed(2)}</strong>
                <small style={{ display: 'block', marginTop: '0.25rem' }}>
                  Calculated automatically for single case based on debt amount
                </small>
              </div>
            </div>
          )}

          {/* Enforcement Fees (Multiple Cases) */}
          {Number(numberOfCases) > 1 && (
            <div className="historical-pif-form-group">
              <label>Enforcement Fees (Optional)</label>
              <small className="historical-pif-hint" style={{ marginBottom: '0.5rem', display: 'block' }}>
                Add enforcement fees for cases that have them. Linked cases without fees receive £10 bonus each.
              </small>

              {enforcementFees.map((fee, index) => (
                <div key={index} className="historical-pif-fee-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className="historical-pif-input"
                    placeholder="e.g. 272.50"
                    value={fee}
                    onChange={(e) => {
                      const newFees = [...enforcementFees];
                      newFees[index] = e.target.value;
                      setEnforcementFees(newFees);
                    }}
                    autoComplete="off"
                  />
                  {enforcementFees.length > 1 && (
                    <button
                      type="button"
                      className="historical-pif-btn historical-pif-btn-danger-sm"
                      onClick={() => {
                        const newFees = enforcementFees.filter((_, i) => i !== index);
                        setEnforcementFees(newFees);
                      }}
                      title="Remove this enforcement fee"
                    >
                      ➖
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="historical-pif-btn historical-pif-btn-secondary"
                onClick={() => setEnforcementFees([...enforcementFees, ""])}
              >
                ➕ Add Another Enf Fee
              </button>

              {numberOfCases && Number(numberOfCases) > 0 && (
                <div className="historical-pif-info-box" style={{ marginTop: '0.75rem' }}>
                  <small className="historical-pif-info-highlight">
                    ℹ️ {Math.max(0, Number(numberOfCases) - enforcementFees.filter(f => f && f.trim()).length)} linked case(s) (£10 bonus each)
                  </small>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="historical-pif-modal-footer">
          <button
            type="button"
            className="historical-pif-btn historical-pif-btn-ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="historical-pif-btn historical-pif-btn-success"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : '✅ Save PIF'}
          </button>
        </div>
      </div>

      <style>{`
        .historical-pif-modal-overlay {
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
          animation: historicalPifFadeIn 0.2s ease;
        }

        @keyframes historicalPifFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .historical-pif-modal {
          background: var(--card-bg, white);
          border-radius: 16px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
          width: 100%;
          max-width: 550px;
          max-height: 90vh;
          overflow-y: auto;
          animation: historicalPifSlideUp 0.3s ease;
        }

        @keyframes historicalPifSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .historical-pif-modal-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border, #e5e7eb);
          background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
          border-radius: 16px 16px 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .historical-pif-modal-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #1e40af;
        }

        .historical-pif-close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          color: #6b7280;
          line-height: 1;
        }

        .historical-pif-close-btn:hover {
          background: rgba(0,0,0,0.1);
        }

        .historical-pif-modal-body {
          padding: 1.5rem;
        }

        .historical-pif-form-group {
          margin-bottom: 1.25rem;
        }

        .historical-pif-form-group:last-child {
          margin-bottom: 0;
        }

        .historical-pif-form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary, #374151);
          margin-bottom: 0.5rem;
        }

        .historical-pif-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid var(--border, #e5e7eb);
          border-radius: 8px;
          font-size: 1rem;
          background: var(--input-bg, white);
          color: var(--text-primary, #1f2937);
          transition: border-color 0.2s ease;
        }

        .historical-pif-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .historical-pif-input[type="date"] {
          font-family: inherit;
        }

        .historical-pif-amount-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .historical-pif-currency-symbol {
          position: absolute;
          left: 1rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: #10b981;
          pointer-events: none;
        }

        .historical-pif-amount-input {
          padding-left: 2.5rem !important;
          font-size: 1.5rem;
          font-weight: 700;
          color: #059669;
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border-color: #86efac;
        }

        .historical-pif-amount-input:focus {
          background: var(--input-bg, white);
          border-color: #10b981;
        }

        .historical-pif-hint {
          font-size: 0.75rem;
          color: var(--gray-500, #6b7280);
          margin-top: 0.25rem;
          display: block;
        }

        .historical-pif-info-box {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 1rem;
        }

        .historical-pif-info-title {
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .historical-pif-info-content {
          font-size: 0.938rem;
          color: #1e40af;
        }

        .historical-pif-info-highlight {
          font-size: 0.75rem;
          color: var(--primary, #4f46e5);
          font-weight: 600;
        }

        .historical-pif-fee-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .historical-pif-fee-row .historical-pif-input {
          flex: 1;
        }

        .historical-pif-modal-footer {
          display: flex;
          gap: 0.75rem;
          padding: 1.5rem;
          border-top: 1px solid var(--border, #e5e7eb);
          background: var(--gray-50, #f9fafb);
          border-radius: 0 0 16px 16px;
        }

        .historical-pif-btn {
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

        .historical-pif-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .historical-pif-btn-ghost {
          background: white;
          border: 2px solid var(--border, #e5e7eb);
          color: var(--text-primary, #1f2937);
        }

        .historical-pif-btn-ghost:hover:not(:disabled) {
          background: var(--gray-100, #f3f4f6);
        }

        .historical-pif-btn-success {
          background: #10b981;
          color: white;
        }

        .historical-pif-btn-success:hover:not(:disabled) {
          background: #059669;
        }

        .historical-pif-btn-secondary {
          width: 100%;
          margin-top: 0.5rem;
          background: var(--gray-100, #f3f4f6);
          border: 2px solid var(--border, #e5e7eb);
          color: var(--text-primary, #1f2937);
          padding: 0.625rem 1rem;
        }

        .historical-pif-btn-secondary:hover:not(:disabled) {
          background: var(--gray-200, #e5e7eb);
        }

        .historical-pif-btn-danger-sm {
          flex: 0 0 auto;
          padding: 0.5rem 0.75rem;
          background: var(--danger, #ef4444);
          color: white;
        }

        .historical-pif-btn-danger-sm:hover:not(:disabled) {
          background: var(--danger-dark, #dc2626);
        }

        /* Dark mode */
        .dark-mode .historical-pif-modal {
          background: var(--gray-100);
        }

        .dark-mode .historical-pif-modal-header {
          background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
          border-color: var(--gray-300);
        }

        .dark-mode .historical-pif-modal-header h3 {
          color: white;
        }

        .dark-mode .historical-pif-close-btn {
          color: white;
        }

        .dark-mode .historical-pif-close-btn:hover {
          background: rgba(255,255,255,0.1);
        }

        .dark-mode .historical-pif-input {
          background: var(--gray-200);
          border-color: var(--gray-400);
          color: var(--gray-900);
        }

        .dark-mode .historical-pif-amount-input {
          background: linear-gradient(135deg, #065f46 0%, #047857 100%);
          color: white;
        }

        .dark-mode .historical-pif-currency-symbol {
          color: white;
        }

        .dark-mode .historical-pif-info-box {
          background: var(--blue-900, #1e3a8a);
          border-color: var(--blue-700, #1d4ed8);
        }

        .dark-mode .historical-pif-info-title {
          color: var(--blue-200, #bfdbfe);
        }

        .dark-mode .historical-pif-info-content {
          color: var(--blue-200, #bfdbfe);
        }

        .dark-mode .historical-pif-modal-footer {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        @media (max-width: 640px) {
          .historical-pif-modal {
            margin: 0.5rem;
            max-height: 95vh;
          }

          .historical-pif-modal-footer {
            flex-direction: column;
          }

          .historical-pif-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
