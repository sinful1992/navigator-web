// src/services/__tests__/operationValidators.test.ts
// PHASE 3: Test suite for sync operation validators

import { describe, it, expect } from 'vitest';
import { validateSyncOperation } from '../operationValidators';
import { ValidationErrorCode } from '../../types/validation';

describe('OperationValidators - SyncOperation Validation', () => {
  const baseValidOperation = {
    id: 'op-123-test',
    timestamp: new Date().toISOString(),
    clientId: 'client-1',
    sequence: 1,
    type: 'COMPLETION_CREATE' as const,
    payload: {
      completion: {
        index: 0,
        address: '123 Main St',
        outcome: 'PIF' as const,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      index: 0,
    },
  };

  describe('Base Field Validation', () => {
    it('validates a complete and correct sync operation', () => {
      const result = validateSyncOperation(baseValidOperation);
      expect(result.success).toBe(true);
    });

    it('fails when id is missing', () => {
      const operation = { ...baseValidOperation, id: undefined };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('id');
      }
    });

    it('fails when id is empty string', () => {
      const operation = { ...baseValidOperation, id: '' };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
    });

    it('fails when timestamp is missing', () => {
      const operation = { ...baseValidOperation, timestamp: undefined };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('timestamp');
      }
    });

    it('fails when timestamp is invalid ISO string', () => {
      const operation = { ...baseValidOperation, timestamp: 'not-a-date' };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
    });

    it('fails when clientId is missing', () => {
      const operation = { ...baseValidOperation, clientId: undefined };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBe('clientId');
      }
    });

    it('fails when sequence is missing or invalid', () => {
      const operation = { ...baseValidOperation, sequence: -1 };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
    });

    it('fails when type is missing', () => {
      const operation = { ...baseValidOperation, type: undefined };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
    });

    it('fails when payload is missing', () => {
      const operation = { ...baseValidOperation, payload: undefined };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
    });
  });

  describe('Clock Skew Protection', () => {
    it('accepts timestamps within 24-hour future window', () => {
      const future = new Date(Date.now() + 3600000).toISOString(); // 1 hour in future
      const operation = { ...baseValidOperation, timestamp: future };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('rejects timestamps more than 24 hours in future', () => {
      const tooFar = new Date(Date.now() + 86400000 + 1000).toISOString(); // 24h + 1s
      const operation = { ...baseValidOperation, timestamp: tooFar };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].message).toContain('future');
      }
    });

    it('accepts past timestamps', () => {
      const past = new Date(Date.now() - 3600000).toISOString();
      const operation = { ...baseValidOperation, timestamp: past };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });
  });

  describe('Type-Specific Payload Validation', () => {
    it('validates COMPLETION_CREATE payload correctly', () => {
      const operation = {
        ...baseValidOperation,
        type: 'COMPLETION_CREATE' as const,
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('validates COMPLETION_UPDATE payload correctly', () => {
      const operation = {
        ...baseValidOperation,
        type: 'COMPLETION_UPDATE' as const,
        payload: {
          originalTimestamp: new Date().toISOString(),
          updates: { outcome: 'DA' as const },
        },
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('validates COMPLETION_DELETE payload correctly', () => {
      const operation = {
        ...baseValidOperation,
        type: 'COMPLETION_DELETE' as const,
        payload: {
          timestamp: new Date().toISOString(),
          index: 0,
        },
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('validates ADDRESS_BULK_IMPORT payload correctly', () => {
      const operation = {
        ...baseValidOperation,
        type: 'ADDRESS_BULK_IMPORT' as const,
        payload: {
          addresses: [
            { address: '123 Main St' },
            { address: '456 Oak Ave', lat: 51.5, lng: -0.1 },
          ],
          newListVersion: 2,
        },
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('validates ADDRESS_ADD payload correctly', () => {
      const operation = {
        ...baseValidOperation,
        type: 'ADDRESS_ADD' as const,
        payload: {
          address: { address: '789 Elm St' },
        },
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('validates ARRANGEMENT_CREATE payload correctly', () => {
      const operation = {
        ...baseValidOperation,
        type: 'ARRANGEMENT_CREATE' as const,
        payload: {
          arrangement: {
            id: 'arr-1',
            customerId: 'cust-1',
            caseReference: 'CASE001',
            arrangementType: 'Scheduled',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('validates SETTINGS_UPDATE_SUBSCRIPTION payload correctly', () => {
      const operation = {
        ...baseValidOperation,
        type: 'SETTINGS_UPDATE_SUBSCRIPTION' as const,
        payload: {
          status: 'active',
        },
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('fails when payload is missing required fields', () => {
      const operation = {
        ...baseValidOperation,
        type: 'COMPLETION_CREATE' as const,
        payload: {
          // Missing required 'completion' field
          timestamp: new Date().toISOString(),
        },
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
    });
  });

  describe('Error Handling and Messages', () => {
    it('provides specific error messages for each failure', () => {
      const operation = {
        id: '',
        timestamp: 'invalid',
        clientId: '',
        sequence: -1,
        type: 'INVALID_TYPE' as any,
        payload: {},
      };

      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
        // Each error should have a message
        result.errors.forEach(error => {
          expect(error.message).toBeTruthy();
        });
      }
    });

    it('includes field information in errors', () => {
      const operation = {
        ...baseValidOperation,
        sequence: -1,
      };

      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].field).toBeTruthy();
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles null operation gracefully', () => {
      const result = validateSyncOperation(null);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe(ValidationErrorCode.INVALID_TYPE);
      }
    });

    it('handles undefined operation gracefully', () => {
      const result = validateSyncOperation(undefined);
      expect(result.success).toBe(false);
    });

    it('handles operations with extra fields', () => {
      const operation = {
        ...baseValidOperation,
        extraField: 'should be ignored',
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(true);
    });

    it('rejects operations with wrong type coercion', () => {
      const operation = {
        ...baseValidOperation,
        sequence: '1', // String instead of number
      };
      const result = validateSyncOperation(operation);
      expect(result.success).toBe(false);
    });

    it('validates sequence as non-negative integer', () => {
      expect(
        validateSyncOperation({
          ...baseValidOperation,
          sequence: 0,
        }).success
      ).toBe(true);

      expect(
        validateSyncOperation({
          ...baseValidOperation,
          sequence: 1,
        }).success
      ).toBe(true);

      expect(
        validateSyncOperation({
          ...baseValidOperation,
          sequence: -1,
        }).success
      ).toBe(false);
    });
  });

  describe('Real-world Scenarios', () => {
    it('handles rapid successive operations with incrementing sequence', () => {
      const operations = Array.from({ length: 5 }, (_, i) => ({
        ...baseValidOperation,
        id: `op-${i}`,
        sequence: i,
      }));

      operations.forEach(op => {
        const result = validateSyncOperation(op);
        expect(result.success).toBe(true);
      });
    });

    it('validates operations from multiple clients', () => {
      const clients = ['client-1', 'client-2', 'client-3'];
      const operations = clients.map(clientId => ({
        ...baseValidOperation,
        clientId,
        id: `op-${clientId}-1`,
      }));

      operations.forEach(op => {
        const result = validateSyncOperation(op);
        expect(result.success).toBe(true);
      });
    });

    it('handles batch operation creation', () => {
      const now = new Date();
      const operations = Array.from({ length: 10 }, (_, i) => ({
        ...baseValidOperation,
        id: `batch-op-${i}`,
        sequence: i,
        timestamp: new Date(now.getTime() + i * 1000).toISOString(),
      }));

      const results = operations.map(op => validateSyncOperation(op));
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });
});
