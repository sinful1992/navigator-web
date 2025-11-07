import React from 'react';
import { calculateEnforcementFee } from '../utils/bonusCalculator';

type Props = {
  initialAmount?: string;
  initialCaseReference?: string;
  initialNumberOfCases?: number;
  initialEnforcementFees?: number[];
  onConfirm: (data: {
    amount: string;
    caseReference: string;
    numberOfCases: number;
    enforcementFees?: number[];
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
};

export function PifDetailsModal({
  initialAmount = '',
  initialCaseReference = '',
  initialNumberOfCases = 1,
  initialEnforcementFees = [],
  onConfirm,
  onCancel,
  isLoading = false
}: Props) {
  const [amount, setAmount] = React.useState(initialAmount);
  const [caseReference, setCaseReference] = React.useState(initialCaseReference);
  const [numberOfCases, setNumberOfCases] = React.useState(String(initialNumberOfCases));
  const [enforcementFees, setEnforcementFees] = React.useState<string[]>(
    initialEnforcementFees.length > 0 ? initialEnforcementFees.map(f => String(f)) : ['']
  );

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

      // Validate that number of cases is at least the number of enforcement fees
      if (parsedFees.length > 0 && parsedFees.length > numCases) {
        alert(`Number of cases (${numCases}) must be at least the number of enforcement fees (${parsedFees.length}). If you have ${parsedFees.length} cases with enforcement fees and additional linked cases, please increase the number of cases.`);
        return;
      }

      finalEnforcementFees = parsedFees.length > 0 ? parsedFees : undefined;
    }

    onConfirm({
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
    <div className="pif-modal-overlay" onClick={handleOverlayClick}>
      <div className="pif-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pif-modal-header">
          <h3>💷 Enter PIF Details</h3>
          <button className="pif-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="pif-modal-body">
          {/* PIF Amount */}
          <div className="pif-form-group">
            <label htmlFor="pif-amount">PIF Amount *</label>
            <div className="pif-amount-wrapper">
              <span className="pif-currency-symbol">£</span>
              <input
                id="pif-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="pif-input pif-amount-input"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>

          {/* Case Reference */}
          <div className="pif-form-group">
            <label htmlFor="case-ref">Case Reference Number *</label>
            <input
              id="case-ref"
              type="number"
              inputMode="numeric"
              className="pif-input"
              placeholder="e.g. 123456"
              value={caseReference}
              onChange={(e) => setCaseReference(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Number of Cases */}
          <div className="pif-form-group">
            <label htmlFor="num-cases">Number of Cases *</label>
            <input
              id="num-cases"
              type="number"
              inputMode="numeric"
              className="pif-input"
              placeholder="e.g. 1"
              min="1"
              value={numberOfCases}
              onChange={(e) => setNumberOfCases(e.target.value)}
              autoComplete="off"
            />
            <small className="pif-hint">
              If 1 debtor has 3 linked cases, enter 3
            </small>
          </div>

          {/* Auto-calculated Enforcement Fee (Single Case) */}
          {Number(numberOfCases) === 1 && calculatedSingleCaseFee !== null && (
            <div className="pif-info-box">
              <div className="pif-info-title">✅ Enforcement Fee (Auto-calculated)</div>
              <div className="pif-info-content">
                <strong>£{calculatedSingleCaseFee.toFixed(2)}</strong>
                <small style={{ display: 'block', marginTop: '0.25rem' }}>
                  Calculated automatically for single case based on debt amount
                </small>
              </div>
            </div>
          )}

          {/* Enforcement Fees (Multiple Cases) */}
          {Number(numberOfCases) > 1 && (
            <div className="pif-form-group">
              <label>Enforcement Fees (Optional)</label>
              <small className="pif-hint" style={{ marginBottom: '0.5rem', display: 'block' }}>
                Add enforcement fees for cases that have them. Linked cases without fees receive £10 bonus each.
              </small>

              {enforcementFees.map((fee, index) => (
                <div key={index} className="pif-fee-row">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className="pif-input"
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
                      className="pif-btn pif-btn-danger-sm"
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
                className="pif-btn pif-btn-secondary"
                onClick={() => setEnforcementFees([...enforcementFees, ""])}
              >
                ➕ Add Another Enf Fee
              </button>

              {numberOfCases && Number(numberOfCases) > 0 && (
                <div className="pif-info-box" style={{ marginTop: '0.75rem' }}>
                  <small className="pif-info-highlight">
                    ℹ️ {Math.max(0, Number(numberOfCases) - enforcementFees.filter(f => f && f.trim()).length)} linked case(s) (£10 bonus each)
                  </small>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pif-modal-footer">
          <button
            type="button"
            className="pif-btn pif-btn-ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pif-btn pif-btn-success"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : '✅ Save PIF'}
          </button>
        </div>
      </div>

      <style>{`
        .pif-modal-overlay {
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
          animation: pifFadeIn 0.2s ease;
        }

        @keyframes pifFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .pif-modal {
          background: var(--card-bg, white);
          border-radius: 16px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
          width: 100%;
          max-width: 550px;
          max-height: 90vh;
          overflow-y: auto;
          animation: pifSlideUp 0.3s ease;
        }

        @keyframes pifSlideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .pif-modal-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border, #e5e7eb);
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border-radius: 16px 16px 0 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .pif-modal-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #065f46;
        }

        .pif-close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          color: #6b7280;
          line-height: 1;
        }

        .pif-close-btn:hover {
          background: rgba(0,0,0,0.1);
        }

        .pif-modal-body {
          padding: 1.5rem;
        }

        .pif-form-group {
          margin-bottom: 1.25rem;
        }

        .pif-form-group:last-child {
          margin-bottom: 0;
        }

        .pif-form-group label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary, #374151);
          margin-bottom: 0.5rem;
        }

        .pif-input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid var(--border, #e5e7eb);
          border-radius: 8px;
          font-size: 1rem;
          background: var(--input-bg, white);
          color: var(--text-primary, #1f2937);
          transition: border-color 0.2s ease;
        }

        .pif-input:focus {
          outline: none;
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        .pif-amount-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .pif-currency-symbol {
          position: absolute;
          left: 1rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: #10b981;
          pointer-events: none;
        }

        .pif-amount-input {
          padding-left: 2.5rem !important;
          font-size: 1.5rem;
          font-weight: 700;
          color: #059669;
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border-color: #86efac;
        }

        .pif-amount-input:focus {
          background: var(--input-bg, white);
          border-color: #10b981;
        }

        .pif-hint {
          font-size: 0.75rem;
          color: var(--gray-500, #6b7280);
          margin-top: 0.25rem;
          display: block;
        }

        .pif-info-box {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          padding: 1rem;
        }

        .pif-info-title {
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .pif-info-content {
          font-size: 0.938rem;
          color: #1e40af;
        }

        .pif-info-highlight {
          font-size: 0.75rem;
          color: var(--primary, #4f46e5);
          font-weight: 600;
        }

        .pif-fee-row {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .pif-fee-row .pif-input {
          flex: 1;
        }

        .pif-modal-footer {
          display: flex;
          gap: 0.75rem;
          padding: 1.5rem;
          border-top: 1px solid var(--border, #e5e7eb);
          background: var(--gray-50, #f9fafb);
          border-radius: 0 0 16px 16px;
        }

        .pif-btn {
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

        .pif-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pif-btn-ghost {
          background: white;
          border: 2px solid var(--border, #e5e7eb);
          color: var(--text-primary, #1f2937);
        }

        .pif-btn-ghost:hover:not(:disabled) {
          background: var(--gray-100, #f3f4f6);
        }

        .pif-btn-success {
          background: #10b981;
          color: white;
        }

        .pif-btn-success:hover:not(:disabled) {
          background: #059669;
        }

        .pif-btn-secondary {
          width: 100%;
          margin-top: 0.5rem;
          background: var(--gray-100, #f3f4f6);
          border: 2px solid var(--border, #e5e7eb);
          color: var(--text-primary, #1f2937);
          padding: 0.625rem 1rem;
        }

        .pif-btn-secondary:hover:not(:disabled) {
          background: var(--gray-200, #e5e7eb);
        }

        .pif-btn-danger-sm {
          flex: 0 0 auto;
          padding: 0.5rem 0.75rem;
          background: var(--danger, #ef4444);
          color: white;
        }

        .pif-btn-danger-sm:hover:not(:disabled) {
          background: var(--danger-dark, #dc2626);
        }

        /* Dark mode */
        .dark-mode .pif-modal {
          background: var(--gray-100);
        }

        .dark-mode .pif-modal-header {
          background: linear-gradient(135deg, #065f46 0%, #047857 100%);
          border-color: var(--gray-300);
        }

        .dark-mode .pif-modal-header h3 {
          color: white;
        }

        .dark-mode .pif-close-btn {
          color: white;
        }

        .dark-mode .pif-close-btn:hover {
          background: rgba(255,255,255,0.1);
        }

        .dark-mode .pif-input {
          background: var(--gray-200);
          border-color: var(--gray-400);
          color: var(--gray-900);
        }

        .dark-mode .pif-amount-input {
          background: linear-gradient(135deg, #065f46 0%, #047857 100%);
          color: white;
        }

        .dark-mode .pif-currency-symbol {
          color: white;
        }

        .dark-mode .pif-info-box {
          background: var(--blue-900, #1e3a8a);
          border-color: var(--blue-700, #1d4ed8);
        }

        .dark-mode .pif-info-title {
          color: var(--blue-200, #bfdbfe);
        }

        .dark-mode .pif-info-content {
          color: var(--blue-200, #bfdbfe);
        }

        .dark-mode .pif-modal-footer {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        @media (max-width: 640px) {
          .pif-modal {
            margin: 0.5rem;
            max-height: 95vh;
          }

          .pif-modal-footer {
            flex-direction: column;
          }

          .pif-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
