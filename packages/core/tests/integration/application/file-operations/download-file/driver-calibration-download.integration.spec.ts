/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AcdbFileSerializer} from '../../../../../src/application/file-operations/download-file/services/acdb-file-serializer.js';
import type {DownloadEntities} from '../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {DriverCalibrationChunkParser} from '../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/driver-calibration-chunk-parser.js';
import {
  ACDB_RAW_CHUNK_TYPES,
  type AcdbRawChunkType,
} from '../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import {BinaryUtils} from '../../../../../src/shared/utilities/binary-utils.js';

function extractChunk(acdb: Uint8Array, chunkId: string): Uint8Array | null {
  const view = new DataView(acdb.buffer, acdb.byteOffset, acdb.byteLength);
  let pos = 12; // skip 12-byte file header
  while (pos < acdb.byteLength) {
    const id = BinaryUtils.uint32ToString(BinaryUtils.readUint32(view, pos));
    const len = BinaryUtils.readUint32(view, pos + 4);
    if (id === chunkId) {
      return acdb.slice(pos + 8, pos + 8 + len);
    }
    pos += 8 + len;
  }
  return null;
}

describe('Driver Calibration Download Integration', () => {
  it('round-trips driver calibration data (GCLU/GCKT/GCDT/GCDE/GCDO)', async () => {
    const payload1 = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const payload2 = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);

    const entities: DownloadEntities = {
      headerMetadata: {
        version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: 'Test',
      },
      driverCalibrationData: [
        {
          moduleDefinitionId: 0x100,
          keyIds: [0x10, 0x20],
          ckvs: [
            {
              valueIds: [0xa0, 0xb0],
              parameters: [
                {parameterId: 0x30, payload: payload1},
                {parameterId: 0x31, payload: payload2},
              ],
            },
            {
              valueIds: [0xa1, 0xb1],
              parameters: [{parameterId: 0x30, payload: payload1}],
            },
          ],
        },
        {
          moduleDefinitionId: 0x200,
          keyIds: [0x10],
          ckvs: [
            {
              valueIds: [0xc0],
              parameters: [{parameterId: 0x40, payload: payload2}],
            },
          ],
        },
      ],
    };

    const serializer = new AcdbFileSerializer();
    const acdb = await serializer.serialize(entities);

    // ── All five chunks must be present ──
    const gcluChunk = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT,
    );
    const gcktChunk = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE,
    );
    const gcdtChunk = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE,
    );
    const gcdeChunk = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF,
    );
    const gcdoChunk = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT,
    );
    const datapoolChunk = extractChunk(acdb, ACDB_RAW_CHUNK_TYPES.DATAPOOL);

    expect(gcluChunk).not.toBeNull();
    expect(gcktChunk).not.toBeNull();
    expect(gcdtChunk).not.toBeNull();
    expect(gcdeChunk).not.toBeNull();
    expect(gcdoChunk).not.toBeNull();
    expect(datapoolChunk).not.toBeNull();

    // ── GCLU: 2 entries (one per (MID, keySet) pair) ──
    const gcluView = new DataView(gcluChunk!.buffer, gcluChunk!.byteOffset);
    expect(BinaryUtils.readUint32(gcluView, 0)).toBe(2);

    // ── Round-trip via DriverCalibrationChunkParser ──
    const rawChunks = new Map<AcdbRawChunkType, Uint8Array>([
      [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT, gcluChunk!],
      [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE, gcktChunk!],
      [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE, gcdtChunk!],
      [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF, gcdeChunk!],
      [ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT, gcdoChunk!],
      [ACDB_RAW_CHUNK_TYPES.DATAPOOL, datapoolChunk!],
    ]);

    const parser = new DriverCalibrationChunkParser();
    const parsed = parser.parse({rawChunks});

    // Should have 2 module lookup entries (MID=0x100 and MID=0x200)
    expect(parsed.moduleLookupEntries).toHaveLength(2);
    expect(parsed.moduleLookupEntries[0].moduleDefinitionId).toBe(0x100);
    expect(parsed.moduleLookupEntries[1].moduleDefinitionId).toBe(0x200);

    // MID=0x100 has 1 calKeyTableEntry → 1 (keySet, dataLut) pair
    expect(parsed.moduleLookupEntries[0].calKeyTableEntries).toHaveLength(1);

    // Verify key table for MID=0x100: should have keyIds [0x10, 0x20]
    const entry0 = parsed.moduleLookupEntries[0].calKeyTableEntries[0];
    const keyIds = parsed.getCalKeyTable(entry0.offsetCalKeyTable);
    expect(keyIds).toEqual([0x10, 0x20]);

    // Verify CKV LUT for MID=0x100: 2 CKV entries
    const ckvLut = parsed.getCkvLookupTable(entry0.offsetCalLookupTable);
    expect(ckvLut).not.toBeUndefined();
    expect(ckvLut!.ckvLookupEntries).toHaveLength(2);

    // First CKV: valueIds [0xa0, 0xb0]
    expect(ckvLut!.ckvLookupEntries[0].calKeyValues).toEqual([0xa0, 0xb0]);

    // DEF entry for first CKV: 2 pIds [0x30, 0x31]
    const defEntry0 = parsed.getCalDefinitionEntry(
      ckvLut!.ckvLookupEntries[0].offsetCalDefinition,
    );
    expect(defEntry0).not.toBeUndefined();
    expect(defEntry0!.calIdEntries).toHaveLength(2);
    expect(defEntry0!.calIdEntries[0].paramId).toBe(0x30);
    expect(defEntry0!.calIdEntries[1].paramId).toBe(0x31);

    // DOT entry for first CKV: 2 datapool offsets (non-negative, distinct)
    const dotEntry0 = parsed.getCalDataOffsetEntry(
      ckvLut!.ckvLookupEntries[0].offsetCalDataOffset,
    );
    expect(dotEntry0).not.toBeUndefined();
    expect(dotEntry0!.calDataOffsets).toHaveLength(2);
    expect(dotEntry0!.calDataOffsets[0]).toBeGreaterThanOrEqual(0);
    expect(dotEntry0!.calDataOffsets[1]).toBeGreaterThanOrEqual(0);
    expect(dotEntry0!.calDataOffsets[0]).not.toBe(dotEntry0!.calDataOffsets[1]);
  });

  it('emits no driver calibration chunks when driverCalibrationData is empty', async () => {
    const entities: DownloadEntities = {
      headerMetadata: {
        version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: '',
      },
      driverCalibrationData: [],
    };

    const serializer = new AcdbFileSerializer();
    const acdb = await serializer.serialize(entities);

    expect(
      extractChunk(acdb, ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT),
    ).toBeNull();
  });
});
