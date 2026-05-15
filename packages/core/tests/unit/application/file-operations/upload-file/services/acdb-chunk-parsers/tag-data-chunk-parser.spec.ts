/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {TagDataChunkParser} from '../../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/tag-data-chunk-parser.js';
import {
  TagDataChunk,
  TagDataDotEntry,
  TagDataDefEntry,
  TagLutDataTable,
} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/tag-data-chunk.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/base-chunk-parser.js';

describe('TagDataChunkParser', () => {
  let parser: TagDataChunkParser;

  beforeEach(() => {
    parser = new TagDataChunkParser();
  });

  describe('extractTagDataDotEntry', () => {
    it('should extract single offset', () => {
      // Create MTDO chunk data: NumTaggedDataOffset=1, OffsetTaggedData=0x1000
      const dataDotData = new Uint8Array(8);
      const view = new DataView(dataDotData.buffer);
      view.setUint32(0, 1, true); // NumTaggedDataOffset = 1
      view.setUint32(4, 0x1000, true); // OffsetTaggedData = 0x1000

      const chunk = new TagDataChunk();
      const result = (parser as any).extractTagDataDotEntry(
        dataDotData,
        0,
        chunk,
      );

      expect(result.taggedDataOffsets).toEqual([0x1000]);
      expect(chunk.getTagDataDotEntry(0)).toEqual(result);
    });

    it('should extract multiple offsets', () => {
      // Create MTDO chunk data: NumTaggedDataOffset=3, offsets=[0x1000, 0x2000, 0x3000]
      const dataDotData = new Uint8Array(16);
      const view = new DataView(dataDotData.buffer);
      view.setUint32(0, 3, true); // NumTaggedDataOffset = 3
      view.setUint32(4, 0x1000, true); // Offset 1
      view.setUint32(8, 0x2000, true); // Offset 2
      view.setUint32(12, 0x3000, true); // Offset 3

      const chunk = new TagDataChunk();
      const result = (parser as any).extractTagDataDotEntry(
        dataDotData,
        0,
        chunk,
      );

      expect(result.taggedDataOffsets).toEqual([0x1000, 0x2000, 0x3000]);
    });

    it('should return cached entry', () => {
      const dataDotData = new Uint8Array(8);
      const view = new DataView(dataDotData.buffer);
      view.setUint32(0, 1, true);
      view.setUint32(4, 0x1000, true);

      const chunk = new TagDataChunk();
      const cachedEntry: TagDataDotEntry = {taggedDataOffsets: [0x9999]};
      chunk.setTagDataDotEntry(0, cachedEntry);

      const result = (parser as any).extractTagDataDotEntry(
        dataDotData,
        0,
        chunk,
      );

      expect(result).toBe(cachedEntry);
      expect(result.taggedDataOffsets).toEqual([0x9999]);
    });
  });

  describe('extractTagDataDefEntry', () => {
    it('should extract single tagged ID', () => {
      // Create MTDE chunk data: NumTaggedIDEntries=1, iId=100, pId=200
      const dataDefData = new Uint8Array(12);
      const view = new DataView(dataDefData.buffer);
      view.setUint32(0, 1, true); // NumTaggedIDEntries = 1
      view.setUint32(4, 100, true); // iId = 100
      view.setUint32(8, 200, true); // pId = 200

      const chunk = new TagDataChunk();
      const result = (parser as any).extractTagDataDefEntry(
        dataDefData,
        0,
        chunk,
      );

      expect(result.taggedIdEntries).toHaveLength(1);
      expect(result.taggedIdEntries[0]).toEqual({
        moduleInstanceId: 100,
        paramId: 200,
      });
      expect(chunk.getTagDataDefEntry(0)).toEqual(result);
    });

    it('should extract multiple tagged IDs', () => {
      // Create MTDE chunk data: NumTaggedIDEntries=2
      const dataDefData = new Uint8Array(20);
      const view = new DataView(dataDefData.buffer);
      view.setUint32(0, 2, true); // NumTaggedIDEntries = 2
      view.setUint32(4, 100, true); // iId = 100
      view.setUint32(8, 200, true); // pId = 200
      view.setUint32(12, 101, true); // iId = 101
      view.setUint32(16, 201, true); // pId = 201

      const chunk = new TagDataChunk();
      const result = (parser as any).extractTagDataDefEntry(
        dataDefData,
        0,
        chunk,
      );

      expect(result.taggedIdEntries).toHaveLength(2);
      expect(result.taggedIdEntries[0]).toEqual({
        moduleInstanceId: 100,
        paramId: 200,
      });
      expect(result.taggedIdEntries[1]).toEqual({
        moduleInstanceId: 101,
        paramId: 201,
      });
    });

    it('should return cached entry', () => {
      const dataDefData = new Uint8Array(12);
      const chunk = new TagDataChunk();
      const cachedEntry: TagDataDefEntry = {
        taggedIdEntries: [{moduleInstanceId: 999, paramId: 888}],
      };
      chunk.setTagDataDefEntry(0, cachedEntry);

      const result = (parser as any).extractTagDataDefEntry(
        dataDefData,
        0,
        chunk,
      );

      expect(result).toBe(cachedEntry);
      expect(result.taggedIdEntries[0].moduleInstanceId).toBe(999);
    });
  });

  describe('extractTagLutDataTable', () => {
    it('should extract single entry', () => {
      // Create MTLU chunk data: NumTagKeyVals=2, NumTagKeyVectorEntries=1
      // TagKeyVectorEntry: [key1, key2], offsetDEF=0x100, offsetDOT=0x200
      const dataLutData = new Uint8Array(24);
      const view = new DataView(dataLutData.buffer);
      view.setUint32(0, 2, true); // NumTagKeyVals = 2
      view.setUint32(4, 1, true); // NumTagKeyVectorEntries = 1
      view.setUint32(8, 10, true); // key1 = 10
      view.setUint32(12, 20, true); // key2 = 20
      view.setUint32(16, 0x100, true); // offsetDEF = 0x100
      view.setUint32(20, 0x200, true); // offsetDOT = 0x200

      const chunk = new TagDataChunk();
      // Create mock DEF and DOT data with proper structure at the offsets
      const dataDefData = new Uint8Array(0x200);
      const defView = new DataView(dataDefData.buffer);
      defView.setUint32(0x100, 1, true); // NumTaggedIDEntries = 1
      defView.setUint32(0x104, 100, true); // iId = 100
      defView.setUint32(0x108, 200, true); // pId = 200

      const dataDotData = new Uint8Array(0x300);
      const dotView = new DataView(dataDotData.buffer);
      dotView.setUint32(0x200, 1, true); // NumTaggedDataOffset = 1
      dotView.setUint32(0x204, 0x1000, true); // OffsetTaggedData = 0x1000

      const result = (parser as any).extractTagLutDataTable(
        dataLutData,
        0,
        chunk,
        dataDefData,
        dataDotData,
      );

      expect(result.numTagKeyValues).toBe(2);
      expect(result.numTagKeyVectorEntries).toBe(1);
      expect(result.tagKeyVectorEntries).toHaveLength(1);
      expect(result.tagKeyVectorEntries[0].tagKeyValues).toEqual([10, 20]);
      expect(result.tagKeyVectorEntries[0].offsetTagDataDEF).toBe(0x100);
      expect(result.tagKeyVectorEntries[0].offsetTagDataDOT).toBe(0x200);
      expect(chunk.getTagLutDataTable(0)).toEqual(result);
    });

    it('should extract multiple entries', () => {
      // Create MTLU chunk data: NumTagKeyVals=1, NumTagKeyVectorEntries=2
      const dataLutData = new Uint8Array(32);
      const view = new DataView(dataLutData.buffer);
      view.setUint32(0, 1, true); // NumTagKeyVals = 1
      view.setUint32(4, 2, true); // NumTagKeyVectorEntries = 2
      // Entry 1
      view.setUint32(8, 10, true); // key1 = 10
      view.setUint32(12, 0x100, true); // offsetDEF = 0x100
      view.setUint32(16, 0x200, true); // offsetDOT = 0x200
      // Entry 2
      view.setUint32(20, 20, true); // key1 = 20
      view.setUint32(24, 0x300, true); // offsetDEF = 0x300
      view.setUint32(28, 0x400, true); // offsetDOT = 0x400

      const chunk = new TagDataChunk();
      // Create mock DEF and DOT data with proper structure at the offsets
      const dataDefData = new Uint8Array(0x400);
      const dataDefView = new DataView(dataDefData.buffer);
      dataDefView.setUint32(0x100, 1, true); // NumTaggedIDEntries = 1
      dataDefView.setUint32(0x104, 100, true);
      dataDefView.setUint32(0x108, 200, true);
      dataDefView.setUint32(0x300, 1, true); // NumTaggedIDEntries = 1
      dataDefView.setUint32(0x304, 101, true);
      dataDefView.setUint32(0x308, 201, true);

      const dataDotData = new Uint8Array(0x500);
      const dataDotView = new DataView(dataDotData.buffer);
      dataDotView.setUint32(0x200, 1, true); // NumTaggedDataOffset = 1
      dataDotView.setUint32(0x204, 0x1000, true);
      dataDotView.setUint32(0x400, 1, true); // NumTaggedDataOffset = 1
      dataDotView.setUint32(0x404, 0x2000, true);

      const result = (parser as any).extractTagLutDataTable(
        dataLutData,
        0,
        chunk,
        dataDefData,
        dataDotData,
      );

      expect(result.numTagKeyValues).toBe(1);
      expect(result.numTagKeyVectorEntries).toBe(2);
      expect(result.tagKeyVectorEntries).toHaveLength(2);
      expect(result.tagKeyVectorEntries[0].tagKeyValues).toEqual([10]);
      expect(result.tagKeyVectorEntries[1].tagKeyValues).toEqual([20]);
    });

    it('should return cached table', () => {
      const dataLutData = new Uint8Array(0);
      const chunk = new TagDataChunk();
      const cachedTable: TagLutDataTable = {
        numTagKeyValues: 99,
        numTagKeyVectorEntries: 88,
        tagKeyVectorEntries: [],
      };
      chunk.setTagLutDataTable(0, cachedTable);

      const dataDefData = new Uint8Array(0);
      const dataDotData = new Uint8Array(0);

      const result = (parser as any).extractTagLutDataTable(
        dataLutData,
        0,
        chunk,
        dataDefData,
        dataDotData,
      );

      expect(result).toBe(cachedTable);
      expect(result.numTagKeyValues).toBe(99);
    });
  });

  describe('parse', () => {
    it('should parse single entry', () => {
      // Create MTKT chunk: NumTagIndexEntries=1, SGId=1, TagId=2, Offset=0
      const keyTableData = new Uint8Array(16);
      const keyView = new DataView(keyTableData.buffer);
      keyView.setUint32(0, 1, true); // NumTagIndexEntries = 1
      keyView.setUint32(4, 1, true); // SGId = 1
      keyView.setUint32(8, 2, true); // TagId = 2
      keyView.setUint32(12, 0, true); // OffsetTagDatTbl = 0

      // Create MTLU chunk: NumTagKeyVals=1, NumTagKeyVectorEntries=1
      const dataLutData = new Uint8Array(20);
      const lutView = new DataView(dataLutData.buffer);
      lutView.setUint32(0, 1, true); // NumTagKeyVals = 1
      lutView.setUint32(4, 1, true); // NumTagKeyVectorEntries = 1
      lutView.setUint32(8, 10, true); // key1 = 10
      lutView.setUint32(12, 0, true); // offsetDEF = 0
      lutView.setUint32(16, 0, true); // offsetDOT = 0

      // Create MTDE chunk: NumTaggedIDEntries=1
      const dataDefData = new Uint8Array(12);
      const defView = new DataView(dataDefData.buffer);
      defView.setUint32(0, 1, true); // NumTaggedIDEntries = 1
      defView.setUint32(4, 100, true); // iId = 100
      defView.setUint32(8, 200, true); // pId = 200

      // Create MTDO chunk: NumTaggedDataOffset=1
      const dataDotData = new Uint8Array(8);
      const dotView = new DataView(dataDotData.buffer);
      dotView.setUint32(0, 1, true); // NumTaggedDataOffset = 1
      dotView.setUint32(4, 0x1000, true); // OffsetTaggedData = 0x1000

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_LUT, dataLutData],
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DEF, dataDefData],
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DOT, dataDotData],
        ]),
        parsedChunks: new Map(),
      };

      const result = parser.parse(context);

      expect(result).toBeInstanceOf(TagDataChunk);
      expect(result.tagIndexEntries).toHaveLength(1);
      expect(result.tagIndexEntries[0]).toEqual({
        subgraphId: 1,
        tagId: 2,
        offsetTagDataTable: 0,
      });

      // Verify caches were populated
      const lutTable = result.getTagLutDataTable(0);
      expect(lutTable).toBeDefined();
      expect(lutTable?.numTagKeyValues).toBe(1);

      const defEntry = result.getTagDataDefEntry(0);
      expect(defEntry).toBeDefined();
      expect(defEntry?.taggedIdEntries).toHaveLength(1);

      const dotEntry = result.getTagDataDotEntry(0);
      expect(dotEntry).toBeDefined();
      expect(dotEntry?.taggedDataOffsets).toEqual([0x1000]);
    });

    it('should handle missing MTKT chunk', () => {
      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_LUT, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DEF, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DOT, new Uint8Array(0)],
        ]),
        parsedChunks: new Map(),
      };

      expect(() => parser.parse(context)).toThrow(
        'MODULE_TAG_KEY_TABLE chunk is required',
      );
    });

    it('should throw error for missing dependency chunks', () => {
      const keyTableData = new Uint8Array(4);
      const keyView = new DataView(keyTableData.buffer);
      keyView.setUint32(0, 0, true); // NumTagIndexEntries = 0

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.MODULE_TAG_KEY_TABLE, keyTableData],
          // Missing MTLU, MTDE, MTDO
        ]),
        parsedChunks: new Map(),
      };

      expect(() => parser.parse(context)).toThrow(
        'MODULE_TAG_DATA_LUT, MODULE_TAG_DATA_DEF, and MODULE_TAG_DATA_DOT chunks are required',
      );
    });
  });
});
