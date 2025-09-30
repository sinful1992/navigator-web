import React from 'react';
import type { AppState, Arrangement, ArrangementStatus, AddressRow, Outcome } from '../types';
import { LoadingButton } from './LoadingButton';

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
    recurrenceType: 'weekly' as 'weekly' | 'monthly',
    recurrenceInterval: 1,
    totalPayments: 4,
  });

  const [formErrors, setFormErrors] = React.useState<{
    amount?: string;
    address?: string;
  }>({});

  // Calculate derived values
  const totalPreviousPayments = formData.previousPayments.reduce(
    (sum, payment) => sum + parseFloat(payment.amount || '0'), 0
  );

  const totalAmountValue = parseFloat(formData.totalAmount || '0');
  const remainingAmount = totalAmountValue - totalPreviousPayments;
  const hasPreviousPayments = formData.previousPayments.length > 0;

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

  // Handle form submission
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isSubmitting || isLoading) return;

    if (!validateForm()) return;

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
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.totalAmount}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, totalAmount: e.target.value }));
                validateAmount(e.target.value);
              }}
              className={`uaf-input ${formErrors.amount ? 'uaf-input-error' : ''}`}
              placeholder="0.00"
              required
            />
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

      {/* Previous Payments Section */}
      <div className="uaf-section">
        <div className="uaf-section-header">
          <h4 className="uaf-section-title">💳 Payments Already Made</h4>
          <button
            type="button"
            onClick={addPreviousPayment}
            className="uaf-btn uaf-btn-sm uaf-btn-outline"
          >
            + Add Payment
          </button>
        </div>

        {formData.previousPayments.length === 0 ? (
          <div className="uaf-empty">
            No previous payments recorded yet.
          </div>
        ) : (
          <div className="uaf-payments-list">
            {formData.previousPayments.map((payment) => (
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
      </div>

      {/* Optional Recurring Setup */}
      {remainingAmount > 0 && (
        <div className="uaf-section">
          <h4 className="uaf-section-title">🔄 Optional: Split Remaining Balance</h4>

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
                    onChange={(e) => setFormData(prev => ({ ...prev, recurrenceType: e.target.value as 'weekly' | 'monthly' }))}
                    className="uaf-input"
                  >
                    <option value="weekly">Weekly</option>
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
          {arrangement ? "💾 Update" : "📅 Create"} Arrangement
        </LoadingButton>
      </div>
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
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: var(--gray-25, #fafafa);
          border-radius: 8px;
          border: 1px solid var(--border, #e2e8f0);
        }

        .uaf-section-title {
          margin: 0 0 1rem 0;
          font-size: 1rem;
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

        /* Dark mode styles */
        .dark-mode .uaf-container,
        .dark-mode .uaf-modal {
          background: var(--gray-100);
          border-color: var(--gray-300);
        }

        .dark-mode .uaf-section {
          background: var(--gray-200);
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