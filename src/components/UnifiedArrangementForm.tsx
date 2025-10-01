import React from 'react';
import type { AppState, Arrangement, ArrangementStatus, AddressRow, Outcome } from '../types';
import { LoadingButton } from './LoadingButton';
import { addDays, addWeeks, addMonths, format, parseISO } from 'date-fns';

type PreviousPayment = {
  id: string;
  amount: string;
  date: string;
  notes?: string;
};

type Props = {
  state: AppState;
  arrangement?: Arrangement;
  preSelectedAddressIndex?: number | null;
  onAddAddress?: (address: AddressRow) => Promise<number>;
  onSave: (arrangement: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
  onCancel: () => void;
  isLoading?: boolean;
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string) => void;
  fullscreen?: boolean;
};

export default function UnifiedArrangementForm({
  state,
  arrangement,
  preSelectedAddressIndex,
  onAddAddress,
  onSave,
  onCancel,
  isLoading = false,
  onComplete,
  fullscreen = false
}: Props) {
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Form state
  const [addressMode, setAddressMode] = React.useState<"existing" | "manual">(
    preSelectedAddressIndex !== null && preSelectedAddressIndex !== undefined ? "existing" : "existing"
  );

  const [formData, setFormData] = React.useState({
    // Address
    addressIndex: arrangement?.addressIndex ?? preSelectedAddressIndex ?? 0,
    manualAddress: "",

    // Customer details
    customerName: arrangement?.customerName ?? "",
    phoneNumber: arrangement?.phoneNumber ?? "",

    // Payment details
    totalAmount: arrangement?.amount ?? "",
    scheduledDate: arrangement?.scheduledDate ?? new Date().toISOString().slice(0, 10),
    scheduledTime: arrangement?.scheduledTime ?? "",
    notes: arrangement?.notes ?? "",
    status: arrangement?.status ?? "Scheduled" as ArrangementStatus,

    // Previous payments (made before creating arrangement)
    previousPayments: [] as PreviousPayment[],

    // Optional recurring setup
    isRecurring: false,
    recurrenceType: 'weekly' as 'weekly' | 'biweekly' | 'monthly',
    recurrenceInterval: 1,
    totalPayments: 4,
  });

  const [formErrors, setFormErrors] = React.useState<{
    amount?: string;
    address?: string;
  }>({});

  // Collapsible sections state with localStorage persistence
  const [collapsed, setCollapsed] = React.useState(() => {
    try {
      const saved = localStorage.getItem('uaf-collapsed-sections');
      return saved ? JSON.parse(saved) : {
        previousPayments: false,
        recurringPayments: true
      };
    } catch {
      return { previousPayments: false, recurringPayments: true };
    }
  });

  // Confirmation preview state
  const [showConfirmation, setShowConfirmation] = React.useState(false);

  // Save collapse preferences to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem('uaf-collapsed-sections', JSON.stringify(collapsed));
    } catch (e) {
      console.error('Failed to save collapse preferences:', e);
    }
  }, [collapsed]);

  const toggleCollapse = (section: string) => {
    setCollapsed((prev: any) => ({ ...prev, [section]: !prev[section] }));
  };

  // Calculate derived values
  const totalPreviousPayments = formData.previousPayments.reduce(
    (sum, payment) => sum + parseFloat(payment.amount || '0'), 0
  );

  const totalAmountValue = parseFloat(formData.totalAmount || '0');
  const remainingAmount = totalAmountValue - totalPreviousPayments;
  const hasPreviousPayments = formData.previousPayments.length > 0;

  // Sort payments chronologically
  const sortedPreviousPayments = React.useMemo(() => {
    return [...formData.previousPayments].sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [formData.previousPayments]);

  // Calculate payment timeline for recurring payments
  const paymentTimeline = React.useMemo(() => {
    if (!formData.isRecurring || formData.totalPayments < 2) return [];

    const dates: string[] = [];
    const startDate = parseISO(formData.scheduledDate);

    for (let i = 0; i < formData.totalPayments; i++) {
      let nextDate = startDate;

      if (formData.recurrenceType === 'weekly') {
        nextDate = addWeeks(startDate, i * formData.recurrenceInterval);
      } else if (formData.recurrenceType === 'biweekly') {
        nextDate = addWeeks(startDate, i * 2);
      } else if (formData.recurrenceType === 'monthly') {
        nextDate = addMonths(startDate, i * formData.recurrenceInterval);
      }

      dates.push(format(nextDate, 'MMM d, yyyy'));
    }

    return dates;
  }, [formData.isRecurring, formData.scheduledDate, formData.recurrenceType, formData.recurrenceInterval, formData.totalPayments]);

  // Calculate completion percentage for recurring payments
  const completionPercentage = React.useMemo(() => {
    if (!arrangement || !arrangement.recurrenceType || arrangement.recurrenceType === 'none') {
      return 0;
    }
    const made = arrangement.paymentsMade || 0;
    const total = arrangement.totalPayments || 1;
    return Math.round((made / total) * 100);
  }, [arrangement]);

  // Initialize form data when arrangement changes
  React.useEffect(() => {
    if (arrangement) {
      const isValidIndex = arrangement.addressIndex >= 0 && arrangement.addressIndex < state.addresses.length;
      const currentAddress = isValidIndex ? state.addresses[arrangement.addressIndex]?.address : null;
      const originalAddress = arrangement.address;
      const addressMatches = currentAddress === originalAddress;

      if (!isValidIndex || !addressMatches) {
        setAddressMode("manual");
        setFormData(prev => ({
          ...prev,
          addressIndex: 0,
          manualAddress: originalAddress,
          customerName: arrangement.customerName ?? "",
          phoneNumber: arrangement.phoneNumber ?? "",
          totalAmount: arrangement.amount ?? "",
          scheduledDate: arrangement.scheduledDate,
          scheduledTime: arrangement.scheduledTime ?? "",
          notes: arrangement.notes ?? "",
          status: arrangement.status,
        }));
      } else {
        setAddressMode("existing");
        setFormData(prev => ({
          ...prev,
          addressIndex: arrangement.addressIndex,
          manualAddress: "",
          customerName: arrangement.customerName ?? "",
          phoneNumber: arrangement.phoneNumber ?? "",
          totalAmount: arrangement.amount ?? "",
          scheduledDate: arrangement.scheduledDate,
          scheduledTime: arrangement.scheduledTime ?? "",
          notes: arrangement.notes ?? "",
          status: arrangement.status,
        }));
      }

      // Set recurring flag based on existing arrangement
      if (arrangement.recurrenceType && arrangement.recurrenceType !== "none") {
        setFormData(prev => ({ ...prev, isRecurring: true }));
      }
    }
  }, [arrangement, state.addresses]);

  // Validation
  const validateAmount = (value: string) => {
    const amt = parseFloat(value || '0');
    if (!value || Number.isNaN(amt) || amt <= 0) {
      setFormErrors(prev => ({ ...prev, amount: 'Please enter a valid total amount' }));
      return false;
    }
    setFormErrors(prev => ({ ...prev, amount: undefined }));
    return true;
  };

  const validateForm = () => {
    let isValid = true;

    if (!validateAmount(formData.totalAmount)) {
      isValid = false;
    }

    // Validate that remaining amount is positive
    if (remainingAmount < 0) {
      setFormErrors(prev => ({ ...prev, amount: 'Previous payments exceed total amount' }));
      isValid = false;
    }

    if (addressMode === "existing" && state.addresses.length === 0) {
      setFormErrors(prev => ({ ...prev, address: 'No addresses available' }));
      isValid = false;
    }

    if (addressMode === "manual" && !formData.manualAddress.trim()) {
      setFormErrors(prev => ({ ...prev, address: 'Please enter an address' }));
      isValid = false;
    }

    return isValid;
  };

  // Add previous payment
  const addPreviousPayment = () => {
    const payment: PreviousPayment = {
      id: `previous_${Date.now()}`,
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      notes: ''
    };
    setFormData(prev => ({
      ...prev,
      previousPayments: [...prev.previousPayments, payment]
    }));
  };

  // Update previous payment
  const updatePreviousPayment = (id: string, updates: Partial<PreviousPayment>) => {
    setFormData(prev => ({
      ...prev,
      previousPayments: prev.previousPayments.map(payment =>
        payment.id === id ? { ...payment, ...updates } : payment
      )
    }));
  };

  // Remove previous payment
  const removePreviousPayment = (id: string) => {
    setFormData(prev => ({
      ...prev,
      previousPayments: prev.previousPayments.filter(payment => payment.id !== id)
    }));
  };

  // Handle form submission - show confirmation first
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isSubmitting || isLoading) return;

    if (!validateForm()) return;

    // Show confirmation preview
    setShowConfirmation(true);
  };

  // Actually submit after confirmation
  const confirmAndSubmit = async () => {
    setShowConfirmation(false);

    setIsSubmitting(true);

    try {
      let finalAddressIndex = formData.addressIndex;
      let finalAddress = "";

      // Handle address selection
      if (addressMode === "existing") {
        const selectedAddress = state.addresses[formData.addressIndex];
        if (!selectedAddress) {
          throw new Error('Selected address is not valid');
        }

        if (formData.addressIndex < 0 || formData.addressIndex >= state.addresses.length) {
          const foundIndex = state.addresses.findIndex(addr =>
            addr.address.toLowerCase().trim() === selectedAddress.address.toLowerCase().trim()
          );
          if (foundIndex >= 0) {
            finalAddressIndex = foundIndex;
            finalAddress = state.addresses[foundIndex].address;
          } else {
            throw new Error('Selected address is no longer available');
          }
        } else {
          finalAddress = selectedAddress.address;
        }
      } else {
        // Manual address mode
        const existingIndex = state.addresses.findIndex(
          addr => addr.address.toLowerCase().trim() === formData.manualAddress.toLowerCase().trim()
        );

        if (existingIndex >= 0) {
          finalAddressIndex = existingIndex;
          finalAddress = state.addresses[existingIndex].address;
        } else {
          if (!onAddAddress) {
            throw new Error('Cannot add new addresses');
          }

          const newAddressRow: AddressRow = {
            address: formData.manualAddress.trim(),
            lat: null,
            lng: null
          };

          finalAddressIndex = await onAddAddress(newAddressRow);
          finalAddress = newAddressRow.address;
        }
      }

      // Create arrangement data for remaining amount
      const arrangementAmount = remainingAmount > 0 ? remainingAmount : totalAmountValue;
      let actualAmount = arrangementAmount;

      // If recurring, split remaining amount across payments
      if (formData.isRecurring && formData.totalPayments > 1) {
        actualAmount = arrangementAmount / formData.totalPayments;
      }

      const arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'> = {
        addressIndex: finalAddressIndex,
        address: finalAddress,
        customerName: formData.customerName,
        phoneNumber: formData.phoneNumber,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
        amount: actualAmount.toFixed(2),
        notes: formData.notes,
        status: formData.status,
        recurrenceType: formData.isRecurring ? formData.recurrenceType : "none",
        recurrenceInterval: formData.isRecurring ? formData.recurrenceInterval : undefined,
        totalPayments: formData.isRecurring ? formData.totalPayments : 1,
        paymentsMade: arrangement?.paymentsMade ?? 0,
      };

      await onSave(arrangementData);

      // Record previous payments as completions
      for (const payment of formData.previousPayments) {
        if (parseFloat(payment.amount) > 0) {
          try {
            onComplete(finalAddressIndex, "PIF", payment.amount);
          } catch (error) {
            console.error('Error recording previous payment:', error);
          }
        }
      }

    } catch (error) {
      console.error('Error saving arrangement:', error);
      alert(`Failed to save arrangement: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Escape key handler for fullscreen mode
  React.useEffect(() => {
    if (!fullscreen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen, onCancel]);

  const formContent = (
    <form onSubmit={handleSubmit} className="uaf-form">
      {/* Header */}
      <div className="uaf-header">
        <h3 className="uaf-title">
          {arrangement ? "✏️ Edit Payment Arrangement" : "➕ Create Payment Arrangement"}
        </h3>
        {fullscreen && (
          <button
            type="button"
            className="uaf-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* Address Section */}
      <div className="uaf-section">
        <h4 className="uaf-section-title">📍 Address & Customer</h4>

        {!arrangement && (
          <div className="uaf-field">
            <label className="uaf-label">Address Source</label>
            <div className="uaf-radio-group">
              <label className="uaf-radio-option">
                <input
                  type="radio"
                  checked={addressMode === "existing"}
                  onChange={() => setAddressMode("existing")}
                />
                <span>📋 From List</span>
              </label>
              <label className="uaf-radio-option">
                <input
                  type="radio"
                  checked={addressMode === "manual"}
                  onChange={() => setAddressMode("manual")}
                />
                <span>✏️ Enter Manually</span>
              </label>
            </div>
          </div>
        )}

        {addressMode === "existing" ? (
          <div className="uaf-field">
            <label className="uaf-label">Address *</label>
            {state.addresses.length === 0 ? (
              <div className="uaf-warning">
                ⚠️ No addresses in your list. Switch to "Enter Manually" to add a new address.
              </div>
            ) : (
              <select
                value={formData.addressIndex}
                onChange={(e) => setFormData(prev => ({ ...prev, addressIndex: parseInt(e.target.value) }))}
                className="uaf-input"
                required
              >
                {state.addresses.map((addr, idx) => (
                  <option key={idx} value={idx}>
                    #{idx + 1} - {addr.address}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div className="uaf-field">
            <label className="uaf-label">Address *</label>
            <input
              type="text"
              value={formData.manualAddress}
              onChange={(e) => setFormData(prev => ({ ...prev, manualAddress: e.target.value }))}
              className="uaf-input"
              placeholder="Enter full address"
              required
            />
            <div className="uaf-hint">
              💡 If this address doesn't exist in your list, it will be automatically added.
            </div>
          </div>
        )}

        <div className="uaf-row">
          <div className="uaf-field">
            <label className="uaf-label">Customer Name</label>
            <input
              type="text"
              value={formData.customerName}
              onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
              className="uaf-input"
              placeholder="Customer name"
            />
          </div>
          <div className="uaf-field">
            <label className="uaf-label">Phone Number</label>
            <input
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
              className="uaf-input"
              placeholder="Phone number"
            />
          </div>
        </div>
      </div>

      {/* Payment Setup Section */}
      <div className="uaf-section">
        <h4 className="uaf-section-title">💰 Payment Details</h4>

        <div className="uaf-row">
          <div className="uaf-field">
            <label className="uaf-label">Total Amount Owed *</label>
            <div className="uaf-amount-input-wrapper">
              <span className="uaf-amount-symbol">£</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.totalAmount}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, totalAmount: e.target.value }));
                  validateAmount(e.target.value);
                }}
                className={`uaf-input uaf-amount-input ${formErrors.amount ? 'uaf-input-error' : ''}`}
                placeholder="0.00"
                required
              />
            </div>
            {formErrors.amount && (
              <div className="uaf-error">{formErrors.amount}</div>
            )}
          </div>
          <div className="uaf-field">
            <label className="uaf-label">Due Date *</label>
            <input
              type="date"
              value={formData.scheduledDate}
              onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
              className="uaf-input"
              required
            />
          </div>
        </div>

        <div className="uaf-field">
          <label className="uaf-label">Time (Optional)</label>
          <input
            type="time"
            value={formData.scheduledTime}
            onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
            className="uaf-input"
          />
        </div>
      </div>

      {/* Previous Payments Section - Collapsible */}
      <div className="uaf-section">
        <div className="uaf-section-header uaf-section-header-collapsible" onClick={() => toggleCollapse('previousPayments')}>
          <h4 className="uaf-section-title">
            <span className="uaf-collapse-icon">{collapsed.previousPayments ? '▶' : '▼'}</span>
            💳 Payments Already Made {hasPreviousPayments && `(${formData.previousPayments.length})`}
          </h4>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addPreviousPayment();
            }}
            className="uaf-btn uaf-btn-sm uaf-btn-outline"
          >
            + Add Payment
          </button>
        </div>

        {!collapsed.previousPayments && (
          <>
            {formData.previousPayments.length === 0 ? (
              <div className="uaf-empty">
                No previous payments recorded yet.
              </div>
            ) : (
              <div className="uaf-payments-list">
                {sortedPreviousPayments.map((payment) => (
              <div key={payment.id} className="uaf-payment-item">
                <div className="uaf-row">
                  <div className="uaf-field">
                    <label className="uaf-label">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={payment.amount}
                      onChange={(e) => updatePreviousPayment(payment.id, { amount: e.target.value })}
                      className="uaf-input"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="uaf-field">
                    <label className="uaf-label">Date Paid</label>
                    <input
                      type="date"
                      value={payment.date}
                      onChange={(e) => updatePreviousPayment(payment.id, { date: e.target.value })}
                      className="uaf-input"
                    />
                  </div>
                  <div className="uaf-field uaf-field-actions">
                    <button
                      type="button"
                      onClick={() => removePreviousPayment(payment.id)}
                      className="uaf-btn uaf-btn-sm uaf-btn-danger"
                      title="Remove payment"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="uaf-field">
                  <input
                    type="text"
                    value={payment.notes || ''}
                    onChange={(e) => updatePreviousPayment(payment.id, { notes: e.target.value })}
                    className="uaf-input"
                    placeholder="Payment notes (optional)"
                  />
                </div>
              </div>
            ))}
              </div>
            )}

            {hasPreviousPayments && (
          <div className="uaf-payment-summary">
            <div className="uaf-summary-row">
              <span>Total Amount Owed:</span>
              <span>£{parseFloat(formData.totalAmount || '0').toFixed(2)}</span>
            </div>
            <div className="uaf-summary-row">
              <span>Already Paid:</span>
              <span>-£{totalPreviousPayments.toFixed(2)}</span>
            </div>
              <div className="uaf-summary-row uaf-summary-total">
                <span>Still Owed:</span>
                <span>£{Math.max(0, remainingAmount).toFixed(2)}</span>
              </div>
            </div>
            )}
          </>
        )}
      </div>

      {/* Optional Recurring Setup - Collapsible */}
      {remainingAmount > 0 && (
        <div className="uaf-section">
          <div className="uaf-section-header uaf-section-header-collapsible" onClick={() => toggleCollapse('recurringPayments')}>
            <h4 className="uaf-section-title">
              <span className="uaf-collapse-icon">{collapsed.recurringPayments ? '▶' : '▼'}</span>
              🔄 Optional: Split Remaining Balance
            </h4>
          </div>

          {!collapsed.recurringPayments && (
            <>
              <div className="uaf-field">
                <label className="uaf-radio-option">
                  <input
                    type="checkbox"
                    checked={formData.isRecurring}
                    onChange={(e) => setFormData(prev => ({ ...prev, isRecurring: e.target.checked }))}
                  />
                  <span>Split £{remainingAmount.toFixed(2)} into multiple payments</span>
                </label>
              </div>

              {formData.isRecurring && (
                <>
                  <div className="uaf-row">
                    <div className="uaf-field">
                      <label className="uaf-label">Frequency</label>
                      <select
                        value={formData.recurrenceType}
                        onChange={(e) => setFormData(prev => ({ ...prev, recurrenceType: e.target.value as 'weekly' | 'biweekly' | 'monthly' }))}
                        className="uaf-input"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div className="uaf-field">
                      <label className="uaf-label">Number of Payments</label>
                      <input
                        type="number"
                        min="2"
                        max="12"
                        value={formData.totalPayments}
                        onChange={(e) => setFormData(prev => ({ ...prev, totalPayments: parseInt(e.target.value) || 2 }))}
                        className="uaf-input"
                      />
                    </div>
                  </div>

                  <div className="uaf-payment-preview">
                    💡 {formData.totalPayments} payments of £{(remainingAmount / formData.totalPayments).toFixed(2)} each
                  </div>

                  {/* Visual Timeline */}
                  {paymentTimeline.length > 0 && (
                    <div className="uaf-timeline">
                      <div className="uaf-timeline-title">📅 Payment Schedule:</div>
                      <div className="uaf-timeline-dates">
                        {paymentTimeline.map((date, index) => (
                          <div key={index} className="uaf-timeline-item">
                            <span className="uaf-timeline-number">{index + 1}</span>
                            <span className="uaf-timeline-date">{date}</span>
                            <span className="uaf-timeline-amount">£{(remainingAmount / formData.totalPayments).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completion Percentage for Editing Existing Arrangements */}
                  {arrangement && arrangement.recurrenceType && arrangement.recurrenceType !== 'none' && (
                    <div className="uaf-completion-progress">
                      <div className="uaf-completion-header">
                        <span>Payment Progress</span>
                        <span className="uaf-completion-text">
                          {arrangement.paymentsMade || 0} of {arrangement.totalPayments || 1} ({completionPercentage}%)
                        </span>
                      </div>
                      <div className="uaf-completion-bar">
                        <div
                          className="uaf-completion-fill"
                          style={{ width: `${completionPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Notes Section */}
      <div className="uaf-section">
        <div className="uaf-field">
          <label className="uaf-label">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            className="uaf-input uaf-textarea"
            rows={3}
            placeholder="Payment terms, special instructions, etc..."
          />
        </div>
      </div>

      {/* Actions */}
      <div className="uaf-actions">
        <button type="button" className="uaf-btn uaf-btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <LoadingButton
          type="submit"
          className="uaf-btn uaf-btn-primary"
          isLoading={isLoading || isSubmitting}
          loadingText={arrangement ? "Updating..." : "Creating..."}
          disabled={addressMode === "existing" && state.addresses.length === 0}
        >
          {arrangement ? "💾 Update" : "📅 Review & Create"} Arrangement
        </LoadingButton>
      </div>

      {/* Confirmation Preview Modal */}
      {showConfirmation && (
        <div className="uaf-confirmation-overlay" onClick={() => setShowConfirmation(false)}>
          <div className="uaf-confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="uaf-confirmation-header">
              <h3>✅ Confirm Arrangement Details</h3>
            </div>

            <div className="uaf-confirmation-body">
              <div className="uaf-confirmation-section">
                <div className="uaf-confirmation-label">📍 Address</div>
                <div className="uaf-confirmation-value">
                  {addressMode === "existing"
                    ? state.addresses[formData.addressIndex]?.address
                    : formData.manualAddress}
                </div>
              </div>

              {formData.customerName && (
                <div className="uaf-confirmation-section">
                  <div className="uaf-confirmation-label">👤 Customer</div>
                  <div className="uaf-confirmation-value">{formData.customerName}</div>
                </div>
              )}

              <div className="uaf-confirmation-section">
                <div className="uaf-confirmation-label">💰 Total Amount</div>
                <div className="uaf-confirmation-value uaf-confirmation-amount">
                  £{parseFloat(formData.totalAmount || '0').toFixed(2)}
                </div>
              </div>

              {hasPreviousPayments && (
                <>
                  <div className="uaf-confirmation-section">
                    <div className="uaf-confirmation-label">💳 Previous Payments</div>
                    <div className="uaf-confirmation-value">
                      £{totalPreviousPayments.toFixed(2)} ({formData.previousPayments.length} payment{formData.previousPayments.length > 1 ? 's' : ''})
                    </div>
                  </div>
                  <div className="uaf-confirmation-section">
                    <div className="uaf-confirmation-label">📊 Remaining Balance</div>
                    <div className="uaf-confirmation-value uaf-confirmation-highlight">
                      £{remainingAmount.toFixed(2)}
                    </div>
                  </div>
                </>
              )}

              <div className="uaf-confirmation-section">
                <div className="uaf-confirmation-label">📅 Payment Due</div>
                <div className="uaf-confirmation-value">
                  {format(parseISO(formData.scheduledDate), 'MMMM d, yyyy')}
                  {formData.scheduledTime && ` at ${formData.scheduledTime}`}
                </div>
              </div>

              {formData.isRecurring && (
                <>
                  <div className="uaf-confirmation-section">
                    <div className="uaf-confirmation-label">🔄 Payment Plan</div>
                    <div className="uaf-confirmation-value">
                      {formData.totalPayments} {formData.recurrenceType} payments of £{(remainingAmount / formData.totalPayments).toFixed(2)}
                    </div>
                  </div>
                  <div className="uaf-confirmation-timeline">
                    <div className="uaf-confirmation-label">📅 Schedule:</div>
                    <div className="uaf-confirmation-dates">
                      {paymentTimeline.slice(0, 3).map((date, i) => (
                        <span key={i}>{date}</span>
                      ))}
                      {paymentTimeline.length > 3 && <span>+ {paymentTimeline.length - 3} more...</span>}
                    </div>
                  </div>
                </>
              )}

              {formData.notes && (
                <div className="uaf-confirmation-section">
                  <div className="uaf-confirmation-label">📝 Notes</div>
                  <div className="uaf-confirmation-value">{formData.notes}</div>
                </div>
              )}
            </div>

            <div className="uaf-confirmation-actions">
              <button
                type="button"
                className="uaf-btn uaf-btn-ghost"
                onClick={() => setShowConfirmation(false)}
              >
                ← Back to Edit
              </button>
              <LoadingButton
                type="button"
                className="uaf-btn uaf-btn-success"
                isLoading={isSubmitting}
                loadingText="Creating..."
                onClick={confirmAndSubmit}
              >
                ✅ Confirm & Create
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </form>
  );

  // Styles component to avoid duplication
  const styles = (
    <style>{`
        /* Unified Arrangement Form Styles */
        .uaf-container {
          background: var(--card-bg, white);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          overflow: hidden;
        }

        .uaf-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 4000;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 1rem;
          backdrop-filter: blur(4px);
          overflow-y: auto;
          padding-top: 2rem;
        }

        .uaf-modal {
          background: var(--card-bg, white);
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 700px;
          max-height: 90vh;
          overflow-y: auto;
          margin: 0 auto;
        }

        .uaf-form {
          padding: 1.5rem;
          color: var(--text-primary);
        }

        .uaf-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border, #e2e8f0);
        }

        .uaf-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .uaf-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          padding: 0.5rem;
          border-radius: 8px;
          cursor: pointer;
          color: var(--text-muted);
          line-height: 1;
        }

        .uaf-close:hover {
          background: var(--gray-100);
        }

        .uaf-section {
          margin-bottom: 1.5rem;
          padding: 0;
          background: transparent;
          border-radius: 0;
          border: none;
          border-bottom: 1px solid var(--border, #e2e8f0);
          padding-bottom: 1.5rem;
        }

        .uaf-section:last-of-type {
          border-bottom: none;
          padding-bottom: 0;
        }

        .uaf-section-title {
          margin: 0 0 1rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .uaf-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .uaf-field {
          margin-bottom: 1rem;
        }

        .uaf-field-actions {
          display: flex;
          align-items: flex-end;
        }

        .uaf-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .uaf-input {
          width: 100%;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 6px;
          padding: 0.75rem;
          font-size: 14px;
          background: var(--input-bg, white);
          color: var(--text-primary);
          transition: border-color 0.15s ease;
        }

        .uaf-input:focus {
          outline: none;
          border-color: var(--primary, #0ea5e9);
          box-shadow: 0 0 0 3px rgba(14,165,233,0.1);
        }

        .uaf-input-error {
          border-color: var(--danger, #dc2626);
        }

        .uaf-textarea {
          resize: vertical;
          min-height: 80px;
        }

        .uaf-error {
          color: var(--danger, #dc2626);
          font-size: 0.8125rem;
          margin-top: 0.25rem;
        }

        .uaf-warning {
          padding: 0.75rem;
          background: var(--warning-light, #fef3c7);
          border: 1px solid var(--warning, #f59e0b);
          border-radius: 6px;
          color: var(--warning-dark, #92400e);
          font-size: 0.875rem;
        }

        .uaf-hint {
          font-size: 0.8125rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
        }

        .uaf-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          align-items: start;
        }

        .uaf-radio-group {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .uaf-radio-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.5rem 1rem;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 6px;
          background: var(--input-bg, white);
          transition: all 0.15s ease;
        }

        .uaf-radio-option:hover {
          border-color: var(--primary, #0ea5e9);
        }

        .uaf-radio-option input[type="radio"] {
          margin: 0;
        }

        .uaf-radio-option input[type="radio"]:checked + span {
          font-weight: 600;
          color: var(--primary, #0ea5e9);
        }

        .uaf-payment-preview {
          padding: 0.75rem;
          background: var(--blue-50, #eff6ff);
          border: 1px solid var(--blue-200, #bfdbfe);
          border-radius: 6px;
          color: var(--blue-700, #1d4ed8);
          font-size: 0.875rem;
          font-weight: 500;
        }

        .uaf-empty {
          text-align: center;
          padding: 2rem;
          color: var(--text-muted);
          font-style: italic;
        }

        .uaf-payments-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .uaf-payment-item {
          padding: 1rem;
          background: var(--input-bg, white);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 6px;
        }

        .uaf-payment-summary {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--gray-50, #f9fafb);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 6px;
        }

        .uaf-summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .uaf-summary-total {
          border-top: 1px solid var(--border, #e2e8f0);
          padding-top: 0.5rem;
          margin-top: 0.5rem;
          font-weight: 600;
          font-size: 1rem;
          color: var(--success-dark, #059669);
        }

        .uaf-actions {
          display: flex;
          gap: 0.75rem;
          justify-content: flex-end;
          padding-top: 1rem;
          border-top: 1px solid var(--border, #e2e8f0);
        }

        .uaf-btn {
          border-radius: 6px;
          padding: 0.75rem 1.5rem;
          font-weight: 500;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.15s ease;
          font-size: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .uaf-btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
        }

        .uaf-btn-ghost {
          background: var(--card-bg, white);
          border-color: var(--border, #e2e8f0);
          color: var(--text-primary);
        }

        .uaf-btn-ghost:hover {
          background: var(--gray-100, #f3f4f6);
        }

        .uaf-btn-primary {
          background: var(--primary, #0ea5e9);
          color: white;
          border-color: var(--primary, #0ea5e9);
        }

        .uaf-btn-primary:hover {
          background: var(--primary-dark, #0284c7);
        }

        .uaf-btn-outline {
          background: transparent;
          border-color: var(--primary, #0ea5e9);
          color: var(--primary, #0ea5e9);
        }

        .uaf-btn-outline:hover {
          background: var(--primary, #0ea5e9);
          color: white;
        }

        .uaf-btn-danger {
          background: var(--danger, #dc2626);
          color: white;
          border-color: var(--danger, #dc2626);
        }

        .uaf-btn-danger:hover {
          background: var(--danger-dark, #b91c1c);
        }

        .uaf-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .uaf-btn-success {
          background: var(--success, #10b981);
          color: white;
          border-color: var(--success, #10b981);
        }

        .uaf-btn-success:hover {
          background: var(--success-dark, #059669);
        }

        /* Collapsible Section Styles */
        .uaf-section-header-collapsible {
          cursor: pointer;
          user-select: none;
        }

        .uaf-section-header-collapsible:hover {
          background: var(--gray-50, #f9fafb);
          border-radius: 6px;
          margin: -0.5rem;
          padding: 0.5rem;
        }

        .uaf-collapse-icon {
          display: inline-block;
          margin-right: 0.5rem;
          font-size: 0.75rem;
          transition: transform 0.2s ease;
        }

        /* Amount Input with £ Symbol */
        .uaf-amount-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .uaf-amount-symbol {
          position: absolute;
          left: 0.75rem;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--success, #10b981);
          z-index: 1;
          pointer-events: none;
        }

        .uaf-amount-input {
          padding-left: 2rem !important;
          font-weight: 600;
          color: var(--success-dark, #059669);
          border-color: var(--success-light, #a7f3d0) !important;
          background: var(--success-lighter, #f0fdf4) !important;
        }

        .uaf-amount-input:focus {
          border-color: var(--success, #10b981) !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1) !important;
        }

        /* Timeline Styles */
        .uaf-timeline {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--gray-50, #f9fafb);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 6px;
        }

        .uaf-timeline-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
        }

        .uaf-timeline-dates {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .uaf-timeline-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          background: white;
          border-radius: 4px;
          border-left: 3px solid var(--primary, #0ea5e9);
        }

        .uaf-timeline-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.5rem;
          height: 1.5rem;
          background: var(--primary, #0ea5e9);
          color: white;
          border-radius: 50%;
          font-size: 0.75rem;
          font-weight: 600;
          flex-shrink: 0;
        }

        .uaf-timeline-date {
          flex: 1;
          font-size: 0.875rem;
          color: var(--text-primary);
        }

        .uaf-timeline-amount {
          font-weight: 600;
          color: var(--success-dark, #059669);
          font-size: 0.875rem;
        }

        /* Completion Progress Bar */
        .uaf-completion-progress {
          margin-top: 1rem;
          padding: 1rem;
          background: var(--blue-50, #eff6ff);
          border: 1px solid var(--blue-200, #bfdbfe);
          border-radius: 6px;
        }

        .uaf-completion-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--blue-700, #1d4ed8);
        }

        .uaf-completion-text {
          font-size: 0.8125rem;
        }

        .uaf-completion-bar {
          width: 100%;
          height: 0.5rem;
          background: var(--blue-100, #dbeafe);
          border-radius: 1rem;
          overflow: hidden;
        }

        .uaf-completion-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--success, #10b981), var(--primary, #0ea5e9));
          transition: width 0.3s ease;
          border-radius: 1rem;
        }

        /* Confirmation Modal Styles */
        .uaf-confirmation-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          z-index: 5000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .uaf-confirmation-modal {
          background: var(--card-bg, white);
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          width: 100%;
          max-width: 550px;
          max-height: 85vh;
          overflow-y: auto;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .uaf-confirmation-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border, #e2e8f0);
          background: var(--gray-50, #f9fafb);
        }

        .uaf-confirmation-header h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .uaf-confirmation-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .uaf-confirmation-section {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .uaf-confirmation-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .uaf-confirmation-value {
          font-size: 1rem;
          color: var(--text-primary);
          font-weight: 500;
        }

        .uaf-confirmation-amount {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--success-dark, #059669);
        }

        .uaf-confirmation-highlight {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--primary, #0ea5e9);
        }

        .uaf-confirmation-timeline {
          padding: 1rem;
          background: var(--gray-50, #f9fafb);
          border-radius: 6px;
          border: 1px solid var(--border, #e2e8f0);
        }

        .uaf-confirmation-dates {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .uaf-confirmation-dates span {
          padding: 0.25rem 0.75rem;
          background: var(--primary-light, #e0f2fe);
          color: var(--primary-dark, #0369a1);
          border-radius: 4px;
          font-size: 0.8125rem;
          font-weight: 500;
        }

        .uaf-confirmation-actions {
          display: flex;
          gap: 0.75rem;
          padding: 1.5rem;
          border-top: 1px solid var(--border, #e2e8f0);
          background: var(--gray-50, #f9fafb);
        }

        .uaf-confirmation-actions .uaf-btn {
          flex: 1;
        }

        /* Dark mode styles */
        .dark-mode .uaf-container,
        .dark-mode .uaf-modal {
          background: var(--gray-100);
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-section {
          background: transparent;
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-payment-item {
          background: var(--gray-100);
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-payment-summary {
          background: var(--gray-300);
          border-color: var(--gray-400);
        }

        .dark-mode .uaf-input {
          background: var(--gray-100);
          border-color: var(--gray-300);
          color: var(--gray-800);
        }

        .dark-mode .uaf-radio-option {
          background: var(--gray-100);
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-payment-preview {
          background: var(--blue-100);
          border-color: var(--blue-300);
          color: var(--blue-800);
        }

        .dark-mode .uaf-warning {
          background: var(--yellow-100);
          border-color: var(--yellow-400);
          color: var(--yellow-800);
        }

        /* Dark mode for new components */
        .dark-mode .uaf-amount-input {
          background: var(--success-lighter, #ecfdf5) !important;
          color: var(--success-dark, #065f46);
        }

        .dark-mode .uaf-amount-symbol {
          color: var(--success-dark, #065f46);
        }

        .dark-mode .uaf-timeline {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-timeline-item {
          background: var(--gray-100);
        }

        .dark-mode .uaf-completion-progress {
          background: var(--blue-100);
          border-color: var(--blue-300);
        }

        .dark-mode .uaf-confirmation-overlay {
          background: rgba(0, 0, 0, 0.75);
        }

        .dark-mode .uaf-confirmation-modal {
          background: var(--gray-100);
        }

        .dark-mode .uaf-confirmation-header {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-confirmation-header h3 {
          color: var(--gray-800);
        }

        .dark-mode .uaf-confirmation-label {
          color: var(--gray-600);
        }

        .dark-mode .uaf-confirmation-value {
          color: var(--gray-800);
        }

        .dark-mode .uaf-confirmation-timeline {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-confirmation-actions {
          background: var(--gray-200);
          border-color: var(--gray-300);
        }

        @media (max-width: 768px) {
          .uaf-modal {
            margin: 0.5rem;
            max-width: none;
          }

          .uaf-row {
            grid-template-columns: 1fr;
          }

          .uaf-radio-group {
            flex-direction: column;
          }

          .uaf-actions {
            flex-direction: column-reverse;
          }

          .uaf-btn {
            width: 100%;
          }
        }
      `}</style>
  );

  if (fullscreen) {
    return (
      <>
        <div
          ref={overlayRef}
          className="uaf-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onCancel();
            }
          }}
        >
          <div className="uaf-modal">
            {formContent}
          </div>
        </div>
        {styles}
      </>
    );
  }

  return (
    <>
      <div className="uaf-container">
        {formContent}
      </div>
      {styles}
    </>
  );
}