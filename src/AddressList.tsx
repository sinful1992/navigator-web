// src/AddressList.tsx
import * as React from "react";
import type { AppState, Outcome, AddressRow, Arrangement, ArrangementStatus } from "./types";
import { LoadingButton } from "./components/LoadingButton";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  onComplete: (index: number, outcome: Outcome, amount?: string) => void;
  onCreateArrangement: (addressIndex: number) => void;
  onAddArrangement?: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAddAddress?: (address: AddressRow) => Promise<number>;
  filterText: string;
  ensureDayStarted: () => void; // auto-start day on first Navigate
};

function makeMapsHref(row: AddressRow) {
  if (
    typeof row.lat === "number" &&
    typeof row.lng === "number" &&
    !Number.isNaN(row.lat) &&
    !Number.isNaN(row.lng)
  ) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${row.lat},${row.lng}`
    )}`;
  }
  const q = encodeURIComponent(row?.address ?? "");
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

const AddressListComponent = function AddressList({
  state,
  setActive,
  cancelActive,
  onComplete,
  onCreateArrangement: _onCreateArrangement, // Keep for backward compatibility but unused
  onAddArrangement,
  onAddAddress: _onAddAddress, // Unused in current implementation
  filterText,
  ensureDayStarted,
}: Props) {
  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const activeIndex = state.activeIndex;

  // Hide only items completed for the CURRENT list version.
  // If a completion has no listVersion (older backups), treat it as the current one.
  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();
    for (const c of completions) {
      const lv =
        typeof c?.listVersion === "number"
          ? c.listVersion
          : state.currentListVersion;
      if (lv === state.currentListVersion) set.add(Number(c.index));
    }
    return set;
  }, [completions, state.currentListVersion]);

  const lowerQ = (filterText ?? "").trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      addresses
        .map((a, i) => ({ a, i }))
        .filter(
          ({ a }) =>
            !lowerQ || (a.address ?? "").toLowerCase().includes(lowerQ)
        )
        .filter(({ i }) => !completedIdx.has(i)),
    [addresses, lowerQ, completedIdx]
  );

  // local UI for outcome panel & PIF
  const [outcomeOpenFor, setOutcomeOpenFor] = React.useState<number | null>(
    null
  );
  const [pifAmount, setPifAmount] = React.useState<string>("");
  
  // Arrangement form state
  const [showArrangementForm, setShowArrangementForm] = React.useState<number | null>(null);

  // closing outcomes when active changes
  React.useEffect(() => {
    if (activeIndex === null) {
      setOutcomeOpenFor(null);
      setPifAmount("");
      setShowArrangementForm(null);
    }
  }, [activeIndex]);

  if (visible.length === 0) {
    return (
      <div className="empty-box">
        <div>No pending addresses</div>
        <p>Import a list or clear filters to see items.</p>
      </div>
    );
  }

  return (
    <div className="list">
      {visible.map(({ a, i }) => {
        const isActive = activeIndex === i;
        const mapHref = makeMapsHref(a);

        return (
          <div key={i} className={`row-card ${isActive ? "card-active" : ""}`}>
            {/* Row header */}
            <div className="row-head">
              <div className="row-index">{i + 1}</div>
              <div className="row-title" title={a.address}>
                {a.address}
              </div>
              {isActive && <span className="active-badge">Active</span>}
            </div>

            {/* Actions row */}
            <div className="row-actions">
              <a
                className="btn btn-outline btn-sm"
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                title="Open in Google Maps"
                onClick={() => ensureDayStarted()}
              >
                🧭 Navigate
              </a>

              {!isActive ? (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setActive(i)}
                >
                  ▶️ Set Active
                </button>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={cancelActive}
                >
                  ❎ Cancel
                </button>
              )}

              {isActive && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={() => {
                    const willOpen = outcomeOpenFor !== i;
                    setOutcomeOpenFor(willOpen ? i : null);
                    setPifAmount("");
                  }}
                >
                  ✅ Complete
                </button>
              )}
            </div>

            {/* Outcome bar (only when active + Complete pressed) */}
            {isActive && outcomeOpenFor === i && (
              <div className="card-body">
                <div className="complete-bar">
                  <div className="complete-btns">
                    <button
                      className="btn btn-success"
                      onClick={() => {
                        onComplete(i, "Done");
                        setOutcomeOpenFor(null);
                      }}
                      title="Mark as Done"
                    >
                      ✅ Done
                    </button>

                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        onComplete(i, "DA");
                        setOutcomeOpenFor(null);
                      }}
                      title="Mark as DA"
                    >
                      🚫 DA
                    </button>

                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setOutcomeOpenFor(null);
                        setShowArrangementForm(i);
                      }}
                      title="Create arrangement and mark completed"
                    >
                      📅 Arrangement
                    </button>
                  </div>

                  <div className="pif-group">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      className="input amount-input"
                      placeholder="PIF £"
                      value={pifAmount}
                      onChange={(e) => setPifAmount(e.target.value)}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const n = Number(pifAmount);
                        if (!Number.isFinite(n) || n <= 0) {
                          alert("Enter a valid PIF amount (e.g. 50)");
                          return;
                        }
                        onComplete(i, "PIF", n.toFixed(2));
                        setOutcomeOpenFor(null);
                      }}
                      title="Save PIF amount"
                    >
                      💷 Save PIF
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Arrangement Form Modal - only show if showArrangementForm is set */}
            {showArrangementForm !== null && onAddArrangement && (
              <ArrangementFormModal 
                state={state}
                addressIndex={showArrangementForm}
                onSave={async (arrangementData) => {
                  await onAddArrangement(arrangementData);
                  // Mark the address as ARR completed
                  onComplete(showArrangementForm, "ARR");
                  setShowArrangementForm(null);
                }}
                onCancel={() => setShowArrangementForm(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// Arrangement Form Modal Component - Polished Design
type FormModalProps = {
  state: AppState;
  addressIndex: number;
  onSave: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
};

function ArrangementFormModal({ state, addressIndex, onSave, onCancel }: FormModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    customerName: "",
    phoneNumber: "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    scheduledTime: "",
    amount: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = React.useState<{ amount?: string }>({});

  // Refs for accessibility and performance
  const modalRef = React.useRef<HTMLDivElement>(null);
  const amountInputRef = React.useRef<HTMLInputElement>(null);

  const selectedAddress = state.addresses[addressIndex];
  if (!selectedAddress) {
    return null;
  }

  // Real-time amount validation
  const validateAmount = (value: string) => {
    const amount = parseFloat(value || '0');
    if (!value || isNaN(amount) || amount <= 0) {
      setFormErrors(prev => ({ ...prev, amount: "Please enter a valid payment amount" }));
      return false;
    }
    setFormErrors(prev => ({ ...prev, amount: undefined }));
    return true;
  };

  // Handle keyboard navigation - simplified approach
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Focus management - delay to allow modal to render
    if (amountInputRef.current) {
      setTimeout(() => amountInputRef.current?.focus(), 150);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Validate amount first
    if (!validateAmount(formData.amount)) {
      amountInputRef.current?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const arrangementData = {
        addressIndex: addressIndex,
        address: selectedAddress.address,
        customerName: formData.customerName,
        phoneNumber: formData.phoneNumber,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
        amount: formData.amount,
        notes: formData.notes,
        status: "Scheduled" as ArrangementStatus,
      };

      await onSave(arrangementData);
    } catch (error) {
      console.error('Error saving arrangement:', error);
      alert(`Failed to save arrangement: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle amount input changes with validation
  const handleAmountChange = (value: string) => {
    setFormData(prev => ({ ...prev, amount: value }));
    if (value) {
      validateAmount(value);
    } else {
      setFormErrors(prev => ({ ...prev, amount: undefined }));
    }
  };

  return (
    <div 
      className="arrangement-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div 
        ref={modalRef}
        className="arrangement-modal-content"
        role="dialog"
        aria-labelledby="arrangement-modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="arrangement-modal-header">
          <div className="arrangement-modal-header-content">
            <div>
              <h3 id="arrangement-modal-title" className="arrangement-modal-title">
                📅 Create Payment Arrangement
              </h3>
              <div className="arrangement-modal-subtitle">
                {selectedAddress.address}
              </div>
            </div>
            <button 
              onClick={onCancel}
              className="arrangement-modal-close"
              title="Close (Esc)"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* Body */}
        <div className="arrangement-modal-body">
          <form onSubmit={handleSubmit} className="arrangement-form">
            {/* Amount - Featured */}
            <div className="amount-field">
              <label className="amount-label">
                💰 Payment Amount *
              </label>
              <input
                ref={amountInputRef}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={formData.amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className={`input amount-input ${formErrors.amount ? 'input-error' : ''}`}
                placeholder="0.00"
                required
                aria-describedby={formErrors.amount ? "amount-error" : undefined}
              />
              {formErrors.amount && (
                <div id="amount-error" className="field-error" role="alert">
                  {formErrors.amount}
                </div>
              )}
            </div>

            {/* Customer Details */}
            <div className="customer-details-row">
              <div className="field-group">
                <label className="field-label">
                  👤 Customer Name
                </label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  className="input"
                  placeholder="Customer name"
                />
              </div>

              <div className="field-group">
                <label className="field-label">
                  📞 Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                  className="input"
                  placeholder="Phone number"
                />
              </div>
            </div>

            {/* Date & Time */}
            <div className="datetime-row">
              <div className="field-group field-group-date">
                <label className="field-label">
                  📅 Payment Due Date *
                </label>
                <input
                  type="date"
                  value={formData.scheduledDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                  className="input"
                  required
                />
              </div>

              <div className="field-group field-group-time">
                <label className="field-label">
                  🕐 Time
                </label>
                <input
                  type="time"
                  value={formData.scheduledTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                  className="input"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="field-group">
              <label className="field-label">
                📝 Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="input textarea-field"
                rows={3}
                placeholder="Payment terms, special instructions, etc..."
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="arrangement-modal-footer">
          <div className="modal-actions">
            <button 
              type="button" 
              className="btn btn-ghost cancel-btn" 
              onClick={onCancel}
            >
              Cancel
            </button>
            <LoadingButton
              type="submit" 
              className="btn btn-primary submit-btn" 
              isLoading={isLoading}
              loadingText="Creating..."
              onClick={handleSubmit}
              disabled={!!formErrors.amount}
            >
              📅 Create Arrangement
            </LoadingButton>
          </div>
        </div>
      </div>

      <style>{`
        /* ==== Arrangement Modal Styles ==== */
        .arrangement-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
          animation: arrangement-fadeIn 0.2s ease-out;
          /* Performance optimizations */
          will-change: opacity;
          transform: translateZ(0);
          /* Safe area support for modern mobile devices */
          padding-top: max(1rem, env(safe-area-inset-top));
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
          padding-left: max(1rem, env(safe-area-inset-left));
          padding-right: max(1rem, env(safe-area-inset-right));
        }

        .arrangement-modal-content {
          background: var(--surface, #ffffff);
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
          max-width: 480px;
          width: 100%;
          max-height: calc(100vh - 2rem);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: arrangement-slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          /* Performance optimizations */
          will-change: transform, opacity;
          transform: translateZ(0);
          /* Ensure touch targets are accessible */
          position: relative;
        }

        .arrangement-modal-header {
          padding: 1.5rem 1.5rem 1rem;
          border-bottom: 1px solid var(--border-light, #e2e8f0);
          background: var(--surface, #ffffff);
          border-radius: 16px 16px 0 0;
          flex-shrink: 0;
        }

        .arrangement-modal-header-content {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .arrangement-modal-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary, #1e293b);
          line-height: 1.3;
        }

        .arrangement-modal-subtitle {
          font-size: 0.875rem;
          color: var(--text-muted, #94a3b8);
          margin-top: 0.25rem;
          word-break: break-word;
        }

        .arrangement-modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: var(--text-muted, #94a3b8);
          padding: 0.5rem;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
          /* Ensure minimum touch target size */
          min-width: 44px;
          min-height: 44px;
          flex-shrink: 0;
        }

        .arrangement-modal-close:hover {
          background: var(--bg-secondary, #f1f5f9);
          color: var(--text-primary, #1e293b);
        }

        .arrangement-modal-close:focus {
          outline: 2px solid var(--primary, #0ea5e9);
          outline-offset: 2px;
        }

        .arrangement-modal-body {
          padding: 1.5rem;
          flex: 1;
          overflow-y: auto;
          /* Better scrolling on mobile */
          -webkit-overflow-scrolling: touch;
          /* Ensure body can scroll when keyboard is open */
          min-height: 0;
        }

        .arrangement-form {
          display: grid;
          gap: 1.25rem;
        }

        .amount-field {
          padding: 1rem;
          background: var(--success-light, #dcfce7);
          border-radius: 12px;
          border: 2px solid var(--success, #16a34a);
          transition: border-color 0.15s ease;
        }

        .amount-field:has(.input-error) {
          border-color: var(--danger, #dc2626);
          background: var(--danger-light, #fee2e2);
        }

        .amount-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: var(--success-dark, #15803d);
        }

        .amount-input {
          font-size: 1.25rem !important;
          font-weight: 600;
          text-align: center;
          border: 2px solid transparent;
          border-radius: 8px;
          padding: 0.875rem;
          background: var(--surface, #ffffff);
          transition: all 0.15s ease;
        }

        .amount-input:focus {
          border-color: var(--success, #16a34a);
          box-shadow: 0 0 0 3px var(--success-light, #dcfce7);
        }

        .amount-input.input-error {
          border-color: var(--danger, #dc2626);
        }

        .amount-input.input-error:focus {
          border-color: var(--danger, #dc2626);
          box-shadow: 0 0 0 3px var(--danger-light, #fee2e2);
        }

        .field-error {
          color: var(--danger, #dc2626);
          font-size: 0.8125rem;
          font-weight: 500;
          margin-top: 0.375rem;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .field-error::before {
          content: "⚠";
          font-size: 0.875rem;
        }

        .customer-details-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .datetime-row {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 1rem;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .field-label {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary, #64748b);
        }

        .textarea-field {
          resize: vertical;
          min-height: 2.75rem;
          font-family: inherit;
        }

        .arrangement-modal-footer {
          padding: 1rem 1.5rem 1.5rem;
          border-top: 1px solid var(--border-light, #e2e8f0);
          background: var(--surface, #ffffff);
          border-radius: 0 0 16px 16px;
          flex-shrink: 0;
        }

        .modal-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          align-items: center;
        }

        .cancel-btn {
          min-width: 80px;
          min-height: 44px;
        }

        .submit-btn {
          min-width: 160px;
          min-height: 44px;
        }

        /* ==== Animations ==== */
        @keyframes arrangement-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes arrangement-slideUp {
          from { 
            transform: scale(0.95) translateY(20px);
            opacity: 0;
          }
          to { 
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }

        /* ==== Mobile Responsive Design ==== */
        @media (max-width: 768px) {
          .arrangement-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            padding: 0;
            align-items: flex-start;
            justify-content: center;
            /* Critical: Make the entire overlay scrollable */
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            /* Prevent body scroll when modal is open */
            overscroll-behavior: contain;
          }

          .arrangement-modal-content {
            margin: 2rem auto;
            max-width: calc(100vw - 2rem);
            width: 100%;
            max-height: none;
            border-radius: 16px;
            animation: arrangement-slideUpMobile 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            /* Allow natural sizing */
            min-height: min-content;
            /* Add margin at bottom so user can scroll modal above keyboard */
            margin-bottom: 50vh;
          }

          .arrangement-modal-header {
            padding: 1rem 1rem 0.75rem;
          }

          .arrangement-modal-title {
            font-size: 1.125rem;
          }

          .arrangement-modal-body {
            padding: 1rem;
          }

          .arrangement-modal-footer {
            padding: 0.75rem 1rem 1rem;
          }

          .customer-details-row {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .datetime-row {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .modal-actions {
            flex-direction: column-reverse;
            gap: 0.5rem;
          }

          .cancel-btn,
          .submit-btn {
            width: 100%;
            justify-content: center;
            min-width: auto;
          }

          .amount-input {
            font-size: 1.125rem !important;
          }
        }

        @media (max-width: 480px) {
          .arrangement-modal-content {
            margin: 1rem auto;
            max-width: calc(100vw - 2rem);
            border-radius: 12px;
            animation: arrangement-slideUpFull 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            /* Larger bottom margin on small screens for more keyboard clearance */
            margin-bottom: 60vh;
          }

          .arrangement-modal-header {
            border-radius: 12px 12px 0 0;
          }

          .arrangement-modal-footer {
            border-radius: 0 0 12px 12px;
          }
        }

        @keyframes arrangement-slideUpMobile {
          from { 
            transform: translateY(100%);
            opacity: 0;
          }
          to { 
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes arrangement-slideUpFull {
          from { 
            transform: translateY(100%);
          }
          to { 
            transform: translateY(0);
          }
        }

        /* ==== Accessibility & Focus Management ==== */
        @media (prefers-reduced-motion: reduce) {
          .arrangement-modal-overlay {
            animation: none;
          }
          
          .arrangement-modal-content {
            animation: none;
          }
        }

        /* ==== High DPI Support ==== */
        @media (min-resolution: 2dppx) {
          .arrangement-modal-content {
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.1);
          }
        }

        /* ==== Dark Mode Support (if implemented) ==== */
        @media (prefers-color-scheme: dark) {
          .arrangement-modal-overlay {
            background: rgba(0, 0, 0, 0.8);
          }
        }
      `}</style>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export const AddressList = React.memo(AddressListComponent);
