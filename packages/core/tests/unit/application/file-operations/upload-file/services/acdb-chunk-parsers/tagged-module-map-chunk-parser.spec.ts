/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {TaggedModuleMapChunkParser} from '../../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/tagged-module-map-chunk-parser.js';
import {
  ACDB_RAW_CHUNK_TYPES,
  PARSED_CHUNK_TYPES,
} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../../../../../../src/application/file-operations/upload-file/models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';

describe('TaggedModuleMapChunkParser', () => {
  let parser: TaggedModuleMapChunkParser;

  beforeEach(() => {
    parser = new TaggedModuleMapChunkParser();
  });

  it('should have correct chunk type', () => {
    expect(parser.chunkType).toBe(PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP);
  });

  describe('parse', () => {
    it('should throw error if TMLU chunk is missing', () => {
      const context: ChunkParseContext = {
        rawChunks: new Map(),
        parsedChunks: new Map(),
      };

      expect(() => parser.parse(context)).toThrow(
        'TAGGED_MODULES_LUT chunk is required',
      );
    });

    it('should throw error if TMDE chunk is missing', () => {
      const tmluData = new Uint8Array([0, 0, 0, 0]); // NumSGTagEntries = 0
      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT, tmluData],
        ]),
        parsedChunks: new Map(),
      };

      expect(() => parser.parse(context)).toThrow(
        'TAGGED_MODULES_DEF chunk is required',
      );
    });

    it('should parse empty TMLU chunk', () => {
      const tmluData = new Uint8Array([0, 0, 0, 0]); // NumSGTagEntries = 0
      const tmdeData = new Uint8Array([]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT, tmluData],
          [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_DEF, tmdeData],
        ]),
        parsedChunks: new Map(),
      };

      const chunk = parser.parse(context);

      expect(chunk.taggedModuleEntries).toEqual([]);
    });

    it('should parse TMLU chunk with single entry', () => {
      // TMLU: NumSGTagEntries=1, SGId=10, TagId=20, Offset=0
      const tmluData = new Uint8Array(16);
      const tmluView = new DataView(tmluData.buffer);
      BinaryUtils.writeUint32(tmluView, 0, 1); // NumSGTagEntries
      BinaryUtils.writeUint32(tmluView, 4, 10); // SGId
      BinaryUtils.writeUint32(tmluView, 8, 20); // TagId
      BinaryUtils.writeUint32(tmluView, 12, 0); // Offset

      // TMDE at offset 0: NumMIDIIDEntries=2, (mId=100,iId=1000), (mId=200,iId=2000)
      const tmdeData = new Uint8Array(20);
      const tmdeView = new DataView(tmdeData.buffer);
      BinaryUtils.writeUint32(tmdeView, 0, 2); // NumMIDIIDEntries
      BinaryUtils.writeUint32(tmdeView, 4, 100); // mId
      BinaryUtils.writeUint32(tmdeView, 8, 1000); // iId
      BinaryUtils.writeUint32(tmdeView, 12, 200); // mId
      BinaryUtils.writeUint32(tmdeView, 16, 2000); // iId

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT, tmluData],
          [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_DEF, tmdeData],
        ]),
        parsedChunks: new Map(),
      };

      const chunk = parser.parse(context);

      expect(chunk.taggedModuleEntries).toHaveLength(1);
      expect(chunk.taggedModuleEntries[0]).toEqual({
        subgraphId: 10,
        tagId: 20,
        offsetTaggedModuleDef: 0,
      });

      const defEntry = chunk.getTaggedModuleDef(0);
      expect(defEntry).toBeDefined();
      expect(defEntry!.moduleInstancePairs).toEqual([
        {moduleId: 100, instanceId: 1000},
        {moduleId: 200, instanceId: 2000},
      ]);
    });

    it('should cache TMDE entries by offset', () => {
      // TMLU: NumSGTagEntries=2, both pointing to same offset
      const tmluData = new Uint8Array(28);
      const tmluView = new DataView(tmluData.buffer);
      BinaryUtils.writeUint32(tmluView, 0, 2); // NumSGTagEntries
      BinaryUtils.writeUint32(tmluView, 4, 10); // SGId
      BinaryUtils.writeUint32(tmluView, 8, 20); // TagId
      BinaryUtils.writeUint32(tmluView, 12, 0); // Offset (same)
      BinaryUtils.writeUint32(tmluView, 16, 11); // SGId
      BinaryUtils.writeUint32(tmluView, 20, 21); // TagId
      BinaryUtils.writeUint32(tmluView, 24, 0); // Offset (same)

      // TMDE at offset 0: NumMIDIIDEntries=1, (mId=100,iId=1000)
      const tmdeData = new Uint8Array(12);
      const tmdeView = new DataView(tmdeData.buffer);
      BinaryUtils.writeUint32(tmdeView, 0, 1); // NumMIDIIDEntries
      BinaryUtils.writeUint32(tmdeView, 4, 100); // mId
      BinaryUtils.writeUint32(tmdeView, 8, 1000); // iId

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT, tmluData],
          [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_DEF, tmdeData],
        ]),
        parsedChunks: new Map(),
      };

      const chunk = parser.parse(context);

      // Both entries should reference the same cached TMDE entry
      const defEntry1 = chunk.getTaggedModuleDef(0);
      const defEntry2 = chunk.getTaggedModuleDef(0);
      expect(defEntry1).toBe(defEntry2); // Same object reference
    });
  });
});
