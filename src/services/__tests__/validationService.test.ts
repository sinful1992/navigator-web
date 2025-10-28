// src/services/__tests__/validationService.test.ts
// PHASE 3: Comprehensive test suite for validation service

import { describe, it, expect } from 'vitest';
import {
  validateCompletion,
  validateAddressRow,
  validateAppState,
  validateArrangement,
  validateDaySession,
  validateAmount,
  validateDate,
  validateAddressString,
  validateString,
  isValidTimestamp,
  isValidFutureTimestamp,
  isValidIndex,
  isWithinRange,
  isOneOf,
  isValidCompletionTimestamp,
  isValidOutcome,
  validateCompletionArray,
  validateAddressArray,
  validateSubmitOperation,
} from '../validationService';
import { ValidationErrorCode } from '../../types/validation';

describe('ValidationService - Type Guard Validators', () => {
  describe('validateCompletion', () => {
    it('validates a complete and correct completion object', () => {
      const completion = {
        index: 0,
        address: '123 Main St',
        outcome: 'PIF' as const,
        timestamp: new Date().toISOString(),
      };

      const result = validateCompletion(completion);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.address).toBe('123 Main St');
      }
    });

    it('fails when index is negative', () => {
      const completion = {
        index: -1,
        address: '123 Main St',
        outcome: 'PIF' as const,
        timestamp: new Date().toISOString(),
      };

      const result = validateCompletion(completion);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('index');
      }
    });

    it('fails when address is empty', () => {
      const completion = {
        index: 0,
        address: '',
        outcome: 'PIF' as const,
        timestamp: new Date().toISOString(),
      };

      const result = validateCompletion(completion);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('address');
      }
    });

    it('fails when outcome is invalid', () => {
      const completion = {
        index: 0,
        address: '123 Main St',
        outcome: 'INVALID',
        timestamp: new Date().toISOString(),
      };

      const result = validateCompletion(completion);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('outcome');
      }
    });

    it('fails when timestamp is invalid ISO string', () => {
      const completion = {
        index: 0,
        address: '123 Main St',
        outcome: 'PIF' as const,
        timestamp: 'not-a-date',
      };

      const result = validateCompletion(completion);
      expect(result.success).toBe(false);
    });

    it('fails when value is not an object', () => {
      const result = validateCompletion(null);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe(ValidationErrorCode.INVALID_TYPE);
      }
    });
  });

  describe('validateAddressRow', () => {
    it('validates a minimal address row with just address string', () => {
      const address = { address: '123 Main St' };
      const result = validateAddressRow(address);
      expect(result.success).toBe(true);
    });

    it('validates an address row with coordinates', () => {
      const address = {
        address: '123 Main St',
        lat: 51.5074,
        lng: -0.1278,
      };
      const result = validateAddressRow(address);
      expect(result.success).toBe(true);
    });

    it('fails when address is empty string', () => {
      const address = { address: '' };
      const result = validateAddressRow(address);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('address');
      }
    });

    it('fails when lat is not a number', () => {
      const address = {
        address: '123 Main St',
        lat: 'not-a-number',
      };
      const result = validateAddressRow(address);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('lat');
      }
    });

    it('allows null coordinates', () => {
      const address = {
        address: '123 Main St',
        lat: null,
        lng: null,
      };
      const result = validateAddressRow(address);
      expect(result.success).toBe(true);
    });
  });

  describe('validateDaySession', () => {
    it('validates a valid day session', () => {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const session = {
        date: today,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
      };
      const result = validateDaySession(session);
      expect(result.success).toBe(true);
    });

    it('fails when date is not YYYY-MM-DD format', () => {
      const session = {
        date: 'invalid-date',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
      };
      const result = validateDaySession(session);
      expect(result.success).toBe(false);
    });

    it('fails when start timestamp is invalid', () => {
      const today = new Date().toISOString().split('T')[0];
      const session = {
        date: today,
        start: 'not-a-timestamp',
        end: new Date(Date.now() + 3600000).toISOString(),
      };
      const result = validateDaySession(session);
      expect(result.success).toBe(false);
    });
  });
});

describe('ValidationService - Form Validators', () => {
  describe('validateAmount', () => {
    it('validates amounts in valid range (0 to 1M)', () => {
      expect(validateAmount('100').success).toBe(true);
      expect(validateAmount('1000').success).toBe(true);
      expect(validateAmount('999999.99').success).toBe(true);
    });

    it('rejects negative amounts', () => {
      const result = validateAmount('-10');
      expect(result.success).toBe(false);
    });

    it('rejects amounts over 1M', () => {
      const result = validateAmount('1000001');
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric strings', () => {
      const result = validateAmount('not-a-number');
      expect(result.success).toBe(false);
    });

    it('rejects NaN', () => {
      const result = validateAmount('NaN');
      expect(result.success).toBe(false);
    });
  });

  describe('validateDate', () => {
    it('validates future dates', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const result = validateDate(tomorrow);
      expect(result.success).toBe(true);
    });

    it('rejects past dates', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const result = validateDate(yesterday);
      expect(result.success).toBe(false);
    });

    it('rejects invalid date strings', () => {
      const result = validateDate('not-a-date');
      expect(result.success).toBe(false);
    });
  });

  describe('validateAddressString', () => {
    it('validates addresses with valid length (3-500 chars)', () => {
      expect(validateAddressString('123 Main St').success).toBe(true);
      expect(validateAddressString('A'.repeat(100)).success).toBe(true);
    });

    it('rejects addresses shorter than 3 characters', () => {
      const result = validateAddressString('12');
      expect(result.success).toBe(false);
    });

    it('rejects addresses longer than 500 characters', () => {
      const result = validateAddressString('A'.repeat(501));
      expect(result.success).toBe(false);
    });

    it('rejects empty strings', () => {
      const result = validateAddressString('');
      expect(result.success).toBe(false);
    });
  });

  describe('validateString', () => {
    it('validates strings within specified length bounds', () => {
      const result = validateString('hello', 'field', 3, 10);
      expect(result.success).toBe(true);
    });

    it('rejects strings below minimum length', () => {
      const result = validateString('ab', 'field', 3, 10);
      expect(result.success).toBe(false);
    });

    it('rejects strings above maximum length', () => {
      const result = validateString('a'.repeat(11), 'field', 3, 10);
      expect(result.success).toBe(false);
    });
  });
});

describe('ValidationService - Utility Validators', () => {
  describe('isValidTimestamp', () => {
    it('validates ISO date strings', () => {
      const now = new Date().toISOString();
      expect(isValidTimestamp(now)).toBe(true);
    });

    it('rejects invalid timestamps', () => {
      expect(isValidTimestamp('not-a-date')).toBe(false);
      expect(isValidTimestamp('')).toBe(false);
    });
  });

  describe('isValidFutureTimestamp', () => {
    it('validates timestamps within future window', () => {
      const future = new Date(Date.now() + 3600000).toISOString();
      expect(isValidFutureTimestamp(future, 86400000)).toBe(true);
    });

    it('rejects timestamps beyond future window (clock skew protection)', () => {
      const tooFar = new Date(Date.now() + 86400000 + 1000).toISOString();
      expect(isValidFutureTimestamp(tooFar, 86400000)).toBe(false);
    });

    it('accepts past timestamps (always within window since < now)', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      expect(isValidFutureTimestamp(past, 86400000)).toBe(true);
    });

    it('accepts far past timestamps (still less than now+window)', () => {
      // Even far past timestamps are valid because they're less than now+maxFutureMs
      const farPast = new Date(Date.now() - 86400000 * 10).toISOString();
      expect(isValidFutureTimestamp(farPast, 86400000)).toBe(true);
    });
  });

  describe('isValidIndex', () => {
    it('validates valid array indices', () => {
      expect(isValidIndex(0, 10)).toBe(true);
      expect(isValidIndex(5, 10)).toBe(true);
      expect(isValidIndex(9, 10)).toBe(true);
    });

    it('rejects negative indices', () => {
      expect(isValidIndex(-1, 10)).toBe(false);
    });

    it('rejects indices beyond array length', () => {
      expect(isValidIndex(10, 10)).toBe(false);
      expect(isValidIndex(15, 10)).toBe(false);
    });
  });

  describe('isWithinRange', () => {
    it('validates values within range', () => {
      expect(isWithinRange(5, 0, 10)).toBe(true);
      expect(isWithinRange(0, 0, 10)).toBe(true);
      expect(isWithinRange(10, 0, 10)).toBe(true);
    });

    it('rejects values below minimum', () => {
      expect(isWithinRange(-1, 0, 10)).toBe(false);
    });

    it('rejects values above maximum', () => {
      expect(isWithinRange(11, 0, 10)).toBe(false);
    });
  });

  describe('isOneOf', () => {
    it('validates values in allowed list', () => {
      const allowed = ['active', 'inactive', 'pending'];
      expect(isOneOf('active', allowed)).toBe(true);
      expect(isOneOf('inactive', allowed)).toBe(true);
    });

    it('rejects values not in allowed list', () => {
      const allowed = ['active', 'inactive', 'pending'];
      expect(isOneOf('unknown', allowed)).toBe(false);
    });
  });

  describe('isValidOutcome', () => {
    it('validates valid outcomes', () => {
      expect(isValidOutcome('PIF')).toBe(true);
      expect(isValidOutcome('DA')).toBe(true);
      expect(isValidOutcome('Done')).toBe(true);
      expect(isValidOutcome('ARR')).toBe(true);
    });

    it('rejects invalid outcomes', () => {
      expect(isValidOutcome('INVALID')).toBe(false);
      expect(isValidOutcome('')).toBe(false);
    });
  });
});

describe('ValidationService - Batch Validators', () => {
  describe('validateCompletionArray', () => {
    it('validates array of valid completions', () => {
      const completions = [
        {
          index: 0,
          address: '123 Main St',
          outcome: 'PIF' as const,
          timestamp: new Date().toISOString(),
        },
        {
          index: 1,
          address: '456 Oak Ave',
          outcome: 'DA' as const,
          timestamp: new Date().toISOString(),
        },
      ];

      const result = validateCompletionArray(completions);
      expect(result.success).toBe(true);
    });

    it('rejects array with invalid completion', () => {
      const completions = [
        {
          index: 0,
          address: '123 Main St',
          outcome: 'PIF' as const,
          timestamp: new Date().toISOString(),
        },
        {
          index: -1, // Invalid: negative index
          address: '456 Oak Ave',
          outcome: 'DA' as const,
          timestamp: new Date().toISOString(),
        },
      ];

      const result = validateCompletionArray(completions);
      expect(result.success).toBe(false);
    });

    it('validates empty array', () => {
      const result = validateCompletionArray([]);
      expect(result.success).toBe(true);
    });
  });

  describe('validateAddressArray', () => {
    it('validates array of valid addresses', () => {
      const addresses = [
        { address: '123 Main St' },
        { address: '456 Oak Ave', lat: 51.5, lng: -0.1 },
      ];

      const result = validateAddressArray(addresses);
      expect(result.success).toBe(true);
    });

    it('rejects array with invalid address', () => {
      const addresses = [
        { address: '123 Main St' },
        { address: '' }, // Invalid: empty address
      ];

      const result = validateAddressArray(addresses);
      expect(result.success).toBe(false);
    });
  });
});

describe('ValidationService - Edge Cases', () => {
  it('handles null and undefined values gracefully', () => {
    expect(validateCompletion(null).success).toBe(false);
    expect(validateCompletion(undefined).success).toBe(false);
    expect(validateAddressRow(null).success).toBe(false);
  });

  it('provides meaningful error messages', () => {
    const result = validateCompletion({
      index: -1,
      address: '',
      outcome: 'INVALID',
      timestamp: 'bad-date',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toBeTruthy();
    }
  });

  it('handles type coercion attempts', () => {
    const completion = {
      index: '0', // String instead of number
      address: '123 Main St',
      outcome: 'PIF' as const,
      timestamp: new Date().toISOString(),
    };

    const result = validateCompletion(completion);
    expect(result.success).toBe(false);
  });
});
