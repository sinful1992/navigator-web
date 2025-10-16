// src/AddressList.tsx - Modern Design Update
import * as React from "react";
import type { AppState, Outcome, AddressRow, Arrangement } from "./types";
import UnifiedArrangementForm from "./components/UnifiedArrangementForm";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  state: AppState;
  setActive: (index: number) => void;
  cancelActive: () => void;
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string, numberOfCases?: number) => void;
  onAddArrangement?: (
    arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<string>;
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

// Component to auto-fit map bounds (only on initial mount or when reset is triggered)
function FitBounds({ positions, resetTrigger }: { positions: [number, number][]; resetTrigger?: number }) {
  const map = useMap();
  const hasfitted = React.useRef(false);
  const lastResetTrigger = React.useRef(0);

  React.useEffect(() => {
    if (positions.length === 0) return;

    // Fit on initial mount or when reset is triggered
    const shouldFit = !hasfitted.current || (resetTrigger && resetTrigger !== lastResetTrigger.current);

    if (!shouldFit) return;

    hasfitted.current = true;
    if (resetTrigger) lastResetTrigger.current = resetTrigger;

    if (positions.length === 1) {
      map.setView(positions[0], 15);
    } else {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds.pad(0.1));
    }
  }, [map, positions, resetTrigger]);

  return null;
}

// Create numbered marker icon
function createNumberedIcon(number: number, isActive: boolean): L.DivIcon {
  return L.divIcon({
    className: 'custom-numbered-marker',
    html: `<div class="marker-pin ${isActive ? 'marker-active' : ''}">
      <div class="marker-number">${number}</div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });
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

  // View mode state (list or map)
  const [viewMode, setViewMode] = React.useState<'list' | 'map'>(() => {
    const saved = localStorage.getItem('navigator_address_view_mode');
    return (saved === 'map' || saved === 'list') ? saved : 'list';
  });

  // Map reset trigger
  const [mapResetTrigger, setMapResetTrigger] = React.useState(0);

  // Persist view mode preference
  React.useEffect(() => {
    localStorage.setItem('navigator_address_view_mode', viewMode);
  }, [viewMode]);

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
  const [numberOfCases, setNumberOfCases] = React.useState<string>("1");
  const [showCaseRefPrompt, setShowCaseRefPrompt] = React.useState<number | null>(null);

  // Prevent double submissions with Promise-based locking
  const [submittingIndex, setSubmittingIndex] = React.useState<number | null>(null);
  const pendingCompletions = React.useRef<Map<number, Promise<void>>>(new Map());

  // Arrangement form state
  const [showArrangementForm, setShowArrangementForm] = React.useState<number | null>(null);

  // Closing outcomes when active changes
  React.useEffect(() => {
    if (activeIndex === null) {
      setOutcomeOpenFor(null);
      setPifAmount("");
      setCaseReference("");
      setNumberOfCases("1");
      setShowCaseRefPrompt(null);
      setShowArrangementForm(null);
      setSubmittingIndex(null);
    }
  }, [activeIndex]);

  // Robust completion handler with Promise-based locking
  const handleCompletion = React.useCallback(async (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseRef?: string, numCases?: number) => {
    // Check if there's already a pending completion for this index
    const existingPromise = pendingCompletions.current.get(index);
    if (existingPromise) {
      // Wait for the existing completion to finish before returning
      await existingPromise;
      return;
    }

    // Create and store the completion promise
    const completionPromise = (async () => {
      try {
        setSubmittingIndex(index);
        await onComplete(index, outcome, amount, arrangementId, caseRef, numCases);
        setOutcomeOpenFor(null);
      } catch (error) {
        console.error('Completion failed:', error);
        throw error;
      } finally {
        setSubmittingIndex(null);
        pendingCompletions.current.delete(index);
      }
    })();

    pendingCompletions.current.set(index, completionPromise);
    await completionPromise;
  }, [onComplete]);

  // Filter visible addresses that have coordinates for map view
  const geocodedVisible = React.useMemo(
    () => visible.filter(({ a }) => a.lat && a.lng),
    [visible]
  );

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

  // Get the first visible address for "Navigate to Next" button
  const nextAddress = visible.length > 0 ? visible[0] : null;
  const nextMapHref = nextAddress ? makeMapsHref(nextAddress.a) : "";

  return (
    <>
      {/* Navigate to Next Button */}
      {nextAddress && (
        <div className="navigate-next-container">
          <a
            className="navigate-next-btn"
            href={nextMapHref}
            target="_blank"
            rel="noreferrer"
            title="Navigate to next address"
          >
            <span className="next-icon">🧭</span>
            <div className="next-content">
              <span className="next-label">Navigate to Next</span>
              <span className="next-address">{nextAddress.a.address}</span>
            </div>
          </a>
        </div>
      )}

      {/* View Toggle */}
      <div className="view-toggle-container">
        <button
          className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          <span>📋</span>
          <span>List</span>
        </button>
        <button
          className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
          onClick={() => setViewMode('map')}
          disabled={geocodedVisible.length === 0}
        >
          <span>🗺️</span>
          <span>Map</span>
          {geocodedVisible.length === 0 && <span className="badge-warning">(No coordinates)</span>}
        </button>
      </div>

      {/* Map View */}
      {viewMode === 'map' && geocodedVisible.length > 0 && (
        <div className="map-view-container">
          {/* Reset View Button */}
          <button
            className="map-reset-btn"
            onClick={() => setMapResetTrigger(Date.now())}
            title="Reset map view to show all addresses"
          >
            🎯 Reset View
          </button>

          <MapContainer
            center={[51.5074, -0.1278]}
            zoom={10}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitBounds
              positions={geocodedVisible.map(({ a }) => [a.lat!, a.lng!])}
              resetTrigger={mapResetTrigger}
            />

            {geocodedVisible.map(({ a, i }, displayIndex) => {
              const isActive = activeIndex === i;

              return (
                <Marker
                  key={i}
                  position={[a.lat!, a.lng!]}
                  icon={createNumberedIcon(displayIndex + 1, isActive)}
                >
                  <Popup>
                    <div className="map-popup">
                      <div className="popup-header">
                        <span className="popup-number">#{displayIndex + 1}</span>
                        <span className={`popup-status ${isActive ? 'status-active' : 'status-pending'}`}>
                          {isActive ? 'Active' : 'Pending'}
                        </span>
                      </div>
                      <div className="popup-address">{a.address}</div>
                      {!isActive && (
                        <button
                          className="popup-btn-start"
                          onClick={() => setActive(i)}
                        >
                          ▶️ Start
                        </button>
                      )}
                      {isActive && (
                        <div className="popup-active-info">
                          <ElapsedTimer startTime={state.activeStartTime} />
                          <button
                            className="popup-btn-complete"
                            onClick={() => {
                              // Switch to list view to complete
                              setViewMode('list');
                            }}
                          >
                            ✅ Complete
                          </button>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
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
                      onClick={() => {
                        if (window.confirm('Are you sure you want to cancel? Any tracked time will be lost.')) {
                          cancelActive();
                        }
                      }}
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
      )}

      {/* Full-Screen Arrangement Form */}
      {showArrangementForm !== null && onAddArrangement && addresses[showArrangementForm] && (
        <UnifiedArrangementForm
          state={state}
          preSelectedAddressIndex={showArrangementForm}
          onSave={async (arrangementData) => {
            const arrangementId = await onAddArrangement(arrangementData);
            // Mark the address as ARR completed and link the new arrangement
            handleCompletion(showArrangementForm, "ARR", undefined, arrangementId);
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
              <h3>📋 Enter Case Details</h3>
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
                />
              </div>
              <div className="case-ref-input-wrapper" style={{ marginTop: '1rem' }}>
                <label htmlFor="num-cases-input">Number of Cases</label>
                <input
                  id="num-cases-input"
                  type="number"
                  inputMode="numeric"
                  className="case-ref-input"
                  placeholder="e.g. 1"
                  min="1"
                  value={numberOfCases}
                  onChange={(e) => setNumberOfCases(e.target.value)}
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const caseRefNum = Number(caseReference);
                      const numCases = Number(numberOfCases);
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
                      handleCompletion(showCaseRefPrompt, "PIF", Number(pifAmount).toFixed(2), undefined, caseReference.trim(), numCases);
                      setShowCaseRefPrompt(null);
                      setCaseReference("");
                      setNumberOfCases("1");
                      setPifAmount("");
                    }
                  }}
                />
                <small style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                  If 1 debtor has 3 linked cases, enter 3
                </small>
              </div>
            </div>
            <div className="case-ref-modal-footer">
              <button
                className="modal-btn modal-btn-cancel"
                onClick={() => {
                  setShowCaseRefPrompt(null);
                  setCaseReference("");
                  setNumberOfCases("1");
                }}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-save"
                disabled={submittingIndex === showCaseRefPrompt}
                onClick={() => {
                  const caseRefNum = Number(caseReference);
                  const numCases = Number(numberOfCases);
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
                  handleCompletion(showCaseRefPrompt, "PIF", Number(pifAmount).toFixed(2), undefined, caseReference.trim(), numCases);
                  setShowCaseRefPrompt(null);
                  setCaseReference("");
                  setNumberOfCases("1");
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
        /* Navigate to Next Button Styles */
        .navigate-next-container {
          margin-bottom: 1rem;
        }

        .navigate-next-btn {
          display: flex;
          align-items: center;
          gap: 1rem;
          width: 100%;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
          color: white;
          border: none;
          border-radius: var(--radius-lg);
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.25);
          position: relative;
          overflow: hidden;
        }

        .navigate-next-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .navigate-next-btn:hover::before {
          left: 100%;
        }

        .navigate-next-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 123, 255, 0.35);
        }

        .navigate-next-btn:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
        }

        .next-icon {
          font-size: 2rem;
          animation: compassSpin 3s linear infinite;
        }

        @keyframes compassSpin {
          0%, 90% {
            transform: rotate(0deg);
          }
          95% {
            transform: rotate(10deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }

        .next-content {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          flex: 1;
          min-width: 0;
        }

        .next-label {
          font-size: 0.875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          opacity: 0.95;
          margin-bottom: 0.25rem;
        }

        .next-address {
          font-size: 0.938rem;
          font-weight: 500;
          opacity: 0.9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }

        @media (max-width: 768px) {
          .navigate-next-btn {
            padding: 0.875rem 1rem;
          }

          .next-icon {
            font-size: 1.5rem;
          }

          .next-label {
            font-size: 0.75rem;
          }

          .next-address {
            font-size: 0.813rem;
          }
        }

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

        /* View Toggle Styles */
        .view-toggle-container {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem;
          margin-bottom: 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
        }

        .view-toggle-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border: 2px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface);
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .view-toggle-btn:hover:not(:disabled) {
          background: var(--gray-50);
          border-color: var(--primary);
        }

        .view-toggle-btn.active {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }

        .view-toggle-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .badge-warning {
          font-size: 0.65rem;
          color: var(--warning);
          font-weight: normal;
        }

        /* Map View Styles */
        .map-view-container {
          height: 600px;
          max-height: calc(100vh - 300px);
          position: relative;
          border-radius: var(--radius-lg);
          overflow: hidden;
          border: 1px solid var(--border);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          z-index: 1;
        }

        /* Ensure Leaflet map respects container */
        .map-view-container .leaflet-container {
          border-radius: var(--radius-lg);
          z-index: 1;
        }

        /* Map Reset Button */
        .map-reset-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 10;
          padding: 0.5rem 1rem;
          background: var(--surface);
          color: var(--text-primary);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .map-reset-btn:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
        }

        .map-reset-btn:active {
          transform: translateY(0);
        }

        /* Custom Numbered Markers */
        .custom-numbered-marker {
          background: transparent;
          border: none;
        }

        .marker-pin {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .marker-pin::before {
          content: '';
          position: absolute;
          width: 36px;
          height: 36px;
          background: var(--primary);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          border: 3px solid white;
        }

        .marker-pin.marker-active::before {
          background: var(--success);
          animation: markerPulse 2s ease-in-out infinite;
        }

        @keyframes markerPulse {
          0%, 100% {
            transform: rotate(-45deg) scale(1);
          }
          50% {
            transform: rotate(-45deg) scale(1.1);
          }
        }

        .marker-number {
          position: relative;
          z-index: 1;
          color: white;
          font-weight: bold;
          font-size: 0.875rem;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          transform: translateY(-2px);
        }

        /* Leaflet Popup Override for Dark Mode */
        .leaflet-popup-content-wrapper {
          background: var(--surface) !important;
          color: var(--text-primary) !important;
          border: 1px solid var(--border) !important;
          box-shadow: 0 3px 14px rgba(0, 0, 0, 0.4) !important;
        }

        .leaflet-popup-tip {
          background: var(--surface) !important;
          border: 1px solid var(--border) !important;
        }

        .leaflet-popup-close-button {
          color: var(--text-primary) !important;
        }

        .leaflet-popup-close-button:hover {
          color: var(--primary) !important;
        }

        /* Map Popup Styles */
        .map-popup {
          min-width: 200px;
          padding: 0.5rem;
        }

        .popup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--border);
        }

        .popup-number {
          font-weight: bold;
          color: var(--primary);
          font-size: 1rem;
        }

        .popup-status {
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
        }

        .popup-status.status-active {
          background: var(--success);
          color: white;
        }

        .popup-status.status-pending {
          background: var(--gray-700);
          color: var(--gray-100);
        }

        .popup-address {
          margin-bottom: 0.75rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .popup-btn-start,
        .popup-btn-complete {
          width: 100%;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: var(--radius-md);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .popup-btn-start {
          background: var(--primary);
          color: white;
        }

        .popup-btn-start:hover {
          background: var(--primary-dark);
        }

        .popup-btn-complete {
          background: var(--success);
          color: white;
          margin-top: 0.5rem;
        }

        .popup-btn-complete:hover {
          background: var(--success-dark);
        }

        .popup-active-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .popup-active-info .elapsed-timer {
          justify-content: center;
          margin-bottom: 0.25rem;
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