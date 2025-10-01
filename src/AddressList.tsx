// src/AddressList.tsx - Modern Design Update
import * as React from "react";
import type { AppState, Outcome, AddressRow, Arrangement } from "./types";
import UnifiedArrangementForm from "./components/UnifiedArrangementForm";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string) => void;
  onAddArrangement?: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  filterText: string;
};

// Timer component to show elapsed time
function ElapsedTimer({ startTime }: { startTime: string | null | undefined }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!startTime) return;

    const updateElapsed = () => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      setElapsed(Math.floor((now - start) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  if (!startTime) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="elapsed-timer">
      <span className="timer-icon">⏱️</span>
      <span className="timer-value">{minutes}:{seconds.toString().padStart(2, '0')}</span>
    </div>
  );
}

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
  onAddArrangement,
  filterText,
}: Props) {
  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const activeIndex = state.activeIndex;

  // Simple timestamp-based filtering: hide any address that has a completion
  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();

    addresses.forEach((addr, index) => {
      if (!addr.address) return;

      // Check if this specific index has a completion for current list version
      const hasCompletion = completions.some(c =>
        c.index === index &&
        (c.listVersion || state.currentListVersion) === state.currentListVersion
      );

      if (hasCompletion) {
        set.add(index);
      }
    });

    return set;
  }, [completions, addresses, state.currentListVersion]);

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

  // Local UI state for outcome panel & PIF
  const [outcomeOpenFor, setOutcomeOpenFor] = React.useState<number | null>(null);
  const [pifAmount, setPifAmount] = React.useState<string>("");
  const [caseReference, setCaseReference] = React.useState<string>("");
  const [showCaseRefPrompt, setShowCaseRefPrompt] = React.useState<number | null>(null);

  // Prevent double submissions
  const [submittingIndex, setSubmittingIndex] = React.useState<number | null>(null);
  const submittingRef = React.useRef<number | null>(null);
  const [lastSubmission, setLastSubmission] = React.useState<{index: number, outcome: string, timestamp: number} | null>(null);

  // Arrangement form state
  const [showArrangementForm, setShowArrangementForm] = React.useState<number | null>(null);

  // Closing outcomes when active changes
  React.useEffect(() => {
    if (activeIndex === null) {
      setOutcomeOpenFor(null);
      setPifAmount("");
      setCaseReference("");
      setShowCaseRefPrompt(null);
      setShowArrangementForm(null);
      setSubmittingIndex(null);
    }
  }, [activeIndex]);
  
  // Debounced completion handler with duplicate protection
  const handleCompletion = React.useCallback(async (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseRef?: string) => {
    // Check if already submitting this index
    if (submittingRef.current === index) return;
    
    // Check for duplicate submission within 2 seconds
    const now = Date.now();
    if (lastSubmission && 
        lastSubmission.index === index && 
        lastSubmission.outcome === outcome &&
        now - lastSubmission.timestamp < 2000) {
      return;
    }
    
    try {
      submittingRef.current = index;
      setSubmittingIndex(index);
      setLastSubmission({ index, outcome, timestamp: now });

      await onComplete(index, outcome, amount, arrangementId, caseRef);
      setOutcomeOpenFor(null);
    } catch (error) {
      console.error('Completion failed:', error);
    } finally {
      submittingRef.current = null;
      setSubmittingIndex(null);
    }
  }, [lastSubmission, onComplete]);

  if (visible.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📍</div>
        <div className="empty-title">No Pending Addresses</div>
        <div className="empty-message">
          Import an Excel file or add addresses manually to get started
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="address-list-modern">
        {visible.map(({ a, i }, displayIndex) => {
          const isActive = activeIndex === i;
          const mapHref = makeMapsHref(a);

          return (
            <div key={i} className={`address-card-modern ${isActive ? 'active' : ''}`}>
              {/* Card Header */}
              <div className="address-header-modern">
                <div className="address-content">
                  <div className="address-number">
                    {displayIndex + 1}
                  </div>
                  <div className="address-info">
                    <div className="address-title" title={a.address}>
                      {a.address}
                    </div>
                    <div className="address-meta">
                      <div className="address-meta-item">
                        <span>📍</span>
                        <span>Index #{i + 1}</span>
                      </div>
                      {a.lat && a.lng && (
                        <div className="address-meta-item">
                          <span>🌍</span>
                          <span>Coordinates ready</span>
                        </div>
                      )}
                      {isActive && state.activeStartTime && (
                        <div className="address-meta-item">
                          <ElapsedTimer startTime={state.activeStartTime} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className={`address-status-badge ${isActive ? 'status-active' : 'status-pending'}`}>
                  {isActive && <span>●</span>}
                  {isActive ? 'Active' : 'Pending'}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="address-actions-modern">
                <a
                  className="action-btn-modern btn-navigate"
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  title="Open in Google Maps"
                  onClick={() => {/* Navigation no longer auto-starts day */}}
                >
                  <span>🧭</span>
                  <span>Navigate</span>
                </a>

                {!isActive ? (
                  <button
                    className="action-btn-modern btn-set-active"
                    onClick={() => setActive(i)}
                  >
                    <span>▶️</span>
                    <span>Start</span>
                  </button>
                ) : (
                  <>
                    <button
                      className="action-btn-modern btn-complete"
                      onClick={() => {
                        const willOpen = outcomeOpenFor !== i;
                        setOutcomeOpenFor(willOpen ? i : null);
                        setPifAmount("");
                        setCaseReference("");
                        setShowCaseRefPrompt(null);
                      }}
                    >
                      <span>✅</span>
                      <span>Complete</span>
                    </button>
                    <button
                      className="action-btn-modern"
                      style={{ background: 'var(--gray-100)', color: 'var(--gray-600)' }}
                      onClick={cancelActive}
                    >
                      <span>❎</span>
                      <span>Cancel</span>
                    </button>
                  </>
                )}
              </div>

              {/* Outcome Panel (shown when Complete is pressed) */}
              {isActive && outcomeOpenFor === i && (
                <div className="outcome-panel-modern">
                  <div className="outcome-header">
                    <span className="outcome-title">Select Outcome</span>
                  </div>
                  
                  <div className="outcome-buttons">
                    <button
                      className="outcome-btn outcome-done"
                      disabled={submittingIndex === i}
                      onClick={() => handleCompletion(i, "Done")}
                      title="Mark as Done"
                    >
                      <span className="outcome-icon">✅</span>
                      <span className="outcome-label">Done</span>
                    </button>

                    <button
                      className="outcome-btn outcome-da"
                      disabled={submittingIndex === i}
                      onClick={() => handleCompletion(i, "DA")}
                      title="Mark as DA"
                    >
                      <span className="outcome-icon">🚫</span>
                      <span className="outcome-label">DA</span>
                    </button>

                    <button
                      className="outcome-btn outcome-arr"
                      onClick={() => {
                        setOutcomeOpenFor(null);
                        setShowArrangementForm(i);
                      }}
                      title="Create arrangement"
                    >
                      <span className="outcome-icon">📅</span>
                      <span className="outcome-label">Arrangement</span>
                    </button>
                  </div>

                  <div className="pif-section">
                    <div className="pif-input-group">
                      <span className="pif-label">💰 PIF Amount:</span>
                      <input
                        id={`pif-amount-${i}`}
                        name={`pifAmount-${i}`}
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        className="pif-input"
                        placeholder="£0.00"
                        value={pifAmount}
                        onChange={(e) => setPifAmount(e.target.value)}
                        autoComplete="off"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const n = Number(pifAmount);
                            if (!Number.isFinite(n) || n <= 0) {
                              alert("Enter a valid PIF amount (e.g. 50)");
                              return;
                            }
                            setShowCaseRefPrompt(i);
                          }
                        }}
                      />
                      <button
                        className="outcome-btn outcome-pif"
                        disabled={submittingIndex === i}
                        onClick={() => {
                          const n = Number(pifAmount);
                          if (!Number.isFinite(n) || n <= 0) {
                            alert("Enter a valid PIF amount (e.g. 50)");
                            return;
                          }
                          setShowCaseRefPrompt(i);
                        }}
                      >
                        <span className="outcome-icon">💷</span>
                        <span className="outcome-label">Next</span>
                      </button>
                    </div>
                  </div>

                  {submittingIndex === i && (
                    <div className="outcome-loading">
                      <span className="spinner-small"></span>
                      <span>Processing...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Full-Screen Arrangement Form */}
      {showArrangementForm !== null && onAddArrangement && addresses[showArrangementForm] && (
        <UnifiedArrangementForm
          state={state}
          preSelectedAddressIndex={showArrangementForm}
          onSave={async (arrangementData) => {
            await onAddArrangement(arrangementData);
            // Mark the address as ARR completed
            handleCompletion(showArrangementForm, "ARR");
            setShowArrangementForm(null);
          }}
          onCancel={() => setShowArrangementForm(null)}
          onComplete={handleCompletion}
          fullscreen={true}
        />
      )}

      {/* Case Reference Prompt Modal */}
      {showCaseRefPrompt !== null && (
        <div className="case-ref-modal-overlay" onClick={() => setShowCaseRefPrompt(null)}>
          <div className="case-ref-modal" onClick={(e) => e.stopPropagation()}>
            <div className="case-ref-modal-header">
              <h3>📋 Enter Case Reference</h3>
              <button className="close-btn" onClick={() => setShowCaseRefPrompt(null)}>✕</button>
            </div>
            <div className="case-ref-modal-body">
              <p>PIF Amount: <strong>£{Number(pifAmount).toFixed(2)}</strong></p>
              <div className="case-ref-input-wrapper">
                <label htmlFor="case-ref-input">Case Reference Number</label>
                <input
                  id="case-ref-input"
                  type="number"
                  inputMode="numeric"
                  className="case-ref-input"
                  placeholder="e.g. 123456"
                  value={caseReference}
                  onChange={(e) => setCaseReference(e.target.value)}
                  autoComplete="off"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const caseRefNum = Number(caseReference);
                      if (!caseReference || !caseReference.trim()) {
                        alert("Please enter a case reference number");
                        return;
                      }
                      if (!Number.isFinite(caseRefNum) || caseRefNum <= 0 || !Number.isInteger(caseRefNum)) {
                        alert("Case reference must be a valid whole number");
                        return;
                      }
                      handleCompletion(showCaseRefPrompt, "PIF", Number(pifAmount).toFixed(2), undefined, caseReference.trim());
                      setShowCaseRefPrompt(null);
                      setCaseReference("");
                      setPifAmount("");
                    }
                  }}
                />
              </div>
            </div>
            <div className="case-ref-modal-footer">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={() => {
                  setShowCaseRefPrompt(null);
                  setCaseReference("");
                }}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-save"
                disabled={submittingIndex === showCaseRefPrompt}
                onClick={() => {
                  const caseRefNum = Number(caseReference);
                  if (!caseReference || !caseReference.trim()) {
                    alert("Please enter a case reference number");
                    return;
                  }
                  if (!Number.isFinite(caseRefNum) || caseRefNum <= 0 || !Number.isInteger(caseRefNum)) {
                    alert("Case reference must be a valid whole number");
                    return;
                  }
                  handleCompletion(showCaseRefPrompt, "PIF", Number(pifAmount).toFixed(2), undefined, caseReference.trim());
                  setShowCaseRefPrompt(null);
                  setCaseReference("");
                  setPifAmount("");
                }}
              >
                {submittingIndex === showCaseRefPrompt ? 'Saving...' : 'Save PIF'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Elapsed Timer Styles */
        .elapsed-timer {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0.5rem;
          background: var(--primary);
          color: white;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.875rem;
          animation: pulse 2s ease-in-out infinite;
        }

        .timer-icon {
          font-size: 1rem;
        }

        .timer-value {
          font-variant-numeric: tabular-nums;
          min-width: 3rem;
          text-align: center;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.85;
          }
        }

        /* Modern Outcome Panel Styles */
        .outcome-panel-modern {
          background: var(--gray-50);
          border: 2px solid var(--primary);
          border-radius: var(--radius-lg);
          padding: 1rem;
          margin-top: 1rem;
          animation: slideDown 0.3s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .outcome-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .outcome-title {
          font-weight: 600;
          color: var(--gray-700);
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .outcome-buttons {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .outcome-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          padding: 0.75rem;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-normal);
          position: relative;
          overflow: hidden;
        }

        .outcome-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.1);
          transform: translateY(100%);
          transition: transform 0.3s ease;
        }

        .outcome-btn:hover::before {
          transform: translateY(0);
        }

        .outcome-btn:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .outcome-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .outcome-icon {
          font-size: 1.25rem;
        }

        .outcome-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .outcome-done {
          background: var(--success);
          color: white;
        }

        .outcome-da {
          background: var(--danger);
          color: white;
        }

        .outcome-arr {
          background: var(--warning);
          color: white;
        }

        .outcome-pif {
          background: var(--primary);
          color: white;
        }

        .pif-section {
          padding-top: 1rem;
          border-top: 1px solid var(--gray-200);
        }

        .pif-input-group {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .pif-label {
          font-weight: 600;
          color: var(--gray-700);
          font-size: 0.875rem;
        }

        .pif-input {
          flex: 1;
          padding: 0.625rem 0.75rem;
          border: 2px solid var(--gray-200);
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 600;
          text-align: right;
          transition: var(--transition-normal);
        }

        .pif-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-light);
        }

        .outcome-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem;
          color: var(--gray-600);
          font-size: 0.875rem;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid var(--gray-300);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .outcome-buttons {
            grid-template-columns: 1fr;
          }

          .pif-input-group {
            flex-direction: column;
            align-items: stretch;
          }

          .outcome-btn {
            flex-direction: row;
            justify-content: center;
            gap: 0.5rem;
          }
        }

        /* Case Reference Modal Styles */
        .case-ref-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .case-ref-modal {
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          width: 90%;
          max-width: 450px;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .case-ref-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem;
          border-bottom: 1px solid var(--gray-200);
        }

        .case-ref-modal-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--gray-800);
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: var(--gray-500);
          cursor: pointer;
          padding: 0.25rem;
          line-height: 1;
          transition: var(--transition-normal);
        }

        .close-btn:hover {
          color: var(--gray-700);
          transform: scale(1.1);
        }

        .case-ref-modal-body {
          padding: 1.5rem;
        }

        .case-ref-modal-body p {
          margin: 0 0 1.5rem 0;
          font-size: 1rem;
          color: var(--gray-600);
        }

        .case-ref-modal-body strong {
          color: var(--primary);
          font-size: 1.125rem;
        }

        .case-ref-input-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .case-ref-input-wrapper label {
          font-weight: 600;
          color: var(--gray-700);
          font-size: 0.875rem;
        }

        .case-ref-input {
          padding: 0.875rem 1rem;
          border: 2px solid var(--gray-300);
          border-radius: var(--radius-md);
          font-size: 1rem;
          font-weight: 600;
          transition: var(--transition-normal);
        }

        .case-ref-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 4px var(--primary-light);
        }

        .case-ref-modal-footer {
          display: flex;
          gap: 0.75rem;
          padding: 1.5rem;
          border-top: 1px solid var(--gray-200);
        }

        .modal-btn {
          flex: 1;
          padding: 0.875rem 1.5rem;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.938rem;
          cursor: pointer;
          transition: var(--transition-normal);
        }

        .modal-btn-cancel {
          background: var(--gray-100);
          color: var(--gray-700);
        }

        .modal-btn-cancel:hover {
          background: var(--gray-200);
        }

        .modal-btn-save {
          background: var(--primary);
          color: white;
        }

        .modal-btn-save:hover:not(:disabled) {
          background: var(--primary-dark);
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }

        .modal-btn-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .case-ref-modal {
            width: 95%;
            margin: 1rem;
          }

          .case-ref-modal-header,
          .case-ref-modal-body,
          .case-ref-modal-footer {
            padding: 1rem;
          }
        }
      `}</style>
    </>
  );
};

// Memoize component to prevent unnecessary re-renders
export const AddressList = React.memo(AddressListComponent);