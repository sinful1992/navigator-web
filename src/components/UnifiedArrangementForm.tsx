import React from 'react';
import type { AppState, Arrangement, ArrangementStatus, AddressRow, Outcome, PaymentInstalment } from '../types';
import { LoadingButton } from './LoadingButton';
import { addWeeks, addMonths, format, parseISO } from 'date-fns';
import { logger } from '../utils/logger';

import './arrangementFormWizard.css';

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

type WizardStep = 1 | 2 | 3;
type PaymentFrequency = 'single' | 'weekly' | 'biweekly' | 'monthly';

export default function UnifiedArrangementForm({
  state,
  arrangement,
  preSelectedAddressIndex,
  onSave,
  onCancel,
  isLoading = false,
  onComplete,
  fullscreen = false
}: Props) {
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState<WizardStep>(1);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Case Info
  // ═══════════════════════════════════════════════════════════════════════════
  const [addressMode, setAddressMode] = React.useState<"existing" | "manual">(
    preSelectedAddressIndex !== null && preSelectedAddressIndex !== undefined ? "existing" : "existing"
  );
  const [addressIndex, setAddressIndex] = React.useState(
    arrangement?.addressIndex ?? preSelectedAddressIndex ?? 0
  );
  const [manualAddress, setManualAddress] = React.useState("");
  const [caseReference, setCaseReference] = React.useState(arrangement?.caseReference ?? "");
  const [customerName, setCustomerName] = React.useState(arrangement?.customerName ?? "");
  const [phoneNumber, setPhoneNumber] = React.useState(arrangement?.phoneNumber ?? "");

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Amount
  // ═══════════════════════════════════════════════════════════════════════════
  const [totalAmount, setTotalAmount] = React.useState(
    arrangement?.totalAmountOwed?.toString() ?? arrangement?.amount ?? ""
  );
  const [previousPayments, setPreviousPayments] = React.useState<Array<{
    id: string;
    amount: string;
    date: string;
  }>>([]);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Payment Plan
  // ═══════════════════════════════════════════════════════════════════════════
  const [paymentFrequency, setPaymentFrequency] = React.useState<PaymentFrequency>('single');
  const [numberOfInstalments, setNumberOfInstalments] = React.useState(2);
  const [startDate, setStartDate] = React.useState(
    arrangement?.scheduledDate ?? new Date().toISOString().slice(0, 10)
  );
  const [instalments, setInstalments] = React.useState<PaymentInstalment[]>([]);
  const [notes, setNotes] = React.useState(arrangement?.notes ?? "");

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Calculate totals
  const totalAmountNum = parseFloat(totalAmount) || 0;
  const previousPaymentsTotal = previousPayments.reduce(
    (sum, p) => sum + (parseFloat(p.amount) || 0), 0
  );
  const remainingAmount = Math.max(0, totalAmountNum - previousPaymentsTotal);

  // ═══════════════════════════════════════════════════════════════════════════
  // Generate instalments when payment plan changes
  // ═══════════════════════════════════════════════════════════════════════════
  React.useEffect(() => {
    if (paymentFrequency === 'single' || remainingAmount <= 0) {
      // Single payment - just one instalment
      setInstalments([{
        id: 'inst_1',
        instalmentNumber: 1,
        scheduledDate: startDate,
        amount: remainingAmount,
        status: 'pending'
      }]);
      return;
    }

    const newInstalments: PaymentInstalment[] = [];
    const baseAmount = remainingAmount / numberOfInstalments;
    const start = parseISO(startDate);

    for (let i = 0; i < numberOfInstalments; i++) {
      let date = start;

      if (paymentFrequency === 'weekly') {
        date = addWeeks(start, i);
      } else if (paymentFrequency === 'biweekly') {
        date = addWeeks(start, i * 2);
      } else if (paymentFrequency === 'monthly') {
        date = addMonths(start, i);
      }

      newInstalments.push({
        id: `inst_${i + 1}`,
        instalmentNumber: i + 1,
        scheduledDate: format(date, 'yyyy-MM-dd'),
        amount: Math.round(baseAmount * 100) / 100, // Round to 2 decimal places
        status: 'pending'
      });
    }

    // Adjust last instalment for rounding errors
    const totalAllocated = newInstalments.reduce((sum, inst) => sum + inst.amount, 0);
    const diff = remainingAmount - totalAllocated;
    if (newInstalments.length > 0 && Math.abs(diff) > 0.001) {
      newInstalments[newInstalments.length - 1].amount += diff;
      newInstalments[newInstalments.length - 1].amount =
        Math.round(newInstalments[newInstalments.length - 1].amount * 100) / 100;
    }

    setInstalments(newInstalments);
  }, [paymentFrequency, numberOfInstalments, startDate, remainingAmount]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Handle instalment amount change with auto-recalculation
  // ═══════════════════════════════════════════════════════════════════════════
  const handleInstalmentAmountChange = (index: number, newAmount: string) => {
    const amount = parseFloat(newAmount) || 0;

    setInstalments(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], amount };

      // Recalculate remaining instalments to balance
      if (index < updated.length - 1) {
        const allocatedBefore = updated.slice(0, index + 1).reduce((sum, inst) => sum + inst.amount, 0);
        const remainingToAllocate = remainingAmount - allocatedBefore;
        const remainingInstalments = updated.length - index - 1;

        if (remainingInstalments > 0 && remainingToAllocate >= 0) {
          const perInstalment = remainingToAllocate / remainingInstalments;
          for (let i = index + 1; i < updated.length; i++) {
            updated[i] = {
              ...updated[i],
              amount: Math.round(perInstalment * 100) / 100
            };
          }

          // Fix rounding on last instalment
          const newTotal = updated.reduce((sum, inst) => sum + inst.amount, 0);
          const roundingDiff = remainingAmount - newTotal;
          if (Math.abs(roundingDiff) > 0.001) {
            updated[updated.length - 1].amount += roundingDiff;
            updated[updated.length - 1].amount =
              Math.round(updated[updated.length - 1].amount * 100) / 100;
          }
        }
      }

      return updated;
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Handle instalment date change
  // ═══════════════════════════════════════════════════════════════════════════
  const handleInstalmentDateChange = (index: number, newDate: string) => {
    setInstalments(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], scheduledDate: newDate };
      return updated;
    });
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation per step
  // ═══════════════════════════════════════════════════════════════════════════
  const validateStep = (step: WizardStep): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (addressMode === 'existing' && state.addresses.length === 0) {
        newErrors.address = 'No addresses available';
      }
      if (addressMode === 'manual' && !manualAddress.trim()) {
        newErrors.address = 'Address is required';
      }
      if (!caseReference.trim()) {
        newErrors.caseReference = 'Case reference is required';
      }
    }

    if (step === 2) {
      if (!totalAmount || parseFloat(totalAmount) <= 0) {
        newErrors.totalAmount = 'Enter a valid amount';
      }
      if (remainingAmount < 0) {
        newErrors.totalAmount = 'Previous payments exceed total amount';
      }
    }

    if (step === 3) {
      const totalAllocated = instalments.reduce((sum, inst) => sum + inst.amount, 0);
      if (Math.abs(totalAllocated - remainingAmount) > 0.01) {
        newErrors.instalments = `Instalments must total £${remainingAmount.toFixed(2)}`;
      }
      if (instalments.some(inst => inst.amount <= 0)) {
        newErrors.instalments = 'All instalments must have a positive amount';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Navigation
  // ═══════════════════════════════════════════════════════════════════════════
  const goToStep = (step: WizardStep) => {
    if (step > currentStep) {
      // Validate current step before advancing
      if (!validateStep(currentStep)) return;
    }
    setCurrentStep(step);
  };

  const nextStep = () => {
    if (currentStep < 3) {
      goToStep((currentStep + 1) as WizardStep);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as WizardStep);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Submit
  // ═══════════════════════════════════════════════════════════════════════════
  const handleSubmit = async () => {
    if (!validateStep(3)) return;

    setIsSubmitting(true);

    try {
      let finalAddressIndex = addressIndex;
      let finalAddress = "";

      if (addressMode === "existing") {
        const selectedAddress = state.addresses[addressIndex];
        if (!selectedAddress) {
          throw new Error('Selected address is not valid');
        }
        finalAddress = selectedAddress.address;
      } else {
        const existingIndex = state.addresses.findIndex(
          addr => addr.address.toLowerCase().trim() === manualAddress.toLowerCase().trim()
        );
        if (existingIndex >= 0) {
          finalAddressIndex = existingIndex;
          finalAddress = state.addresses[existingIndex].address;
        } else {
          finalAddressIndex = -1;
          finalAddress = manualAddress.trim();
        }
      }

      // Build arrangement data
      const firstInstalment = instalments[0];
      const isRecurring = paymentFrequency !== 'single' && instalments.length > 1;

      const arrangementData: Omit<Arrangement, 'id' | 'createdAt' | 'updatedAt'> = {
        addressIndex: finalAddressIndex,
        address: finalAddress,
        customerName,
        phoneNumber,
        caseReference,
        scheduledDate: firstInstalment?.scheduledDate ?? startDate,
        status: "Scheduled" as ArrangementStatus,
        notes,

        // New payment plan fields
        totalAmountOwed: totalAmountNum,
        paymentInstalments: instalments,
        currentInstalmentIndex: 0,

        // Legacy fields for backward compatibility
        amount: firstInstalment?.amount.toFixed(2),
        recurrenceType: isRecurring ? paymentFrequency : "none",
        totalPayments: instalments.length,
        paymentsMade: 0,
      };

      await onSave(arrangementData);

      // Record previous payments as completions
      for (const payment of previousPayments) {
        if (parseFloat(payment.amount) > 0) {
          try {
            onComplete(finalAddressIndex, "ARR", payment.amount, undefined, caseReference);
          } catch (error) {
            logger.error('Error recording previous payment:', error);
          }
        }
      }

      // Record ARR completion for the new arrangement (only for addresses in the main list)
      if (finalAddressIndex !== -1) {
        try {
          onComplete(finalAddressIndex, "ARR", undefined, undefined, caseReference);
        } catch (error) {
          logger.error('Error recording ARR completion:', error);
        }
      }

    } catch (error) {
      logger.error('Error saving arrangement:', error);
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Previous payments helpers
  // ═══════════════════════════════════════════════════════════════════════════
  const addPreviousPayment = () => {
    setPreviousPayments(prev => [...prev, {
      id: `prev_${Date.now()}`,
      amount: '',
      date: new Date().toISOString().slice(0, 10)
    }]);
  };

  const updatePreviousPayment = (id: string, field: 'amount' | 'date', value: string) => {
    setPreviousPayments(prev =>
      prev.map(p => p.id === id ? { ...p, [field]: value } : p)
    );
  };

  const removePreviousPayment = (id: string) => {
    setPreviousPayments(prev => prev.filter(p => p.id !== id));
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Escape key handler
  // ═══════════════════════════════════════════════════════════════════════════
  React.useEffect(() => {
    if (!fullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fullscreen, onCancel]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════
  const formContent = (
    <div className="wizard-form">
      {/* Header */}
      <div className="wizard-header">
        <h2 className="wizard-title">
          {arrangement ? "Edit Arrangement" : "New Arrangement"}
        </h2>
        {fullscreen && (
          <button type="button" className="wizard-close" onClick={onCancel}>✕</button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="wizard-progress">
        <div
          className={`wizard-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}
          onClick={() => goToStep(1)}
        >
          <div className="step-number">1</div>
          <div className="step-label">Case Info</div>
        </div>
        <div className="step-connector" />
        <div
          className={`wizard-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}
          onClick={() => currentStep > 1 && goToStep(2)}
        >
          <div className="step-number">2</div>
          <div className="step-label">Amount</div>
        </div>
        <div className="step-connector" />
        <div
          className={`wizard-step ${currentStep >= 3 ? 'active' : ''}`}
          onClick={() => currentStep > 2 && goToStep(3)}
        >
          <div className="step-number">3</div>
          <div className="step-label">Payment Plan</div>
        </div>
      </div>

      {/* Step Content */}
      <div className="wizard-content">
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: Case Info */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <div className="wizard-step-content fade-in">
            <div className="step-header">
              <span className="step-icon">📋</span>
              <div>
                <h3>Case Information</h3>
                <p>Enter the case details and customer information</p>
              </div>
            </div>

            {/* Address Selection */}
            <div className="form-section">
              <div className="toggle-buttons">
                <button
                  type="button"
                  className={`toggle-btn ${addressMode === 'existing' ? 'active' : ''}`}
                  onClick={() => setAddressMode('existing')}
                >
                  📋 From List
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${addressMode === 'manual' ? 'active' : ''}`}
                  onClick={() => setAddressMode('manual')}
                >
                  ✏️ Manual Entry
                </button>
              </div>

              {addressMode === 'existing' ? (
                <div className="form-field">
                  <label>Address *</label>
                  {state.addresses.length === 0 ? (
                    <div className="field-warning">
                      No addresses in your list. Switch to Manual Entry.
                    </div>
                  ) : (
                    <select
                      value={addressIndex}
                      onChange={(e) => setAddressIndex(parseInt(e.target.value))}
                      className="form-input"
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
                <div className="form-field">
                  <label>Address *</label>
                  <input
                    type="text"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    className={`form-input ${errors.address ? 'error' : ''}`}
                    placeholder="Enter full address"
                  />
                  {errors.address && <span className="field-error">{errors.address}</span>}
                </div>
              )}
            </div>

            {/* Case Reference - REQUIRED */}
            <div className="form-field">
              <label>Case Reference *</label>
              <input
                type="text"
                value={caseReference}
                onChange={(e) => setCaseReference(e.target.value)}
                className={`form-input ${errors.caseReference ? 'error' : ''}`}
                placeholder="e.g., CR-2025-1234"
              />
              {errors.caseReference && <span className="field-error">{errors.caseReference}</span>}
            </div>

            {/* Customer Details */}
            <div className="form-row">
              <div className="form-field">
                <label>Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="form-input"
                  placeholder="Customer name"
                />
              </div>
              <div className="form-field">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="form-input"
                  placeholder="Phone number"
                />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: Amount */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <div className="wizard-step-content fade-in">
            <div className="step-header">
              <span className="step-icon">💰</span>
              <div>
                <h3>Payment Amount</h3>
                <p>Enter the total amount owed and any payments already made</p>
              </div>
            </div>

            {/* Total Amount */}
            <div className="form-field">
              <label>Total Amount Owed *</label>
              <div className="amount-input-wrapper">
                <span className="currency-symbol">£</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className={`form-input amount-input ${errors.totalAmount ? 'error' : ''}`}
                  placeholder="0.00"
                />
              </div>
              {errors.totalAmount && <span className="field-error">{errors.totalAmount}</span>}
            </div>

            {/* Previous Payments */}
            <div className="form-section">
              <div className="section-header">
                <h4>Payments Already Made</h4>
                <button
                  type="button"
                  className="btn-add-small"
                  onClick={addPreviousPayment}
                >
                  + Add Payment
                </button>
              </div>

              {previousPayments.length === 0 ? (
                <p className="section-empty">No previous payments recorded</p>
              ) : (
                <div className="previous-payments-list">
                  {previousPayments.map((payment) => (
                    <div key={payment.id} className="previous-payment-item">
                      <div className="amount-input-wrapper compact">
                        <span className="currency-symbol">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={payment.amount}
                          onChange={(e) => updatePreviousPayment(payment.id, 'amount', e.target.value)}
                          className="form-input amount-input"
                          placeholder="0.00"
                        />
                      </div>
                      <input
                        type="date"
                        value={payment.date}
                        onChange={(e) => updatePreviousPayment(payment.id, 'date', e.target.value)}
                        className="form-input date-input"
                      />
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removePreviousPayment(payment.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {(previousPayments.length > 0 || totalAmountNum > 0) && (
                <div className="amount-summary">
                  <div className="summary-row">
                    <span>Total Owed</span>
                    <span>£{totalAmountNum.toFixed(2)}</span>
                  </div>
                  {previousPaymentsTotal > 0 && (
                    <div className="summary-row subtract">
                      <span>Already Paid</span>
                      <span>-£{previousPaymentsTotal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="summary-row total">
                    <span>Remaining</span>
                    <span>£{remainingAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* STEP 3: Payment Plan */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <div className="wizard-step-content fade-in">
            <div className="step-header">
              <span className="step-icon">📅</span>
              <div>
                <h3>Payment Plan</h3>
                <p>Set up the payment schedule - dates and amounts are fully editable</p>
              </div>
            </div>

            {/* Frequency Selection */}
            <div className="frequency-selector">
              {[
                { value: 'single', label: 'One-time', icon: '1️⃣' },
                { value: 'weekly', label: 'Weekly', icon: '📆' },
                { value: 'biweekly', label: 'Bi-weekly', icon: '📅' },
                { value: 'monthly', label: 'Monthly', icon: '🗓️' },
              ].map((freq) => (
                <button
                  key={freq.value}
                  type="button"
                  className={`frequency-btn ${paymentFrequency === freq.value ? 'active' : ''}`}
                  onClick={() => setPaymentFrequency(freq.value as PaymentFrequency)}
                >
                  <span className="freq-icon">{freq.icon}</span>
                  <span className="freq-label">{freq.label}</span>
                </button>
              ))}
            </div>

            {/* Number of Instalments & Start Date */}
            {paymentFrequency !== 'single' && (
              <div className="form-row">
                <div className="form-field">
                  <label>Number of Instalments</label>
                  <input
                    type="number"
                    min="2"
                    max="24"
                    value={numberOfInstalments}
                    onChange={(e) => setNumberOfInstalments(Math.max(2, parseInt(e.target.value) || 2))}
                    className="form-input"
                  />
                </div>
                <div className="form-field">
                  <label>First Payment Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
            )}

            {paymentFrequency === 'single' && (
              <div className="form-field">
                <label>Payment Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="form-input"
                />
              </div>
            )}

            {/* Editable Payment Schedule */}
            <div className="payment-schedule">
              <div className="schedule-header">
                <h4>Payment Schedule</h4>
                <span className="schedule-total">
                  Total: £{remainingAmount.toFixed(2)}
                </span>
              </div>

              {errors.instalments && (
                <div className="schedule-error">{errors.instalments}</div>
              )}

              <div className="instalments-list">
                {instalments.map((inst, index) => (
                  <div key={inst.id} className="instalment-row">
                    <div className="instalment-number">
                      <span className="inst-badge">{inst.instalmentNumber}</span>
                    </div>
                    <div className="instalment-date">
                      <input
                        type="date"
                        value={inst.scheduledDate}
                        onChange={(e) => handleInstalmentDateChange(index, e.target.value)}
                        className="form-input"
                      />
                    </div>
                    <div className="instalment-amount">
                      <div className="amount-input-wrapper compact">
                        <span className="currency-symbol">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={inst.amount.toFixed(2)}
                          onChange={(e) => handleInstalmentAmountChange(index, e.target.value)}
                          className="form-input amount-input"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Schedule Summary */}
              <div className="schedule-summary">
                <div className="summary-check">
                  {Math.abs(instalments.reduce((sum, inst) => sum + inst.amount, 0) - remainingAmount) < 0.01 ? (
                    <span className="check-ok">✓ Schedule balanced</span>
                  ) : (
                    <span className="check-error">
                      Off by £{Math.abs(instalments.reduce((sum, inst) => sum + inst.amount, 0) - remainingAmount).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="form-field">
              <label>Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="form-input form-textarea"
                rows={2}
                placeholder="Payment terms, special instructions..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="wizard-nav">
        <div className="nav-left">
          {currentStep > 1 && (
            <button type="button" className="btn-back" onClick={prevStep}>
              ← Back
            </button>
          )}
        </div>
        <div className="nav-right">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          {currentStep < 3 ? (
            <button type="button" className="btn-next" onClick={nextStep}>
              Continue →
            </button>
          ) : (
            <LoadingButton
              type="button"
              className="btn-submit"
              isLoading={isLoading || isSubmitting}
              loadingText="Creating..."
              onClick={handleSubmit}
            >
              ✓ Create Arrangement
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        ref={overlayRef}
        className="wizard-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCancel();
        }}
      >
        <div className="wizard-modal">
          {formContent}
        </div>
      </div>
    );
  }

  return <div className="wizard-container">{formContent}</div>;
}
