// src/AddressList.tsx - Modern Design Update
import * as React from "react";
import type { AppState, Outcome, AddressRow, Arrangement } from "./types";
import FullScreenArrangementForm from "./components/FullScreenArrangementForm";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => void;
  onAddArrangement?: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => void;
  filterText: string;
  ensureDayStarted: () => void;
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
  onAddArrangement,
  filterText,
  ensureDayStarted,
}: Props) {
  const addresses = Array.isArray(state.addresses) ? state.addresses : [];
  const completions = Array.isArray(state.completions) ? state.completions : [];
  const activeIndex = state.activeIndex;

  // Simple timestamp-based filtering: hide any address that has a completion
  const completedIdx = React.useMemo(() => {
    const set = new Set<number>();

    addresses.forEach((addr, index) => {
      if (!addr.address) return;

      // Check if this address has any completion for current list version
      const hasCompletion = completions.some(c =>
        c.address === addr.address &&
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
      setShowArrangementForm(null);
      setSubmittingIndex(null);
    }
  }, [activeIndex]);
  
  // Debounced completion handler with duplicate protection
  const handleCompletion = React.useCallback(async (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => {
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
      
      await onComplete(index, outcome, amount, arrangementId);
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
                  onClick={() => ensureDayStarted()}
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
                    <span>Set Active</span>
                  </button>
                ) : (
                  <>
                    <button
                      className="action-btn-modern btn-complete"
                      onClick={() => {
                        const willOpen = outcomeOpenFor !== i;
                        setOutcomeOpenFor(willOpen ? i : null);
                        setPifAmount("");
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
                          handleCompletion(i, "PIF", n.toFixed(2));
                        }}
                      >
                        <span className="outcome-icon">💷</span>
                        <span className="outcome-label">Save PIF</span>
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
        <FullScreenArrangementForm
          address={addresses[showArrangementForm].address}
          addressIndex={showArrangementForm}
          onSave={async (arrangementData) => {
            await onAddArrangement(arrangementData);
            // Mark the address as ARR completed
            handleCompletion(showArrangementForm, "ARR");
            setShowArrangementForm(null);
          }}
          onCancel={() => setShowArrangementForm(null)}
        />
      )}

      <style>{`
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
      `}</style>
    </>
  );
};

// Memoize component to prevent unnecessary re-renders
export const AddressList = React.memo(AddressListComponent);