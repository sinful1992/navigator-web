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
  onAddAddress,
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
                onAddAddress={onAddAddress}
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

// Arrangement Form Modal Component
type FormModalProps = {
  state: AppState;
  addressIndex: number;
  onAddAddress?: (address: AddressRow) => Promise<number>;
  onSave: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
};

function ArrangementFormModal({ state, addressIndex, onAddAddress: _onAddAddress, onSave, onCancel }: FormModalProps) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [formData, setFormData] = React.useState({
    customerName: "",
    phoneNumber: "",
    scheduledDate: new Date().toISOString().slice(0, 10),
    scheduledTime: "",
    amount: "",
    notes: "",
  });

  const selectedAddress = state.addresses[addressIndex];
  if (!selectedAddress) {
    return null;
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const amount = parseFloat(formData.amount || '0');
    if (!formData.amount || isNaN(amount) || amount <= 0) {
      alert("Please enter a valid payment amount (numbers only, greater than 0)");
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

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div 
        className="card arrangement-form"
        style={{
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div className="card-header">
          <h3 style={{ margin: 0 }}>
            📅 Create Payment Arrangement
          </h3>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            For: {selectedAddress.address}
          </div>
        </div>
        
        <div className="card-body">
          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-group">
              <label>💰 Payment Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                className="input"
                placeholder="0.00"
                required
              />
            </div>

            <div className="form-group">
              <label>👤 Customer Name</label>
              <input
                type="text"
                value={formData.customerName}
                onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                className="input"
                placeholder="Customer name"
              />
            </div>

            <div className="form-group">
              <label>📞 Phone Number</label>
              <input
                type="tel"
                value={formData.phoneNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                className="input"
                placeholder="Phone number"
              />
            </div>

            <div className="form-group">
              <label>📅 Payment Due Date *</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                className="input"
                required
              />
            </div>

            <div className="form-group">
              <label>🕐 Preferred Time</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                className="input"
              />
            </div>

            <div className="form-group form-group-full">
              <label>📝 Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="input"
                rows={3}
                placeholder="Payment terms, special instructions, etc..."
              />
            </div>
          </form>
        </div>

        <div className="card-footer">
          <div className="btn-row btn-row-end">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <LoadingButton
              type="submit" 
              className="btn btn-primary" 
              isLoading={isLoading}
              loadingText="Creating..."
              onClick={handleSubmit}
            >
              📅 Create Arrangement
            </LoadingButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export const AddressList = React.memo(AddressListComponent);
