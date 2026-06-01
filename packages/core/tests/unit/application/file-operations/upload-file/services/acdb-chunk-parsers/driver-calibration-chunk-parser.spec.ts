/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {DriverCalibrationChunkParser} from '../../../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/driver-calibration-chunk-parser.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../../../../../../src/application/file-operations/upload-file/models/chunk-parse-context.js';
import {createMockLogger} from '../../../../../../helpers/index.js';

/**
 * Helper to create a simple key table buffer
 * Format: NumKeyIds + KeyId[]
 */
function createKeyTableBuffer(keyIds: number[]): Uint8Array {
  const buffer = new ArrayBuffer(4 + keyIds.length * 4);
  const view = new DataView(buffer);
  view.setUint32(0, keyIds.length, true); // NumKeyIds
  keyIds.forEach((keyId, index) => {
    view.setUint32(4 + index * 4, keyId, true);
  });
  return new Uint8Array(buffer);
}

/**
 * Helper to create a CKV lookup table buffer
 * Format: NumCalKeyValues + NumCKVLUTEntries + CKVLUTEntry[]
 * CKVLUTEntry: CalKeyVal[] + OffsetCalDEF + OffsetCalDOT
 */
function createCkvLookupTableBuffer(
  numCalKeyValues: number,
  entries: Array<{
    calKeyValues: number[];
    offsetCalDef: number;
    offsetCalDot: number;
  }>,
): Uint8Array {
  const entrySize = numCalKeyValues * 4 + 4 + 4; // calKeyValues + offsetCalDef + offsetCalDot
  const buffer = new ArrayBuffer(4 + 4 + entries.length * entrySize);
  const view = new DataView(buffer);

  view.setUint32(0, numCalKeyValues, true);
  view.setUint32(4, entries.length, true);

  let offset = 8;
  for (const entry of entries) {
    // Write cal key values
    for (const keyVal of entry.calKeyValues) {
      view.setUint32(offset, keyVal, true);
      offset += 4;
    }
    // Write offsets
    view.setUint32(offset, entry.offsetCalDef, true);
    offset += 4;
    view.setUint32(offset, entry.offsetCalDot, true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}

/**
 * Helper to create a DEF entry buffer
 * Format: NumCalIdEntries + ParamId[]
 */
function createDefEntryBuffer(paramIds: number[]): Uint8Array {
  const buffer = new ArrayBuffer(4 + paramIds.length * 4);
  const view = new DataView(buffer);
  view.setUint32(0, paramIds.length, true);
  paramIds.forEach((paramId, index) => {
    view.setUint32(4 + index * 4, paramId, true);
  });
  return new Uint8Array(buffer);
}

/**
 * Helper to create a DOT entry buffer
 * Format: NumCalDataOffsets + CalDataOffset[]
 */
function createDotEntryBuffer(dataOffsets: number[]): Uint8Array {
  const buffer = new ArrayBuffer(4 + dataOffsets.length * 4);
  const view = new DataView(buffer);
  view.setUint32(0, dataOffsets.length, true);
  dataOffsets.forEach((offset, index) => {
    view.setUint32(4 + index * 4, offset, true);
  });
  return new Uint8Array(buffer);
}

/**
 * Helper to create a LUT chunk buffer
 * Format: NumModules + ModuleLUTEntry[]
 * ModuleLUTEntry: MId + OffsetCalKeyTbl + OffsetCKVLUTTbl
 */
function createLutChunkBuffer(
  modules: Array<{
    moduleId: number;
    offsetKeyTable: number;
    offsetCkvLut: number;
  }>,
): Uint8Array {
  const buffer = new ArrayBuffer(4 + modules.length * 12);
  const view = new DataView(buffer);
  view.setUint32(0, modules.length, true);

  let offset = 4;
  for (const module of modules) {
    view.setUint32(offset, module.moduleId, true);
    offset += 4;
    view.setUint32(offset, module.offsetKeyTable, true);
    offset += 4;
    view.setUint32(offset, module.offsetCkvLut, true);
    offset += 4;
  }

  return new Uint8Array(buffer);
}

describe('DriverCalibrationChunkParser', () => {
  let parser: DriverCalibrationChunkParser;
  const mockLogger = createMockLogger();

  beforeEach(() => {
    parser = new DriverCalibrationChunkParser(mockLogger);
  });

  describe('Happy Path', () => {
    it('should parse empty chunk', () => {
      const data = new Uint8Array(0);
      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, data],
        ]),
      };
      const result = parser.parse(context);

      expect(result.chunkType).toBe('DRIVER_CALIBRATION_DATA');
      expect(result.moduleLookupEntries).toHaveLength(0);
    });

    it('should parse chunk with single module and complete dependent chunks', () => {
      // Create dependent chunks
      const keyTableData = createKeyTableBuffer([1, 2, 3]);
      const ckvLutData = createCkvLookupTableBuffer(3, [
        {calKeyValues: [100, 200, 300], offsetCalDef: 0, offsetCalDot: 0},
      ]);
      const defData = createDefEntryBuffer([10, 20]);
      const dotData = createDotEntryBuffer([1000, 2000]);

      // Create LUT chunk
      const lutData = createLutChunkBuffer([
        {moduleId: 500, offsetKeyTable: 0, offsetCkvLut: 0},
      ]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      expect(result.chunkType).toBe('DRIVER_CALIBRATION_DATA');
      expect(result.moduleLookupEntries).toHaveLength(1);
      expect(result.moduleLookupEntries[0].moduleDefinitionId).toBe(500);
      expect(result.moduleLookupEntries[0].calKeyTableEntries).toHaveLength(1);
    });

    it('should parse chunk with multiple modules', () => {
      const keyTableData = createKeyTableBuffer([1, 2]);
      const ckvLutData = createCkvLookupTableBuffer(2, [
        {calKeyValues: [100, 200], offsetCalDef: 0, offsetCalDot: 0},
      ]);
      const defData = createDefEntryBuffer([10]);
      const dotData = createDotEntryBuffer([1000]);

      const lutData = createLutChunkBuffer([
        {moduleId: 500, offsetKeyTable: 0, offsetCkvLut: 0},
        {moduleId: 600, offsetKeyTable: 0, offsetCkvLut: 0},
      ]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      expect(result.moduleLookupEntries).toHaveLength(2);
      expect(result.moduleLookupEntries[0].moduleDefinitionId).toBe(500);
      expect(result.moduleLookupEntries[1].moduleDefinitionId).toBe(600);
    });

    it('should cache and reuse key table entries', () => {
      const keyTableData = createKeyTableBuffer([1, 2, 3]);
      const ckvLutData = createCkvLookupTableBuffer(3, [
        {calKeyValues: [100, 200, 300], offsetCalDef: 0, offsetCalDot: 0},
      ]);
      const defData = createDefEntryBuffer([10]);
      const dotData = createDotEntryBuffer([1000]);

      const lutData = createLutChunkBuffer([
        {moduleId: 500, offsetKeyTable: 0, offsetCkvLut: 0},
      ]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      // Verify cache was populated
      const cachedKeyTable = result.getCalKeyTable(0);
      expect(cachedKeyTable).toEqual([1, 2, 3]);
    });

    it('should cache and reuse CKV lookup table entries', () => {
      const keyTableData = createKeyTableBuffer([1, 2]);
      const ckvLutData = createCkvLookupTableBuffer(2, [
        {calKeyValues: [100, 200], offsetCalDef: 0, offsetCalDot: 0},
      ]);
      const defData = createDefEntryBuffer([10]);
      const dotData = createDotEntryBuffer([1000]);

      const lutData = createLutChunkBuffer([
        {moduleId: 500, offsetKeyTable: 0, offsetCkvLut: 0},
      ]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      // Verify cache was populated
      const cachedCkvLut = result.getCkvLookupTable(0);
      expect(cachedCkvLut).toBeDefined();
      expect(cachedCkvLut?.numCalKeyValues).toBe(2);
      expect(cachedCkvLut?.ckvLookupEntries).toHaveLength(1);
    });

    it('should cache and reuse DEF entries', () => {
      const keyTableData = createKeyTableBuffer([1]);
      const ckvLutData = createCkvLookupTableBuffer(1, [
        {calKeyValues: [100], offsetCalDef: 0, offsetCalDot: 0},
      ]);
      const defData = createDefEntryBuffer([10, 20]);
      const dotData = createDotEntryBuffer([1000, 2000]);

      const lutData = createLutChunkBuffer([
        {moduleId: 500, offsetKeyTable: 0, offsetCkvLut: 0},
      ]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      // Verify cache was populated
      const cachedDef = result.getCalDefinitionEntry(0);
      expect(cachedDef).toBeDefined();
      expect(cachedDef?.calIdEntries).toHaveLength(2);
      expect(cachedDef?.calIdEntries[0].paramId).toBe(10);
      expect(cachedDef?.calIdEntries[1].paramId).toBe(20);
    });

    it('should cache and reuse DOT entries', () => {
      const keyTableData = createKeyTableBuffer([1]);
      const ckvLutData = createCkvLookupTableBuffer(1, [
        {calKeyValues: [100], offsetCalDef: 0, offsetCalDot: 0},
      ]);
      const defData = createDefEntryBuffer([10]);
      const dotData = createDotEntryBuffer([1000, 2000, 3000]);

      const lutData = createLutChunkBuffer([
        {moduleId: 500, offsetKeyTable: 0, offsetCkvLut: 0},
      ]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      // Verify cache was populated
      const cachedDot = result.getCalDataOffsetEntry(0);
      expect(cachedDot).toBeDefined();
      expect(cachedDot?.calDataOffsets).toEqual([1000, 2000, 3000]);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty chunk when LUT chunk is missing', () => {
      const context: ChunkParseContext = {
        rawChunks: new Map(),
      };
      const result = parser.parse(context);

      expect(result.moduleLookupEntries).toHaveLength(0);
    });

    it('should return empty chunk and log warning when dependent chunks are missing', () => {
      const lutData = createLutChunkBuffer([
        {moduleId: 500, offsetKeyTable: 0, offsetCkvLut: 0},
      ]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          // Missing dependent chunks
        ]),
      };

      const result = parser.parse(context);

      expect(result.moduleLookupEntries).toHaveLength(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should handle chunk with zero modules', () => {
      const keyTableData = createKeyTableBuffer([1]);
      const ckvLutData = createCkvLookupTableBuffer(1, []);
      const defData = createDefEntryBuffer([10]);
      const dotData = createDotEntryBuffer([1000]);

      const lutData = createLutChunkBuffer([]);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      expect(result.moduleLookupEntries).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should continue parsing after individual module entry failure', () => {
      // Create malformed data that will cause parsing error for first module
      const keyTableData = createKeyTableBuffer([1]);
      const ckvLutData = createCkvLookupTableBuffer(1, [
        {calKeyValues: [100], offsetCalDef: 0, offsetCalDot: 0},
      ]);
      const defData = createDefEntryBuffer([10]);
      const dotData = createDotEntryBuffer([1000]);

      // Create LUT with invalid offset that will cause error
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      view.setUint32(0, 1, true); // NumModules = 1
      view.setUint32(4, 500, true); // ModuleId
      view.setUint32(8, 9999, true); // Invalid offset (out of bounds)
      view.setUint32(12, 0, true); // OffsetCkvLut
      const lutData = new Uint8Array(buffer);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, lutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, keyTableData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, ckvLutData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, defData],
          [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, dotData],
        ]),
      };

      const result = parser.parse(context);

      // Should log warning but not throw
      expect(mockLogger.logWarn).toHaveBeenCalled();
      // Result should still be valid (empty in this case due to error)
      expect(result.chunkType).toBe('DRIVER_CALIBRATION_DATA');
    });
  });
});
