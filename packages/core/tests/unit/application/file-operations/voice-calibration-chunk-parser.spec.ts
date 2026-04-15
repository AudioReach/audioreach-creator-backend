/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach} from '@jest/globals';
import {VoiceCalibrationChunkParser} from '../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/voice-calibration-chunk-parser.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../../../src/application/file-operations/upload-file/models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../src/shared/utilities/binary-utils.js';

describe('VoiceCalibrationChunkParser', () => {
  let parser: VoiceCalibrationChunkParser;

  beforeEach(() => {
    parser = new VoiceCalibrationChunkParser();
  });

  describe('parse', () => {
    it('should return empty chunk when VCPM_CALDATA chunk is missing', () => {
      const context: ChunkParseContext = {
        rawChunks: new Map(),
      };

      const result = parser.parse(context);

      expect(result.subgraphCalTables).toHaveLength(0);
      expect(result.voiceModuleInstanceId).toBe(0);
      expect(result.voiceParamId).toBe(0);
    });

    it('should throw error when VCPM_MASTER_KEY chunk is missing', () => {
      const calDataBuffer = new ArrayBuffer(12);
      const calDataView = new DataView(calDataBuffer);
      BinaryUtils.writeUint32(calDataView, 0, 1); // vcpmModuleInstanceId
      BinaryUtils.writeUint32(calDataView, 4, 2); // vcpmParamId
      BinaryUtils.writeUint32(calDataView, 8, 0); // numSgids

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.VCPM_CALDATA, new Uint8Array(calDataBuffer)],
        ]),
      };

      expect(() => parser.parse(context)).toThrow(
        'VCPM_MASTER_KEY chunk is required',
      );
    });

    it('should throw error when dependent chunks are missing', () => {
      const calDataBuffer = new ArrayBuffer(12);
      const calDataView = new DataView(calDataBuffer);
      BinaryUtils.writeUint32(calDataView, 0, 1);
      BinaryUtils.writeUint32(calDataView, 4, 2);
      BinaryUtils.writeUint32(calDataView, 8, 0);

      const masterKeyBuffer = new ArrayBuffer(4);
      const masterKeyView = new DataView(masterKeyBuffer);
      BinaryUtils.writeUint32(masterKeyView, 0, 0); // numMasterKeys

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.VCPM_CALDATA, new Uint8Array(calDataBuffer)],
          [
            ACDB_RAW_CHUNK_TYPES.VCPM_MASTER_KEY,
            new Uint8Array(masterKeyBuffer),
          ],
        ]),
      };

      expect(() => parser.parse(context)).toThrow(
        'VCPM_CALIBRATION_KEY_TABLE, VCPM_CALIBRATION_DATA_LUT, and VCPM_CALIBRATION_DATA_DEF chunks are required',
      );
    });
  });

  describe('caching', () => {
    it('should cache master key table by offset', () => {
      // Create minimal valid chunks
      const masterKeyBuffer = new ArrayBuffer(20);
      const masterKeyView = new DataView(masterKeyBuffer);
      BinaryUtils.writeUint32(masterKeyView, 0, 2); // numMasterKeys
      BinaryUtils.writeUint32(masterKeyView, 4, 100); // vocKeyId 1
      BinaryUtils.writeUint32(masterKeyView, 8, 1); // isDynamic 1
      BinaryUtils.writeUint32(masterKeyView, 12, 200); // vocKeyId 2
      BinaryUtils.writeUint32(masterKeyView, 16, 0); // isDynamic 2

      const calDataBuffer = new ArrayBuffer(40);
      const calDataView = new DataView(calDataBuffer);
      BinaryUtils.writeUint32(calDataView, 0, 1); // vcpmModuleInstanceId
      BinaryUtils.writeUint32(calDataView, 4, 2); // vcpmParamId
      BinaryUtils.writeUint32(calDataView, 8, 1); // numSgids
      BinaryUtils.writeUint32(calDataView, 12, 1); // sgId
      BinaryUtils.writeUint32(calDataView, 16, 0); // sgCalTblSize
      BinaryUtils.writeUint32(calDataView, 20, 1); // majorVersion
      BinaryUtils.writeUint32(calDataView, 24, 0); // minorVersion
      BinaryUtils.writeUint32(calDataView, 28, 0); // offsetVCPMMasterKeyTbl
      BinaryUtils.writeUint32(calDataView, 32, 0); // numCKVDataTbl

      const keyTableBuffer = new ArrayBuffer(4);
      const dataLutBuffer = new ArrayBuffer(4);
      const dataDefBuffer = new ArrayBuffer(4);

      const context: ChunkParseContext = {
        rawChunks: new Map([
          [ACDB_RAW_CHUNK_TYPES.VCPM_CALDATA, new Uint8Array(calDataBuffer)],
          [
            ACDB_RAW_CHUNK_TYPES.VCPM_MASTER_KEY,
            new Uint8Array(masterKeyBuffer),
          ],
          [
            ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_KEY_TABLE,
            new Uint8Array(keyTableBuffer),
          ],
          [
            ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_LUT,
            new Uint8Array(dataLutBuffer),
          ],
          [
            ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_DEF,
            new Uint8Array(dataDefBuffer),
          ],
        ]),
      };

      const result = parser.parse(context);

      // Verify master key table was cached
      const masterKeyTable = result.getMasterKeyTable(0);
      expect(masterKeyTable).toBeDefined();
      expect(masterKeyTable?.keyInfos).toHaveLength(2);
      expect(masterKeyTable?.keyInfos[0].voiceKeyId).toBe(100);
      expect(masterKeyTable?.keyInfos[0].isDynamic).toBe(true);
      expect(masterKeyTable?.keyInfos[1].voiceKeyId).toBe(200);
      expect(masterKeyTable?.keyInfos[1].isDynamic).toBe(false);
    });
  });
});
