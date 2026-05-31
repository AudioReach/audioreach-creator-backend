/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {DatapoolChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/datapool-chunk-serializer.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';

describe('DatapoolChunkSerializer', () => {
  let serializer: DatapoolChunkSerializer;

  beforeEach(() => {
    serializer = new DatapoolChunkSerializer();
  });

  describe('serialize', () => {
    it('should serialize single payload with size prefix', () => {
      const datapool = new DatapoolChunk();
      const payload = new Uint8Array([1, 2, 3, 4]);
      datapool.addOrReuse(payload);

      const result = serializer.serialize(datapool);

      // Should include 4-byte size prefix + payload + 4 bytes padding (8-byte alignment)
      expect(result.byteLength).toBe(12); // 4 (size) + 4 (payload) + 4 (padding)
      const view = new DataView(result.buffer);
      expect(BinaryUtils.readUint32(view, 0)).toBe(4); // Size
      expect(result[4]).toBe(1);
      expect(result[5]).toBe(2);
      expect(result[6]).toBe(3);
      expect(result[7]).toBe(4);
    });

    it('should concatenate multiple payloads with size prefixes', () => {
      const datapool = new DatapoolChunk();
      const payload1 = new Uint8Array([1, 2, 3]);
      const payload2 = new Uint8Array([4, 5]);
      const payload3 = new Uint8Array([6, 7, 8, 9]);

      datapool.addOrReuse(payload1);
      datapool.addOrReuse(payload2);
      datapool.addOrReuse(payload3);

      const result = serializer.serialize(datapool);

      // Total: (4+3+5) + (4+2+6) + (4+4+4) = 12 + 12 + 12 = 36 bytes (with 8-byte alignment padding)
      expect(result.byteLength).toBe(36);

      const view = new DataView(result.buffer);
      // First payload
      expect(BinaryUtils.readUint32(view, 0)).toBe(3);
      expect(result[4]).toBe(1);
      expect(result[5]).toBe(2);
      expect(result[6]).toBe(3);
      // Second payload at offset 12 (4+3+5 padding)
      expect(BinaryUtils.readUint32(view, 12)).toBe(2);
      expect(result[16]).toBe(4);
      expect(result[17]).toBe(5);
      // Third payload at offset 24 (12+4+2+6 padding)
      expect(BinaryUtils.readUint32(view, 24)).toBe(4);
      expect(result[28]).toBe(6);
      expect(result[29]).toBe(7);
      expect(result[30]).toBe(8);
      expect(result[31]).toBe(9);
    });

    it('should handle empty datapool', () => {
      const datapool = new DatapoolChunk();

      const result = serializer.serialize(datapool);

      expect(result.byteLength).toBe(0);
    });

    it('should preserve payload order', () => {
      const datapool = new DatapoolChunk();
      datapool.addOrReuse(new Uint8Array([0xaa]));
      datapool.addOrReuse(new Uint8Array([0xbb]));
      datapool.addOrReuse(new Uint8Array([0xcc]));

      const result = serializer.serialize(datapool);

      // Each payload: 4 bytes (size) + 1 byte (data) + 7 bytes padding = 12 bytes each
      expect(result.byteLength).toBe(36);
      // First payload data at offset 4
      expect(result[4]).toBe(0xaa);
      // Second payload data at offset 16 (12 + 4)
      expect(result[16]).toBe(0xbb);
      // Third payload data at offset 28 (24 + 4)
      expect(result[28]).toBe(0xcc);
    });

    it('should handle large payloads', () => {
      const datapool = new DatapoolChunk();
      const largePayload = new Uint8Array(1000).fill(0x42);
      datapool.add(largePayload);

      const result = serializer.serialize(datapool);

      // 4 bytes (size) + 1000 bytes (payload) = 1004 bytes
      expect(result.byteLength).toBe(1004);
      const view = new DataView(result.buffer);
      expect(BinaryUtils.readUint32(view, 0)).toBe(1000);
      // Check payload starts at offset 4
      expect(result.slice(4).every(byte => byte === 0x42)).toBe(true);
    });
  });

  describe('calculateSize', () => {
    it('should calculate size for single payload', () => {
      const datapool = new DatapoolChunk();
      datapool.addOrReuse(new Uint8Array([1, 2, 3, 4]));

      const size = serializer.calculateSize(datapool);

      // 4 (size prefix) + 4 (payload) + 4 (padding) = 12
      expect(size).toBe(12);
    });

    it('should calculate size for multiple payloads', () => {
      const datapool = new DatapoolChunk();
      datapool.addOrReuse(new Uint8Array([1, 2, 3]));
      datapool.addOrReuse(new Uint8Array([4, 5]));
      datapool.addOrReuse(new Uint8Array([6, 7, 8, 9]));

      const size = serializer.calculateSize(datapool);

      // (4+3+5) + (4+2+6) + (4+4+4) = 36
      expect(size).toBe(36);
    });

    it('should return 0 for empty datapool', () => {
      const datapool = new DatapoolChunk();

      const size = serializer.calculateSize(datapool);

      expect(size).toBe(0);
    });
  });
});
