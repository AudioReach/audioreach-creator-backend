/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DatapoolChunk} from '../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {DatapoolChunkParser} from '../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/datapool-chunk-parser.js';
import {CHUNK_TYPES} from '../../../../src/application/file-operations/shared/constants/chunk-types.js';
import {BinaryUtils} from '../../../../src/shared/utilities/binary-utils.js';

describe('DatapoolChunk', () => {
  describe('DatapoolChunk class', () => {
    it('should have correct chunk type', () => {
      const chunk = new DatapoolChunk();
      expect(chunk.chunkType).toBe(CHUNK_TYPES.DATAPOOL);
    });

    it('should be serializable with structuredClone', () => {
      const chunk = new DatapoolChunk();
      chunk.payloads = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
      chunk.offsets = [0, 10];
      chunk.totalLength = 20;

      const cloned = structuredClone(chunk);

      expect(cloned.payloads).toEqual(chunk.payloads);
      expect(cloned.offsets).toEqual(chunk.offsets);
      expect(cloned.totalLength).toBe(chunk.totalLength);
      expect(cloned.chunkType).toBe(CHUNK_TYPES.DATAPOOL);
    });
  });

  describe('DatapoolChunkParser', () => {
    let parser: DatapoolChunkParser;

    beforeEach(() => {
      parser = new DatapoolChunkParser();
    });

    it('should have correct chunk type', () => {
      expect(parser.chunkType).toBe(CHUNK_TYPES.DATAPOOL);
    });

    it('should parse empty datapool chunk', () => {
      const emptyData = new Uint8Array(0);
      const context = {
        rawChunks: new Map([[CHUNK_TYPES.DATAPOOL, emptyData]]),
      };

      const result = parser.parse(context);

      expect(result.payloads).toEqual([]);
      expect(result.offsets).toEqual([]);
      expect(result.totalLength).toBe(0);
    });

    it('should parse single payload without padding', () => {
      // Create test data: size (4 bytes) + payload (8 bytes, no padding needed)
      const payload = new Uint8Array([
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      ]);
      const data = new Uint8Array(4 + payload.length);
      const view = new DataView(data.buffer);

      // Write payload size
      BinaryUtils.writeUint32(view, 0, payload.length);
      // Write payload data
      data.set(payload, 4);

      const context = {
        rawChunks: new Map([[CHUNK_TYPES.DATAPOOL, data]]),
      };

      const result = parser.parse(context);

      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0]).toEqual(payload);
      expect(result.offsets).toEqual([0]);
      expect(result.totalLength).toBe(data.length);
    });

    it('should parse single payload with padding', () => {
      // Create test data: size (4 bytes) + payload (5 bytes) + padding (3 bytes)
      const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
      const paddingSize = 8 - (payload.length % 8); // 3 bytes padding
      const data = new Uint8Array(4 + payload.length + paddingSize);
      const view = new DataView(data.buffer);

      // Write payload size
      BinaryUtils.writeUint32(view, 0, payload.length);
      // Write payload data
      data.set(payload, 4);
      // Padding bytes are already zero-initialized

      const context = {
        rawChunks: new Map([[CHUNK_TYPES.DATAPOOL, data]]),
      };

      const result = parser.parse(context);

      expect(result.payloads).toHaveLength(1);
      expect(result.payloads[0]).toEqual(payload);
      expect(result.offsets).toEqual([0]);
      expect(result.totalLength).toBe(data.length);
    });

    it('should parse multiple payloads', () => {
      // Create test data with two payloads
      const payload1 = new Uint8Array([0x01, 0x02, 0x03]);
      const payload2 = new Uint8Array([0x04, 0x05, 0x06, 0x07, 0x08]);

      const padding1 = 8 - (payload1.length % 8); // 5 bytes padding
      const padding2 = 8 - (payload2.length % 8); // 3 bytes padding

      const totalSize =
        4 + payload1.length + padding1 + 4 + payload2.length + padding2;
      const data = new Uint8Array(totalSize);
      const view = new DataView(data.buffer);

      let pos = 0;

      // First payload
      BinaryUtils.writeUint32(view, pos, payload1.length);
      pos += 4;
      data.set(payload1, pos);
      pos += payload1.length + padding1;

      // Second payload
      const secondOffset = pos;
      BinaryUtils.writeUint32(view, pos, payload2.length);
      pos += 4;
      data.set(payload2, pos);

      const context = {
        rawChunks: new Map([[CHUNK_TYPES.DATAPOOL, data]]),
      };

      const result = parser.parse(context);

      expect(result.payloads).toHaveLength(2);
      expect(result.payloads[0]).toEqual(payload1);
      expect(result.payloads[1]).toEqual(payload2);
      expect(result.offsets).toEqual([0, secondOffset]);
      expect(result.totalLength).toBe(data.length);
    });

    it('should throw error for missing chunk in context', () => {
      const context = {
        rawChunks: new Map([[CHUNK_TYPES.HEADER, new Uint8Array([1, 2, 3])]]),
      };

      expect(() => parser.parse(context)).toThrow(
        'DATAPOOL chunk not found in context',
      );
    });

    it('should throw error for insufficient data', () => {
      // Data too short for payload size
      const data = new Uint8Array([0x01, 0x02]); // Only 2 bytes, need 4 for size
      const context = {
        rawChunks: new Map([[CHUNK_TYPES.DATAPOOL, data]]),
      };

      expect(() => parser.parse(context)).toThrow(
        'insufficient data for payload size',
      );
    });
  });
});
