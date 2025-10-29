import React from 'react';
import type { AppState, Arrangement, ArrangementStatus, AddressRow, Outcome } from '../types';
import { LoadingButton } from './LoadingButton';
import { addWeeks, addMonths, format, parseISO } from 'date-fns';
import { logger } from '../utils/logger';
// PHASE 4: Import form validators
import {
  validateArrangementAmount,
  validateManualAddress,
  groupValidationErrorsByField,
} from '../services/formValidators';

import './arrangementForm.css';

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
  onComplete: (index: number, outcome: Outcome, amount?: string, arrangementId?: string, caseReference?: string) => void;
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

    // Case details (NEW: Added case reference and number of cases)
    caseReference: "",
    numberOfCases: 1,

    // Payment details
    totalAmount: arrangement?.amount ?? "",
    scheduledDate: arrangement?.scheduledDate ?? new Date().toISOString().slice(0, 10),
    scheduledTime: arrangement?.scheduledTime ?? "",
    notes: arrangement?.notes ?? "",
    status: arrangement?.status ?? "Scheduled" as ArrangementStatus,

    // Previous payments (made before creating arrangement)
    previousPayments: [] as PreviousPayment[],

    // Payment schedule - single dropdown instead of checkbox + frequency
    paymentFrequency: 'single' as 'single' | 'weekly' | 'biweekly' | 'monthly',
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
      logger.error('Failed to save collapse preferences:', e);
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
    if (formData.paymentFrequency === 'single' || formData.totalPayments < 2) return [];

    const dates: string[] = [];
    const startDate = parseISO(formData.scheduledDate);

    for (let i = 0; i < formData.totalPayments; i++) {
      let nextDate = startDate;

      if (formData.paymentFrequency === 'weekly') {
        nextDate = addWeeks(startDate, i * formData.recurrenceInterval);
      } else if (formData.paymentFrequency === 'biweekly') {
        nextDate = addWeeks(startDate, i * 2);
      } else if (formData.paymentFrequency === 'monthly') {
        nextDate = addMonths(startDate, i * formData.recurrenceInterval);
      }

      dates.push(format(nextDate, 'MMM d, yyyy'));
    }

    return dates;
  }, [formData.paymentFrequency, formData.scheduledDate, formData.recurrenceInterval, formData.totalPayments]);

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

      // Set payment frequency based on existing arrangement
      if (arrangement.recurrenceType && arrangement.recurrenceType !== "none") {
        setFormData(prev => ({
          ...prev,
          paymentFrequency: arrangement.recurrenceType as 'weekly' | 'biweekly' | 'monthly'
        }));
      }
    }
  }, [arrangement, state.addresses]);

  // Validation - PHASE 4: Integrated with centralized validators
  const validateAmount = (value: string) => {
    const result = validateArrangementAmount(value);
    if (!result.success) {
      const errors = groupValidationErrorsByField(result);
      setFormErrors(prev => ({ ...prev, amount: errors.totalAmount?.[0] || 'Invalid amount' }));
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

    // PHASE 4: Use centralized validator for manual address
    if (addressMode === "manual") {
      const addressResult = validateManualAddress(formData.manualAddress);
      if (!addressResult.success) {
        const errors = groupValidationErrorsByField(addressResult);
        setFormErrors(prev => ({ ...prev, address: errors.address?.[0] || 'Invalid address' }));
        isValid = false;
      }
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

      // If recurring (not single payment), split remaining amount across payments
      const isRecurring = formData.paymentFrequency !== 'single';
      if (isRecurring && formData.totalPayments > 1) {
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
        recurrenceType: isRecurring ? (formData.paymentFrequency as 'weekly' | 'biweekly' | 'monthly') : "none",
        recurrenceInterval: isRecurring ? formData.recurrenceInterval : undefined,
        totalPayments: isRecurring ? formData.totalPayments : 1,
        paymentsMade: arrangement?.paymentsMade ?? 0,
      };

      await onSave(arrangementData);

      // Record previous payments as completions
      for (const payment of formData.previousPayments) {
        if (parseFloat(payment.amount) > 0) {
          try {
            onComplete(finalAddressIndex, "PIF", payment.amount);
          } catch (error) {
            logger.error('Error recording previous payment:', error);
          }
        }
      }

    } catch (error) {
      logger.error('Error saving arrangement:', error);
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

        <div className="uaf-row">
          <div className="uaf-field">
            <label className="uaf-label">Case Reference</label>
            <input
              type="text"
              value={formData.caseReference}
              onChange={(e) => setFormData(prev => ({ ...prev, caseReference: e.target.value }))}
              className="uaf-input"
              placeholder="e.g., CR-2025-1234"
            />
            <div className="uaf-hint">💡 Optional but recommended for tracking</div>
          </div>
          <div className="uaf-field">
            <label className="uaf-label">Number of Cases</label>
            <input
              type="number"
              min="1"
              value={formData.numberOfCases}
              onChange={(e) => setFormData(prev => ({ ...prev, numberOfCases: parseInt(e.target.value) || 1 }))}
              className="uaf-input"
              placeholder="1"
            />
            <div className="uaf-hint">💡 If 1 debtor has 3 linked cases, enter 3</div>
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

      {/* Payment Schedule Section */}
      {remainingAmount > 0 && (
        <div className="uaf-section">
          <div className="uaf-section-header">
            <h4 className="uaf-section-title">🔄 Payment Schedule</h4>
          </div>

          <div className="uaf-row">
            <div className="uaf-field">
              <label className="uaf-label">Payment Type *</label>
              <select
                value={formData.paymentFrequency}
                onChange={(e) => setFormData(prev => ({ ...prev, paymentFrequency: e.target.value as 'single' | 'weekly' | 'biweekly' | 'monthly' }))}
                className="uaf-input"
              >
                <option value="single">Single Payment (No Split)</option>
                <option value="weekly">Weekly Payments</option>
                <option value="biweekly">Bi-weekly Payments (Every 2 weeks)</option>
                <option value="monthly">Monthly Payments</option>
              </select>
            </div>

            {formData.paymentFrequency !== 'single' && (
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
            )}
          </div>

          {formData.paymentFrequency !== 'single' && (
            <>
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

              {formData.caseReference && (
                <div className="uaf-confirmation-section">
                  <div className="uaf-confirmation-label">📋 Case Reference</div>
                  <div className="uaf-confirmation-value">{formData.caseReference}</div>
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

              {formData.paymentFrequency !== 'single' && (
                <>
                  <div className="uaf-confirmation-section">
                    <div className="uaf-confirmation-label">🔄 Payment Plan</div>
                    <div className="uaf-confirmation-value">
                      {formData.totalPayments} {formData.paymentFrequency} payments of £{(remainingAmount / formData.totalPayments).toFixed(2)}
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

  if (fullscreen) {
    return (
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
    );
  }

  return (
    <div className="uaf-container">
      {formContent}
    </div>
  );
}
