// src/services/__tests__/formValidators.test.ts
// PHASE 3: Test suite for form validators

import { describe, it, expect } from 'vitest';
import {
  validateArrangementForm,
  validateArrangementAmount,
  validateManualAddress,
  validatePreviousPaymentAmount,
  validatePaymentDate,
  validateCompletionOutcome,
  validateCompletionAmount,
  validateRequired,
  validateMinLength,
  validateMaxLength,
  validateEmail,
  validatePhoneNumber,
  validateNumericField,
} from '../formValidators';

describe('FormValidators - Arrangement Form', () => {
  const validFormData = {
    totalAmount: '500',
    manualAddress: '',
    selectedAddressIndex: 0,
    addressMode: 'existing' as const,
    paymentFrequency: 'weekly' as const,
    previousPayments: [],
  };

  describe('validateArrangementForm', () => {
    it('validates a complete arrangement form with existing address', () => {
      const result = validateArrangementForm(validFormData, 10, 1000);
      expect(result.success).toBe(true);
    });

    it('fails when totalAmount is invalid', () => {
      const formData = { ...validFormData, totalAmount: '-100' };
      const result = validateArrangementForm(formData, 10, 1000);
      expect(result.success).toBe(false);
    });

    it('fails when no addresses available and existing mode selected', () => {
      const formData = { ...validFormData };
      const result = validateArrangementForm(formData, 0, 1000);
      expect(result.success).toBe(false);
    });

    it('fails when no address selected in existing mode', () => {
      const formData = { ...validFormData, selectedAddressIndex: -1 };
      const result = validateArrangementForm(formData, 10, 1000);
      expect(result.success).toBe(false);
    });

    it('validates manual address mode', () => {
      const formData = {
        ...validFormData,
        addressMode: 'manual' as const,
        manualAddress: '123 Main Street',
      };
      const result = validateArrangementForm(formData, 0, 1000);
      expect(result.success).toBe(true);
    });
  });

  describe('validateArrangementAmount', () => {
    it('validates amounts in valid range (0 to 1M)', () => {
      expect(validateArrangementAmount('100').success).toBe(true);
      expect(validateArrangementAmount('50000').success).toBe(true);
      expect(validateArrangementAmount('999999.99').success).toBe(true);
    });

    it('rejects negative amounts', () => {
      const result = validateArrangementAmount('-100');
      expect(result.success).toBe(false);
    });

    it('rejects amounts over 1M', () => {
      const result = validateArrangementAmount('1000001');
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric input', () => {
      const result = validateArrangementAmount('abc');
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = validateArrangementAmount('');
      expect(result.success).toBe(false);
    });
  });

  describe('validateManualAddress', () => {
    it('validates addresses with valid length (3-500 chars)', () => {
      expect(validateManualAddress('123 Main Street').success).toBe(true);
      expect(validateManualAddress('A'.repeat(100)).success).toBe(true);
    });

    it('rejects addresses shorter than 3 characters', () => {
      const result = validateManualAddress('12');
      expect(result.success).toBe(false);
    });

    it('rejects addresses longer than 500 characters', () => {
      const result = validateManualAddress('A'.repeat(501));
      expect(result.success).toBe(false);
    });

    it('rejects empty strings', () => {
      const result = validateManualAddress('');
      expect(result.success).toBe(false);
    });

    it('accepts addresses with special characters', () => {
      expect(validateManualAddress('123 Main St, Apt #4B, London').success).toBe(true);
    });
  });

  describe('validatePreviousPaymentAmount', () => {
    it('validates payment amounts in valid range', () => {
      expect(validatePreviousPaymentAmount('100').success).toBe(true);
      expect(validatePreviousPaymentAmount('50000').success).toBe(true);
    });

    it('rejects negative amounts', () => {
      const result = validatePreviousPaymentAmount('-50');
      expect(result.success).toBe(false);
    });

    it('rejects amounts over 1M', () => {
      const result = validatePreviousPaymentAmount('1000001');
      expect(result.success).toBe(false);
    });
  });

  describe('validatePaymentDate', () => {
    it('validates past and current dates', () => {
      const today = new Date().toISOString();
      expect(validatePaymentDate(today).success).toBe(true);

      const yesterday = new Date(Date.now() - 86400000).toISOString();
      expect(validatePaymentDate(yesterday).success).toBe(true);
    });

    it('rejects future dates', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const result = validatePaymentDate(tomorrow);
      expect(result.success).toBe(false);
    });

    it('rejects invalid date strings', () => {
      const result = validatePaymentDate('not-a-date');
      expect(result.success).toBe(false);
    });
  });
});

describe('FormValidators - Completion Form', () => {
  describe('validateCompletionOutcome', () => {
    it('validates all valid outcomes', () => {
      expect(validateCompletionOutcome('PIF').success).toBe(true);
      expect(validateCompletionOutcome('DA').success).toBe(true);
      expect(validateCompletionOutcome('Done').success).toBe(true);
      expect(validateCompletionOutcome('ARR').success).toBe(true);
    });

    it('rejects invalid outcomes', () => {
      const result = validateCompletionOutcome('INVALID');
      expect(result.success).toBe(false);
    });

    it('rejects empty strings', () => {
      const result = validateCompletionOutcome('');
      expect(result.success).toBe(false);
    });

    it('is case-sensitive', () => {
      const result = validateCompletionOutcome('pif');
      expect(result.success).toBe(false);
    });
  });

  describe('validateCompletionAmount', () => {
    it('validates valid amounts', () => {
      expect(validateCompletionAmount('100').success).toBe(true);
      expect(validateCompletionAmount('50000').success).toBe(true);
    });

    it('allows empty amount (optional field)', () => {
      expect(validateCompletionAmount('').success).toBe(true);
    });

    it('rejects negative amounts', () => {
      const result = validateCompletionAmount('-100');
      expect(result.success).toBe(false);
    });

    it('rejects amounts over 1M', () => {
      const result = validateCompletionAmount('1000001');
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric input', () => {
      const result = validateCompletionAmount('abc');
      expect(result.success).toBe(false);
    });
  });
});

describe('FormValidators - Shared Field Validators', () => {
  describe('validateRequired', () => {
    it('validates non-empty strings', () => {
      expect(validateRequired('value', 'fieldName').success).toBe(true);
    });

    it('rejects empty strings', () => {
      const result = validateRequired('', 'fieldName');
      expect(result.success).toBe(false);
    });

    it('rejects whitespace-only strings', () => {
      const result = validateRequired('   ', 'fieldName');
      expect(result.success).toBe(false);
    });

    it('includes field name in error', () => {
      const result = validateRequired('', 'customerId');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].message).toContain('customerId');
      }
    });
  });

  describe('validateMinLength', () => {
    it('validates strings meeting minimum length', () => {
      expect(validateMinLength('hello', 'field', 3).success).toBe(true);
      expect(validateMinLength('hello', 'field', 5).success).toBe(true);
    });

    it('rejects strings below minimum length', () => {
      const result = validateMinLength('hi', 'field', 3);
      expect(result.success).toBe(false);
    });

    it('allows strings exactly at minimum length', () => {
      expect(validateMinLength('abc', 'field', 3).success).toBe(true);
    });
  });

  describe('validateMaxLength', () => {
    it('validates strings within maximum length', () => {
      expect(validateMaxLength('hello', 'field', 10).success).toBe(true);
      expect(validateMaxLength('hello', 'field', 5).success).toBe(true);
    });

    it('rejects strings exceeding maximum length', () => {
      const result = validateMaxLength('hello', 'field', 4);
      expect(result.success).toBe(false);
    });

    it('allows strings exactly at maximum length', () => {
      expect(validateMaxLength('abcde', 'field', 5).success).toBe(true);
    });
  });

  describe('validateEmail', () => {
    it('validates standard email addresses', () => {
      expect(validateEmail('test@example.com').success).toBe(true);
      expect(validateEmail('user+tag@example.co.uk').success).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(validateEmail('invalid').success).toBe(false);
      expect(validateEmail('invalid@').success).toBe(false);
      expect(validateEmail('@example.com').success).toBe(false);
    });

    it('rejects empty strings', () => {
      const result = validateEmail('');
      expect(result.success).toBe(false);
    });
  });

  describe('validatePhoneNumber', () => {
    it('validates phone numbers with 10-15 digits', () => {
      expect(validatePhoneNumber('1234567890').success).toBe(true);
      expect(validatePhoneNumber('+441234567890').success).toBe(true);
    });

    it('rejects phone numbers with too few digits', () => {
      const result = validatePhoneNumber('123456789'); // 9 digits
      expect(result.success).toBe(false);
    });

    it('rejects phone numbers with too many digits', () => {
      const result = validatePhoneNumber('12345678901234567'); // 17 digits
      expect(result.success).toBe(false);
    });

    it('allows common phone formats', () => {
      expect(validatePhoneNumber('020 1234 5678').success).toBe(true); // UK format
      expect(validatePhoneNumber('(123) 456-7890').success).toBe(true); // US format
    });
  });

  describe('validateNumericField', () => {
    it('validates numbers within range', () => {
      expect(validateNumericField('5', 'field', 0, 10).success).toBe(true);
      expect(validateNumericField('0', 'field', 0, 10).success).toBe(true);
      expect(validateNumericField('10', 'field', 0, 10).success).toBe(true);
    });

    it('rejects numbers below minimum', () => {
      const result = validateNumericField('-1', 'field', 0, 10);
      expect(result.success).toBe(false);
    });

    it('rejects numbers above maximum', () => {
      const result = validateNumericField('11', 'field', 0, 10);
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric input', () => {
      const result = validateNumericField('abc', 'field', 0, 10);
      expect(result.success).toBe(false);
    });

    it('rejects empty strings', () => {
      const result = validateNumericField('', 'field', 0, 10);
      expect(result.success).toBe(false);
    });
  });
});

describe('FormValidators - Integration Scenarios', () => {
  it('validates complete arrangement form workflow', () => {
    const formData = {
      totalAmount: '2500.00',
      manualAddress: '',
      selectedAddressIndex: 0,
      addressMode: 'existing' as const,
      paymentFrequency: 'monthly' as const,
      previousPayments: [
        { amount: '500', date: new Date(Date.now() - 86400000).toISOString() },
      ],
    };

    const result = validateArrangementForm(formData, 100, 2000);
    expect(result.success).toBe(true);
  });

  it('validates all required fields in completion', () => {
    const outcome = validateCompletionOutcome('PIF');
    const amount = validateCompletionAmount('500');

    expect(outcome.success).toBe(true);
    expect(amount.success).toBe(true);
  });

  it('handles edge cases in amount validation', () => {
    // Verify minimum valid amount
    expect(validateArrangementAmount('0.01').success).toBe(true);

    // Verify maximum valid amount (exactly 1,000,000)
    expect(validateArrangementAmount('1000000').success).toBe(true);
    expect(validateArrangementAmount('999999.99').success).toBe(true);

    // Verify zero is rejected
    expect(validateArrangementAmount('0').success).toBe(false);

    // Verify amounts over 1,000,000 are rejected
    expect(validateArrangementAmount('1000000.01').success).toBe(false);
    expect(validateArrangementAmount('1000001').success).toBe(false);
  });

  it('provides consistent error messages', () => {
    const results = [
      validateRequired('', 'field1'),
      validateMinLength('ab', 'field2', 3),
      validateMaxLength('abcdef', 'field3', 5),
    ];

    results.forEach(result => {
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].message).toBeTruthy();
        expect(result.errors[0].field).toBeTruthy();
      }
    });
  });
});
