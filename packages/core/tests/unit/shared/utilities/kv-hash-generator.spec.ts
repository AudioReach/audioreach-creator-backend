/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {KvHashGenerator} from '../../../../src/shared/utilities/kv-hash-generator.js';

describe('KvHashGenerator', () => {
  describe('generateHash', () => {
    describe('Basic Hash Generation', () => {
      it('should generate hash from single value system ID', () => {
        const hash = KvHashGenerator.generateHash([1]);

        expect(hash).toBeDefined();
        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(64); // SHA-256 hex is 64 characters
      });

      it('should generate hash from multiple value system IDs', () => {
        const hash = KvHashGenerator.generateHash([1, 2, 3]);

        expect(hash).toBeDefined();
        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(64);
      });

      it('should generate deterministic hash (same input = same output)', () => {
        const hash1 = KvHashGenerator.generateHash([1, 2, 3]);
        const hash2 = KvHashGenerator.generateHash([1, 2, 3]);

        expect(hash1).toBe(hash2);
      });

      it('should generate valid hex string', () => {
        const hash = KvHashGenerator.generateHash([1, 2, 3]);

        // Should only contain hex characters (0-9, a-f)
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });
    });

    describe('Hash Uniqueness', () => {
      it('should produce different hashes for different value combinations', () => {
        const hash1 = KvHashGenerator.generateHash([1, 2, 3]);
        const hash2 = KvHashGenerator.generateHash([4, 5, 6]);

        expect(hash1).not.toBe(hash2);
      });

      it('should produce different hashes for [1, 2] and [1, 2, 3]', () => {
        const hash1 = KvHashGenerator.generateHash([1, 2]);
        const hash2 = KvHashGenerator.generateHash([1, 2, 3]);

        expect(hash1).not.toBe(hash2);
      });

      it('should produce different hashes for [1, 2] and [2, 3]', () => {
        const hash1 = KvHashGenerator.generateHash([1, 2]);
        const hash2 = KvHashGenerator.generateHash([2, 3]);

        expect(hash1).not.toBe(hash2);
      });

      it('should produce different hashes for single vs multiple values', () => {
        const hash1 = KvHashGenerator.generateHash([1]);
        const hash2 = KvHashGenerator.generateHash([1, 1]);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty array', () => {
        const hash = KvHashGenerator.generateHash([]);

        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
      });

      it('should handle single element array', () => {
        const hash = KvHashGenerator.generateHash([42]);

        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
      });

      it('should handle large arrays', () => {
        const largeArray = Array.from({length: 100}, (_, i) => i);
        const hash = KvHashGenerator.generateHash(largeArray);

        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
      });

      it('should handle duplicate values in array', () => {
        const hash1 = KvHashGenerator.generateHash([1, 1, 2, 2]);
        const hash2 = KvHashGenerator.generateHash([1, 1, 2, 2]);

        expect(hash1).toBe(hash2);
      });

      it('should handle very large value system IDs', () => {
        const maxUint32 = 0xff_ff_ff_ff;
        const hash = KvHashGenerator.generateHash([maxUint32, maxUint32 - 1]);

        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
      });

      it('should handle zero values', () => {
        const hash = KvHashGenerator.generateHash([0, 0, 0]);

        expect(hash).toBeDefined();
        expect(hash.length).toBe(64);
      });
    });

    describe('Integration Scenarios', () => {
      it('should produce hash usable as Map key', () => {
        const map = new Map<string, number>();
        const hash = KvHashGenerator.generateHash([1, 2, 3]);

        map.set(hash, 42);

        expect(map.get(hash)).toBe(42);
        expect(map.has(hash)).toBe(true);
      });

      it('should handle multiple unique combinations', () => {
        const combinations = [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
          [1, 2, 4],
          [1, 3, 5],
        ];

        const hashes = combinations.map(combo =>
          KvHashGenerator.generateHash(combo),
        );

        // All hashes should be unique
        const uniqueHashes = new Set(hashes);
        expect(uniqueHashes.size).toBe(combinations.length);
      });
    });

    describe('Performance', () => {
      it('should generate hash quickly for typical arrays', () => {
        const start = Date.now();

        for (let i = 0; i < 1000; i++) {
          KvHashGenerator.generateHash([1, 2, 3, 4, 5]);
        }

        const duration = Date.now() - start;

        // 1000 hashes should complete in under 100ms
        expect(duration).toBeLessThan(100);
      });

      it('should handle repeated calls without memory issues', () => {
        const initialMemory = process.memoryUsage().heapUsed;

        for (let i = 0; i < 10000; i++) {
          KvHashGenerator.generateHash([i, i + 1, i + 2]);
        }

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = finalMemory - initialMemory;

        // Memory increase should be reasonable (less than 10MB)
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      });
    });
  });
});
