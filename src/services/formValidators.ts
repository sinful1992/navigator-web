// src/services/formValidators.ts
// PHASE 2 Task 4 Phase 3: Form-specific validators extracted from components
// Provides validators for arrangement forms, payment forms, and other UI inputs

import type { ValidationResult } from '../types/validation';
import {
  ValidationSuccess,
  ValidationFailure,
  ValidationErrorCode,
} from '../types/validation';

/**
 * ============================================================================
 * ARRANGEMENT FORM VALIDATORS
 * ============================================================================
 */

/**
 * Validate arrangement form data before submission
 * Checks: total amount, remaining amount, address selection
 */
export interface ArrangementFormData {
  totalAmount: string;
  manualAddress: string;
  selectedAddressIndex?: number;
  addressMode: 'existing' | 'manual';
  paymentFrequency: 'weekly' | 'biweekly' | 'monthly' | 'single';
  previousPayments: Array<{ amount: string; date: string; notes?: string }>;
}

/**
 * Validate the entire arrangement form
 */
export function validateArrangementForm(
  formData: ArrangementFormData,
  addressesCount: number,
  remainingAmount: number
): ValidationResult<void> {
  const errors: Array<{ field: string; code: string; message: string }> = [];

  // Validate total amount
  const amountResult = validateArrangementAmount(formData.totalAmount);
  if (!amountResult.success) {
    errors.push(...amountResult.errors);
  }

  // Validate remaining amount is positive
  if (remainingAmount < 0) {
    errors.push({
      field: 'totalAmount',
      code: ValidationErrorCode.INVALID_VALUE,
      message: 'Previous payments exceed total amount'
    });
  }

  // Validate address selection
  if (formData.addressMode === 'existing') {
    if (addressesCount === 0) {
      errors.push({
        field: 'address',
        code: ValidationErrorCode.REQUIRED,
        message: 'No addresses available to select'
      });
    }
    if (formData.selectedAddressIndex === undefined || formData.selectedAddressIndex < 0) {
      errors.push({
        field: 'address',
        code: ValidationErrorCode.REQUIRED,
        message: 'Please select an address'
      });
    }
  } else if (formData.addressMode === 'manual') {
    const addressResult = validateManualAddress(formData.manualAddress);
    if (!addressResult.success) {
      errors.push(...addressResult.errors);
    }
  }

  // Validate payment frequency
  const validFrequencies = ['weekly', 'biweekly', 'monthly', 'single'];
  if (!validFrequencies.includes(formData.paymentFrequency)) {
    errors.push({
      field: 'paymentFrequency',
      code: ValidationErrorCode.INVALID_VALUE,
      message: 'Invalid payment frequency'
    });
  }

  return errors.length > 0
    ? { success: false, errors }
    : ValidationSuccess(undefined);
}

/**
 * Validate arrangement total amount
 * Must be positive, numeric, under 1 million
 */
export function validateArrangementAmount(value: string): ValidationResult<number> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure('totalAmount', ValidationErrorCode.REQUIRED, 'Total amount is required');
  }

  const num = parseFloat(value);

  if (isNaN(num) || num <= 0) {
    return ValidationFailure('totalAmount', ValidationErrorCode.INVALID_FORMAT, 'Please enter a valid total amount greater than 0');
  }

  if (num > 1000000) {
    return ValidationFailure('totalAmount', ValidationErrorCode.OUT_OF_RANGE, 'Amount cannot exceed £1,000,000');
  }

  return ValidationSuccess(num);
}

/**
 * Validate manual address input
 */
export function validateManualAddress(value: string): ValidationResult<string> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'Please enter an address');
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return ValidationFailure('address', ValidationErrorCode.REQUIRED, 'Address cannot be empty');
  }

  if (trimmed.length < 3) {
    return ValidationFailure('address', ValidationErrorCode.INVALID_VALUE, 'Address must be at least 3 characters');
  }

  if (trimmed.length > 500) {
    return ValidationFailure('address', ValidationErrorCode.OUT_OF_RANGE, 'Address cannot exceed 500 characters');
  }

  return ValidationSuccess(trimmed);
}

/**
 * Validate previous payment amount
 */
export function validatePreviousPaymentAmount(value: string): ValidationResult<number> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure('amount', ValidationErrorCode.REQUIRED, 'Payment amount is required');
  }

  const num = parseFloat(value);

  if (isNaN(num) || num <= 0) {
    return ValidationFailure('amount', ValidationErrorCode.INVALID_FORMAT, 'Payment amount must be greater than 0');
  }

  if (num > 1000000) {
    return ValidationFailure('amount', ValidationErrorCode.OUT_OF_RANGE, 'Payment cannot exceed £1,000,000');
  }

  return ValidationSuccess(num);
}

/**
 * Validate payment date
 * Must be in past or today
 */
export function validatePaymentDate(value: string): ValidationResult<Date> {
  if (value === '' || value === null || value === undefined) {
    return ValidationFailure('date', ValidationErrorCode.REQUIRED, 'Payment date is required');
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return ValidationFailure('date', ValidationErrorCode.INVALID_FORMAT, 'Payment date must be a valid date');
  }

  // Payment date must be in past or today
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (date > today) {
    return ValidationFailure('date', ValidationErrorCode.INVALID_VALUE, 'Payment date cannot be in the future');
  }

  return ValidationSuccess(date);
}

/**
 * ============================================================================
 * COMPLETION FORM VALIDATORS
 * ============================================================================
 */

/**
 * Validate completion outcome value
 */
export function validateCompletionOutcome(value: unknown): ValidationResult<string> {
  const validOutcomes = ['PIF', 'DA', 'Done', 'ARR'];

  if (typeof value !== 'string' || !value.trim()) {
    return ValidationFailure('outcome', ValidationErrorCode.REQUIRED, 'Outcome is required');
  }

  if (!validOutcomes.includes(value)) {
    return ValidationFailure('outcome', ValidationErrorCode.INVALID_VALUE, `Outcome must be one of: ${validOutcomes.join(', ')}`);
  }

  return ValidationSuccess(value);
}

/**
 * Validate completion amount (optional, but if provided must be valid)
 */
export function validateCompletionAmount(value: unknown): ValidationResult<number | undefined> {
  // Amount is optional
  if (value === undefined || value === null || value === '') {
    return ValidationSuccess(undefined);
  }

  if (typeof value !== 'string') {
    return ValidationFailure('amount', ValidationErrorCode.INVALID_TYPE, 'Amount must be a string if provided');
  }

  const num = parseFloat(value);

  if (isNaN(num) || num < 0) {
    return ValidationFailure('amount', ValidationErrorCode.INVALID_FORMAT, 'Amount must be a valid number if provided');
  }

  if (num > 1000000) {
    return ValidationFailure('amount', ValidationErrorCode.OUT_OF_RANGE, 'Amount cannot exceed £1,000,000');
  }

  return ValidationSuccess(num);
}

/**
 * ============================================================================
 * SHARED FORM FIELD VALIDATORS
 * ============================================================================
 */

/**
 * Validate a required field is not empty
 */
export function validateRequired(value: unknown, fieldName: string): ValidationResult<string> {
  if (value === undefined || value === null || value === '') {
    return ValidationFailure(fieldName, ValidationErrorCode.REQUIRED, `${fieldName} is required`);
  }

  if (typeof value === 'string' && value.trim() === '') {
    return ValidationFailure(fieldName, ValidationErrorCode.REQUIRED, `${fieldName} cannot be empty`);
  }

  return ValidationSuccess(String(value));
}

/**
 * Validate a field has minimum length
 */
export function validateMinLength(
  value: unknown,
  fieldName: string,
  minLength: number
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return ValidationFailure(fieldName, ValidationErrorCode.INVALID_TYPE, `${fieldName} must be a string`);
  }

  if (value.length < minLength) {
    return ValidationFailure(
      fieldName,
      ValidationErrorCode.INVALID_VALUE,
      `${fieldName} must be at least ${minLength} characters`
    );
  }

  return ValidationSuccess(value);
}

/**
 * Validate a field has maximum length
 */
export function validateMaxLength(
  value: unknown,
  fieldName: string,
  maxLength: number
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return ValidationFailure(fieldName, ValidationErrorCode.INVALID_TYPE, `${fieldName} must be a string`);
  }

  if (value.length > maxLength) {
    return ValidationFailure(
      fieldName,
      ValidationErrorCode.OUT_OF_RANGE,
      `${fieldName} cannot exceed ${maxLength} characters`
    );
  }

  return ValidationSuccess(value);
}

/**
 * Validate email format
 */
export function validateEmail(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return ValidationFailure('email', ValidationErrorCode.REQUIRED, 'Email is required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(value)) {
    return ValidationFailure('email', ValidationErrorCode.INVALID_FORMAT, 'Please enter a valid email address');
  }

  return ValidationSuccess(value);
}

/**
 * Validate phone number (basic validation)
 */
export function validatePhoneNumber(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return ValidationFailure('phone', ValidationErrorCode.REQUIRED, 'Phone number is required');
  }

  // Remove non-digit characters for validation
  const digitsOnly = value.replace(/\D/g, '');

  if (digitsOnly.length < 10) {
    return ValidationFailure('phone', ValidationErrorCode.INVALID_FORMAT, 'Phone number must have at least 10 digits');
  }

  if (digitsOnly.length > 15) {
    return ValidationFailure('phone', ValidationErrorCode.INVALID_FORMAT, 'Phone number must have at most 15 digits');
  }

  return ValidationSuccess(value);
}

/**
 * Validate numeric field
 */
export function validateNumericField(value: unknown, fieldName: string, min = 0, max = 1000000): ValidationResult<number> {
  if (value === undefined || value === null || value === '') {
    return ValidationFailure(fieldName, ValidationErrorCode.REQUIRED, `${fieldName} is required`);
  }

  const num = typeof value === 'string' ? parseFloat(value) : (value as number);

  if (isNaN(num)) {
    return ValidationFailure(fieldName, ValidationErrorCode.INVALID_FORMAT, `${fieldName} must be a valid number`);
  }

  if (num < min || num > max) {
    return ValidationFailure(
      fieldName,
      ValidationErrorCode.OUT_OF_RANGE,
      `${fieldName} must be between ${min} and ${max}`
    );
  }

  return ValidationSuccess(num);
}
