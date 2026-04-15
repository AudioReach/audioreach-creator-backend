/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {AudioCalibrationChunkParser} from '../../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/audio-calibration-chunk-parser.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';
import type {ChunkParseContext} from '../../../../../../../src/application/file-operations/upload-file/models/chunk-parse-context.js';
import {createMockLogger} from '../../../../../../helpers/index.js';

describe('AudioCalibrationChunkParser', () => {
  let parser: AudioCalibrationChunkParser;

  beforeEach(() => {
    const mockLogger = createMockLogger();
    parser = new AudioCalibrationChunkParser(mockLogger);
  });

  describe('Parser Metadata', () => {
    it('should have correct chunk type', () => {
      expect(parser.chunkType).toBe(PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA);
    });
  });

  describe('parse() - Basic Functionality', () => {
    it('should return empty chunk when CALIBRATION_SUBGRAPH_LUT is missing', () => {
      const context: ChunkParseContext = {
        rawChunks: new Map(),
      };

      const result = parser.parse(context);

      expect(result.subgraphLookupEntries).toEqual([]);
      expect(result.getSubgraphCount()).toBe(0);
    });

    it('should return empty chunk when CALIBRATION_SUBGRAPH_LUT is empty', () => {
      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, new Uint8Array(0)],
        ]),
      };

      const result = parser.parse(context);

      expect(result.subgraphLookupEntries).toEqual([]);
      expect(result.getSubgraphCount()).toBe(0);
    });

    it('should throw error when required dependent chunks are missing', () => {
      const lutData = new Uint8Array(4);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1); // numSgids = 1

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          // Missing other required chunks
        ]),
      };

      expect(() => parser.parse(context)).toThrow();
    });

    it('should parse chunk with zero subgraphs', () => {
      const lutData = new Uint8Array(4);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 0); // numSgids = 0

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, new Uint8Array(0)],
        ]),
      };

      const result = parser.parse(context);

      expect(result.subgraphLookupEntries).toEqual([]);
      expect(result.getSubgraphCount()).toBe(0);
    });
  });

  describe('parse() - Single Subgraph with Simple Data', () => {
    it('should parse single subgraph with one CalKeyTableEntry', () => {
      // Build CALIBRATION_SUBGRAPH_LUT chunk
      // Format: NumSGIDs SGLUTEntry+
      // SGLUTEntry = SGId NumCalKeyTblEntries CalKeyTblEntry+
      // CalKeyTblEntry = OffsetCalKeyTbl OffsetCalLUTTable
      const lutData = new Uint8Array(20); // 4 + 4 + 4 + 4 + 4 = 20 bytes
      const lutView = new DataView(lutData.buffer);
      let offset = 0;

      BinaryUtils.writeUint32(lutView, offset, 1); // numSgids = 1
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 100); // sgId = 100
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 1); // numCalKeyTblEntries = 1
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 0); // offsetCalKeyTbl = 0
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 0); // offsetCalLUTTable = 0

      // Build CALIBRATION_KEY_TABLE chunk
      // Format: CalKeyTbl = NumKeyIds KeyId+
      const keyTableData = new Uint8Array(12);
      const keyTableView = new DataView(keyTableData.buffer);
      BinaryUtils.writeUint32(keyTableView, 0, 2); // numKeyIds = 2
      BinaryUtils.writeUint32(keyTableView, 4, 1); // keyId = 1
      BinaryUtils.writeUint32(keyTableView, 8, 2); // keyId = 2

      // Build CALIBRATION_DATA_LUT chunk
      // Format: CKVLUTTbl = NumCalKeyVals NumCKVLUTEntries CKVLUTEntry+
      // CKVLUTEntry = CalKeyVal+ OffsetCalDEF OffsetCalDOT OffsetDOT2
      const dataLutData = new Uint8Array(28); // 4 + 4 + (2*4) + 4 + 4 + 4 = 28 bytes
      const dataLutView = new DataView(dataLutData.buffer);
      offset = 0;
      BinaryUtils.writeUint32(dataLutView, offset, 2); // numCalKeyVals = 2
      offset += 4;
      BinaryUtils.writeUint32(dataLutView, offset, 1); // numCKVLUTEntries = 1
      offset += 4;
      BinaryUtils.writeUint32(dataLutView, offset, 10); // calKeyVal[0] = 10
      offset += 4;
      BinaryUtils.writeUint32(dataLutView, offset, 20); // calKeyVal[1] = 20
      offset += 4;
      BinaryUtils.writeUint32(dataLutView, offset, 0); // offsetCalDEF = 0
      offset += 4;
      BinaryUtils.writeUint32(dataLutView, offset, 0); // offsetCalDOT = 0
      offset += 4;
      BinaryUtils.writeUint32(dataLutView, offset, 0); // offsetDOT2 = 0

      // Build CALIBRATION_DATA_DEF chunk
      // Format: CalDEFEntry = NumCalIdEntries CalIdEntry+
      // CalIdEntry = iId pId
      const dataDefData = new Uint8Array(12);
      const dataDefView = new DataView(dataDefData.buffer);
      BinaryUtils.writeUint32(dataDefView, 0, 1); // numCalIdEntries = 1
      BinaryUtils.writeUint32(dataDefView, 4, 1000); // iId = 1000
      BinaryUtils.writeUint32(dataDefView, 8, 2000); // pId = 2000

      // Build CALIBRATION_DATA_DOT chunk
      // Format: CalDOTEntry = NumCalDataOffsets CalDataOffset+
      const dataDotData = new Uint8Array(8);
      const dataDotView = new DataView(dataDotData.buffer);
      BinaryUtils.writeUint32(dataDotView, 0, 1); // numCalDataOffsets = 1
      BinaryUtils.writeUint32(dataDotView, 4, 5000); // calDataOffset = 5000

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, dataLutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, dataDefData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, dataDotData],
        ]),
      };

      const result = parser.parse(context);

      // Verify structure
      expect(result.getSubgraphCount()).toBe(1);
      expect(result.getAllSubgraphIds()).toEqual([100]);

      const sgEntry = result.subgraphLookupEntries[0];
      expect(sgEntry.subgraphId).toBe(100);
      expect(sgEntry.calKeyTableEntries).toHaveLength(1);

      const calKeyTableEntry = sgEntry.calKeyTableEntries[0];
      expect(calKeyTableEntry.offsetCalKeyTable).toBe(0);
      expect(calKeyTableEntry.offsetCalLookupTable).toBe(0);

      // Verify cached data
      const keyTable = result.getCalKeyTable(0);
      expect(keyTable).toEqual([1, 2]);

      const ckvLookupTable = result.getCkvLookupTable(0);
      expect(ckvLookupTable).toBeDefined();
      expect(ckvLookupTable?.numCalKeyValues).toBe(2);
      expect(ckvLookupTable?.ckvLookupEntries).toHaveLength(1);
      expect(ckvLookupTable?.ckvLookupEntries[0].calKeyValues).toEqual([
        10, 20,
      ]);

      const defEntry = result.getCalDefinitionEntry(0);
      expect(defEntry).toBeDefined();
      expect(defEntry?.calIdEntries).toHaveLength(1);
      expect(defEntry?.calIdEntries[0]).toEqual({
        moduleInstanceId: 1000,
        paramId: 2000,
      });

      const dotEntry = result.getCalDataOffsetEntry(0);
      expect(dotEntry).toBeDefined();
      expect(dotEntry?.calDataOffsets).toEqual([5000]);
    });
  });

  describe('parse() - Multiple Subgraphs', () => {
    it('should parse multiple subgraphs', () => {
      // Build CALIBRATION_SUBGRAPH_LUT chunk with 2 subgraphs
      const lutData = new Uint8Array(36); // 4 + (4+4+4+4) + (4+4+4+4) = 36 bytes
      const lutView = new DataView(lutData.buffer);
      let offset = 0;

      BinaryUtils.writeUint32(lutView, offset, 2); // numSgids = 2
      offset += 4;

      // First subgraph
      BinaryUtils.writeUint32(lutView, offset, 100); // sgId = 100
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 1); // numCalKeyTblEntries = 1
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 0); // offsetCalKeyTbl = 0
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 0); // offsetCalLUTTable = 0
      offset += 4;

      // Second subgraph
      BinaryUtils.writeUint32(lutView, offset, 200); // sgId = 200
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 1); // numCalKeyTblEntries = 1
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 12); // offsetCalKeyTbl = 12 (different offset)
      offset += 4;
      BinaryUtils.writeUint32(lutView, offset, 28); // offsetCalLUTTable = 28 (different offset, points to second LUT table)

      // Build CALIBRATION_KEY_TABLE chunk with two key tables
      const keyTableData = new Uint8Array(24);
      const keyTableView = new DataView(keyTableData.buffer);
      // First key table at offset 0
      BinaryUtils.writeUint32(keyTableView, 0, 2); // numKeyIds = 2
      BinaryUtils.writeUint32(keyTableView, 4, 1); // keyId = 1
      BinaryUtils.writeUint32(keyTableView, 8, 2); // keyId = 2
      // Second key table at offset 12
      BinaryUtils.writeUint32(keyTableView, 12, 2); // numKeyIds = 2
      BinaryUtils.writeUint32(keyTableView, 16, 3); // keyId = 3
      BinaryUtils.writeUint32(keyTableView, 20, 4); // keyId = 4

      // Build minimal CALIBRATION_DATA_LUT chunks
      const dataLutData = new Uint8Array(56); // 28 + 28 = 56 bytes
      const dataLutView = new DataView(dataLutData.buffer);
      // First LUT table at offset 0
      BinaryUtils.writeUint32(dataLutView, 0, 2); // numCalKeyVals = 2
      BinaryUtils.writeUint32(dataLutView, 4, 1); // numCKVLUTEntries = 1
      BinaryUtils.writeUint32(dataLutView, 8, 10); // calKeyVal[0]
      BinaryUtils.writeUint32(dataLutView, 12, 20); // calKeyVal[1]
      BinaryUtils.writeUint32(dataLutView, 16, 0); // offsetCalDEF
      BinaryUtils.writeUint32(dataLutView, 20, 0); // offsetCalDOT
      BinaryUtils.writeUint32(dataLutView, 24, 0); // offsetDOT2
      // Second LUT table at offset 28 (different offset)
      BinaryUtils.writeUint32(dataLutView, 28, 2); // numCalKeyVals = 2
      BinaryUtils.writeUint32(dataLutView, 32, 1); // numCKVLUTEntries = 1
      BinaryUtils.writeUint32(dataLutView, 36, 30); // calKeyVal[0]
      BinaryUtils.writeUint32(dataLutView, 40, 40); // calKeyVal[1]
      BinaryUtils.writeUint32(dataLutView, 44, 12); // offsetCalDEF (different)
      BinaryUtils.writeUint32(dataLutView, 48, 8); // offsetCalDOT (different)
      BinaryUtils.writeUint32(dataLutView, 52, 0); // offsetDOT2

      // Build CALIBRATION_DATA_DEF chunk
      const dataDefData = new Uint8Array(24);
      const dataDefView = new DataView(dataDefData.buffer);
      // First DEF at offset 0
      BinaryUtils.writeUint32(dataDefView, 0, 1); // numCalIdEntries = 1
      BinaryUtils.writeUint32(dataDefView, 4, 1000); // iId
      BinaryUtils.writeUint32(dataDefView, 8, 2000); // pId
      // Second DEF at offset 12
      BinaryUtils.writeUint32(dataDefView, 12, 1); // numCalIdEntries = 1
      BinaryUtils.writeUint32(dataDefView, 16, 3000); // iId
      BinaryUtils.writeUint32(dataDefView, 20, 4000); // pId

      // Build CALIBRATION_DATA_DOT chunk
      const dataDotData = new Uint8Array(16);
      const dataDotView = new DataView(dataDotData.buffer);
      // First DOT at offset 0
      BinaryUtils.writeUint32(dataDotView, 0, 1); // numCalDataOffsets = 1
      BinaryUtils.writeUint32(dataDotView, 4, 5000); // offset
      // Second DOT at offset 8
      BinaryUtils.writeUint32(dataDotView, 8, 1); // numCalDataOffsets = 1
      BinaryUtils.writeUint32(dataDotView, 12, 6000); // offset

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, dataLutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, dataDefData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, dataDotData],
        ]),
      };

      const result = parser.parse(context);

      // Verify structure
      expect(result.getSubgraphCount()).toBe(2);
      expect(result.getAllSubgraphIds()).toEqual([100, 200]);

      // Verify first subgraph
      expect(result.subgraphLookupEntries[0].subgraphId).toBe(100);
      expect(result.getCalKeyTable(0)).toEqual([1, 2]);

      // Verify second subgraph
      expect(result.subgraphLookupEntries[1].subgraphId).toBe(200);
      expect(result.getCalKeyTable(12)).toEqual([3, 4]);
    });
  });

  describe('Caching Behavior', () => {
    it('should cache key table and return same instance on second access', () => {
      const lutData = new Uint8Array(20); // 4 + 4 + 4 + 4 + 4 = 20 bytes
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1); // numSgids
      BinaryUtils.writeUint32(lutView, 4, 100); // sgId
      BinaryUtils.writeUint32(lutView, 8, 1); // numCalKeyTblEntries
      BinaryUtils.writeUint32(lutView, 12, 0); // offsetCalKeyTbl
      BinaryUtils.writeUint32(lutView, 16, 0); // offsetCalLUTTable

      const keyTableData = new Uint8Array(12);
      const keyTableView = new DataView(keyTableData.buffer);
      BinaryUtils.writeUint32(keyTableView, 0, 2);
      BinaryUtils.writeUint32(keyTableView, 4, 1);
      BinaryUtils.writeUint32(keyTableView, 8, 2);

      const dataLutData = new Uint8Array(28); // 4 + 4 + (2*4) + 4 + 4 + 4 = 28 bytes
      const dataLutView = new DataView(dataLutData.buffer);
      BinaryUtils.writeUint32(dataLutView, 0, 2);
      BinaryUtils.writeUint32(dataLutView, 4, 1);
      BinaryUtils.writeUint32(dataLutView, 8, 10);
      BinaryUtils.writeUint32(dataLutView, 12, 20);
      BinaryUtils.writeUint32(dataLutView, 16, 0);
      BinaryUtils.writeUint32(dataLutView, 20, 0);
      BinaryUtils.writeUint32(dataLutView, 24, 0);

      const dataDefData = new Uint8Array(12);
      const dataDefView = new DataView(dataDefData.buffer);
      BinaryUtils.writeUint32(dataDefView, 0, 1);
      BinaryUtils.writeUint32(dataDefView, 4, 1000);
      BinaryUtils.writeUint32(dataDefView, 8, 2000);

      const dataDotData = new Uint8Array(8);
      const dataDotView = new DataView(dataDotData.buffer);
      BinaryUtils.writeUint32(dataDotView, 0, 1);
      BinaryUtils.writeUint32(dataDotView, 4, 5000);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, dataLutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, dataDefData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, dataDotData],
        ]),
      };

      const result = parser.parse(context);

      const firstAccess = result.getCalKeyTable(0);
      const secondAccess = result.getCalKeyTable(0);

      expect(firstAccess).toBe(secondAccess); // Same reference
    });

    it('should return undefined for non-cached offsets', () => {
      const lutData = new Uint8Array(4);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 0); // numSgids = 0

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, new Uint8Array(0)],
        ]),
      };

      const result = parser.parse(context);

      expect(result.getCalKeyTable(999)).toBeUndefined();
      expect(result.getCkvLookupTable(999)).toBeUndefined();
      expect(result.getCalDefinitionEntry(999)).toBeUndefined();
      expect(result.getCalDataOffsetEntry(999)).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle subgraph with zero CalKeyTblEntries', () => {
      const lutData = new Uint8Array(12);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1); // numSgids = 1
      BinaryUtils.writeUint32(lutView, 4, 100); // sgId = 100
      BinaryUtils.writeUint32(lutView, 8, 0); // numCalKeyTblEntries = 0

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, new Uint8Array(0)],
        ]),
      };

      const result = parser.parse(context);

      expect(result.getSubgraphCount()).toBe(1);
      expect(result.subgraphLookupEntries[0].subgraphId).toBe(100);
      expect(result.subgraphLookupEntries[0].calKeyTableEntries).toEqual([]);
    });

    it('should handle CKV LUT table with zero entries', () => {
      const lutData = new Uint8Array(20); // 4 + 4 + 4 + 4 + 4 = 20 bytes
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1); // numSgids
      BinaryUtils.writeUint32(lutView, 4, 100); // sgId
      BinaryUtils.writeUint32(lutView, 8, 1); // numCalKeyTblEntries
      BinaryUtils.writeUint32(lutView, 12, 0); // offsetCalKeyTbl
      BinaryUtils.writeUint32(lutView, 16, 0); // offsetCalLUTTable

      const keyTableData = new Uint8Array(4);
      const keyTableView = new DataView(keyTableData.buffer);
      BinaryUtils.writeUint32(keyTableView, 0, 0); // numKeyIds = 0

      const dataLutData = new Uint8Array(8);
      const dataLutView = new DataView(dataLutData.buffer);
      BinaryUtils.writeUint32(dataLutView, 0, 0); // numCalKeyVals = 0
      BinaryUtils.writeUint32(dataLutView, 4, 0); // numCKVLUTEntries = 0

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, dataLutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, new Uint8Array(0)],
        ]),
      };

      const result = parser.parse(context);

      const ckvLookupTable = result.getCkvLookupTable(0);
      expect(ckvLookupTable).toBeDefined();
      expect(ckvLookupTable?.ckvLookupEntries).toEqual([]);
    });

    it('should handle CalDEF entry with zero calIdEntries', () => {
      const dataDefData = new Uint8Array(4);
      const dataDefView = new DataView(dataDefData.buffer);
      BinaryUtils.writeUint32(dataDefView, 0, 0); // numCalIdEntries = 0

      // Create minimal valid context
      const lutData = new Uint8Array(20); // 4 + 4 + 4 + 4 + 4 = 20 bytes
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1);
      BinaryUtils.writeUint32(lutView, 4, 100);
      BinaryUtils.writeUint32(lutView, 8, 1);
      BinaryUtils.writeUint32(lutView, 12, 0);
      BinaryUtils.writeUint32(lutView, 16, 0);

      const keyTableData = new Uint8Array(4);
      const keyTableView = new DataView(keyTableData.buffer);
      BinaryUtils.writeUint32(keyTableView, 0, 0);

      const dataLutData = new Uint8Array(20);
      const dataLutView = new DataView(dataLutData.buffer);
      BinaryUtils.writeUint32(dataLutView, 0, 0); // numCalKeyVals
      BinaryUtils.writeUint32(dataLutView, 4, 1); // numCKVLUTEntries
      BinaryUtils.writeUint32(dataLutView, 8, 0); // offsetCalDEF
      BinaryUtils.writeUint32(dataLutView, 12, 0); // offsetCalDOT
      BinaryUtils.writeUint32(dataLutView, 16, 0); // offsetDOT2

      const dataDotData = new Uint8Array(4);
      const dataDotView = new DataView(dataDotData.buffer);
      BinaryUtils.writeUint32(dataDotView, 0, 0); // numCalDataOffsets = 0

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, dataLutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, dataDefData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, dataDotData],
        ]),
      };

      const result = parser.parse(context);

      const defEntry = result.getCalDefinitionEntry(0);
      expect(defEntry).toBeDefined();
      expect(defEntry?.calIdEntries).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should throw when CALIBRATION_KEY_TABLE is missing', () => {
      const lutData = new Uint8Array(4);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1); // numSgids = 1

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          // Missing CALIBRATION_KEY_TABLE
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, new Uint8Array(0)],
        ]),
      };

      expect(() => parser.parse(context)).toThrow();
    });

    it('should throw when CALIBRATION_DATA_LUT is missing', () => {
      const lutData = new Uint8Array(4);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, new Uint8Array(0)],
          // Missing CALIBRATION_DATA_LUT
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, new Uint8Array(0)],
        ]),
      };

      expect(() => parser.parse(context)).toThrow();
    });

    it('should throw when CALIBRATION_DATA_DEF is missing', () => {
      const lutData = new Uint8Array(4);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, new Uint8Array(0)],
          // Missing CALIBRATION_DATA_DEF
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT, new Uint8Array(0)],
        ]),
      };

      expect(() => parser.parse(context)).toThrow();
    });

    it('should throw when CALIBRATION_DATA_DOT is missing', () => {
      const lutData = new Uint8Array(4);
      const lutView = new DataView(lutData.buffer);
      BinaryUtils.writeUint32(lutView, 0, 1);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT, new Uint8Array(0)],
          [ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF, new Uint8Array(0)],
          // Missing CALIBRATION_DATA_DOT
        ]),
      };

      expect(() => parser.parse(context)).toThrow();
    });
  });
});
