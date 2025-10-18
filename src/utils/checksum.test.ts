// src/utils/checksum.test.ts
import { describe, it, expect } from 'vitest';
import { generateChecksum } from './checksum';

describe('checksum', () => {
  describe('generateChecksum', () => {
    it('should generate consistent checksums for same data', () => {
      const data = { name: 'test', value: 42, items: [1, 2, 3] };

      const checksum1 = generateChecksum(data);
      const checksum2 = generateChecksum(data);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate same checksum regardless of key order', () => {
      const data1 = { a: 1, b: 2, c: 3 };
      const data2 = { c: 3, a: 1, b: 2 };

      const checksum1 = generateChecksum(data1);
      const checksum2 = generateChecksum(data2);

      expect(checksum1).toBe(checksum2);
    });

    it('should generate different checksums for different data', () => {
      const data1 = { name: 'test1', value: 42 };
      const data2 = { name: 'test2', value: 42 };

      const checksum1 = generateChecksum(data1);
      const checksum2 = generateChecksum(data2);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle nested objects consistently', () => {
      const data1 = {
        outer: { inner: { value: 42, text: 'hello' } },
        array: [1, 2, 3],
      };
      const data2 = {
        array: [1, 2, 3],
        outer: { inner: { text: 'hello', value: 42 } },
      };

      const checksum1 = generateChecksum(data1);
      const checksum2 = generateChecksum(data2);

      expect(checksum1).toBe(checksum2);
    });

    it('should handle arrays correctly', () => {
      const data1 = { items: [1, 2, 3] };
      const data2 = { items: [3, 2, 1] };

      const checksum1 = generateChecksum(data1);
      const checksum2 = generateChecksum(data2);

      // Arrays with different order should have different checksums
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle Date objects consistently', () => {
      const date = new Date('2025-01-01T00:00:00Z');
      const data1 = { timestamp: date };
      const data2 = { timestamp: new Date('2025-01-01T00:00:00Z') };

      const checksum1 = generateChecksum(data1);
      const checksum2 = generateChecksum(data2);

      expect(checksum1).toBe(checksum2);
    });

    it('should handle null and undefined', () => {
      const data1 = { value: null };
      const data2 = { value: undefined };

      const checksum1 = generateChecksum(data1);
      const checksum2 = generateChecksum(data2);

      // null and undefined should produce different checksums
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle primitives', () => {
      expect(generateChecksum('hello')).toBe(generateChecksum('hello'));
      expect(generateChecksum(42)).toBe(generateChecksum(42));
      expect(generateChecksum(true)).toBe(generateChecksum(true));

      expect(generateChecksum('hello')).not.toBe(generateChecksum('world'));
      expect(generateChecksum(42)).not.toBe(generateChecksum(43));
    });

    it('should handle empty objects and arrays', () => {
      const emptyObj = {};
      const emptyArr: any[] = [];

      expect(generateChecksum(emptyObj)).toBe(generateChecksum({}));
      expect(generateChecksum(emptyArr)).toBe(generateChecksum([]));
      expect(generateChecksum(emptyObj)).not.toBe(generateChecksum(emptyArr));
    });

    it('should handle complex nested structures', () => {
      const complexData = {
        addresses: [
          { address: '123 Main St', lat: 40.7, lng: -74.0 },
          { address: '456 Oak Ave', lat: 40.8, lng: -74.1 },
        ],
        completions: [
          { index: 0, outcome: 'PIF', timestamp: '2025-01-01T00:00:00Z' },
        ],
        metadata: {
          version: 1,
          lastSync: new Date('2025-01-01T00:00:00Z'),
          deviceId: 'device-123',
        },
      };

      const checksum1 = generateChecksum(complexData);
      const checksum2 = generateChecksum(JSON.parse(JSON.stringify(complexData)));

      expect(checksum1).toBe(checksum2);
    });

    it('should produce string output', () => {
      const checksum = generateChecksum({ test: 'data' });
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });
  });
});
