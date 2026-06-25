/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {DriverCalibrationChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/driver-calibration-chunk-builder.js';
import {DriverCalibrationChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/driver-calibration-chunk-serializer.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';
import type {DriverCalibrationDownloadModel} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

function buildAndSerialize(
  data: DriverCalibrationDownloadModel[],
  datapool: DatapoolChunk,
) {
  const {chunk} = DriverCalibrationChunkBuilder.buildChunk({
    driverCalibrationData: data,
    datapool,
  });
  return new DriverCalibrationChunkSerializer().serialize(chunk);
}

describe('DriverCalibrationChunkBuilder + DriverCalibrationChunkSerializer', () => {
  it('returns empty output for empty input', () => {
    const datapool = new DatapoolChunk();
    const result = buildAndSerialize([], datapool);
    expect(result.gclu.byteLength).toBe(0);
    expect(result.gckt.byteLength).toBe(0);
    expect(result.gcdt.byteLength).toBe(0);
    expect(result.gcde.byteLength).toBe(0);
    expect(result.gcdo.byteLength).toBe(0);
  });

  it('builds correct chunks for one module, one key, one CKV, one parameter', () => {
    const datapool = new DatapoolChunk();
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const input: DriverCalibrationDownloadModel[] = [
      {
        moduleDefinitionId: 0x100,
        keyIds: [0x10],
        ckvs: [
          {
            valueIds: [0x20],
            parameters: [{parameterId: 0x30, payload}],
          },
        ],
      },
    ];

    const result = buildAndSerialize(input, datapool);

    // ── GCLU: numEntries(4) + [mid(4) + keyTblOffset(4) + dataLutOffset(4)] = 16 bytes ──
    expect(result.gclu.byteLength).toBe(16);
    const luView = new DataView(result.gclu.buffer);
    expect(BinaryUtils.readUint32(luView, 0)).toBe(1); // numEntries
    expect(BinaryUtils.readUint32(luView, 4)).toBe(0x100); // mid
    const keyTblOffset = BinaryUtils.readUint32(luView, 8);
    const dataLutOffset = BinaryUtils.readUint32(luView, 12);
    expect(keyTblOffset).toBe(0);
    expect(dataLutOffset).toBe(0);

    // ── GCKT at keyTblOffset=0: numKeyIds(4) + keyId(4) = 8 bytes ──
    expect(result.gckt.byteLength).toBe(8);
    const ktView = new DataView(result.gckt.buffer);
    expect(BinaryUtils.readUint32(ktView, keyTblOffset)).toBe(1); // numKeyIds
    expect(BinaryUtils.readUint32(ktView, keyTblOffset + 4)).toBe(0x10); // keyId

    // ── GCDT at dataLutOffset=0: numCalKeyVals(4) + numKVLUTEntries(4) +
    //    [valueId(4) + gcdeOffset(4) + gcdoOffset(4)] = 20 bytes ──
    expect(result.gcdt.byteLength).toBe(20);
    const dtView = new DataView(result.gcdt.buffer);
    expect(BinaryUtils.readUint32(dtView, dataLutOffset)).toBe(1); // numCalKeyVals
    expect(BinaryUtils.readUint32(dtView, dataLutOffset + 4)).toBe(1); // numKVLUTEntries
    expect(BinaryUtils.readUint32(dtView, dataLutOffset + 8)).toBe(0x20); // valueId[0]
    const gcdeOffset = BinaryUtils.readUint32(dtView, dataLutOffset + 12);
    const gcdoOffset = BinaryUtils.readUint32(dtView, dataLutOffset + 16);
    expect(gcdeOffset).toBe(0);
    expect(gcdoOffset).toBe(0);

    // ── GCDE at gcdeOffset=0: numPids(4) + pId(4) = 8 bytes ──
    expect(result.gcde.byteLength).toBe(8);
    const deView = new DataView(result.gcde.buffer);
    expect(BinaryUtils.readUint32(deView, gcdeOffset)).toBe(1); // numPids
    expect(BinaryUtils.readUint32(deView, gcdeOffset + 4)).toBe(0x30); // pId

    // ── GCDO at gcdoOffset=0: numOffsets(4) + poolOffset(4) = 8 bytes ──
    expect(result.gcdo.byteLength).toBe(8);
    const doView = new DataView(result.gcdo.buffer);
    expect(BinaryUtils.readUint32(doView, gcdoOffset)).toBe(1); // numOffsets
    const poolOffset = BinaryUtils.readUint32(doView, gcdoOffset + 4);
    expect(datapool.getDataAtOffset(poolOffset)).toEqual(payload);
  });

  it('numEntries in GCLU counts (MID, keySet) pairs, not distinct MIDs', () => {
    const datapool = new DatapoolChunk();
    const payload = new Uint8Array([0x01]);
    const input: DriverCalibrationDownloadModel[] = [
      {
        moduleDefinitionId: 0x100,
        keyIds: [0x10],
        ckvs: [{valueIds: [0x20], parameters: [{parameterId: 0x30, payload}]}],
      },
      {
        moduleDefinitionId: 0x100,
        keyIds: [0x11],
        ckvs: [{valueIds: [0x21], parameters: [{parameterId: 0x31, payload}]}],
      },
    ];

    const result = buildAndSerialize(input, datapool);
    const luView = new DataView(result.gclu.buffer);
    expect(BinaryUtils.readUint32(luView, 0)).toBe(2); // 2 pairs, both MID=0x100
  });

  it('GCDT offsets advance correctly for multiple CKVs in one group', () => {
    const datapool = new DatapoolChunk();
    const p1 = new Uint8Array([0x01, 0x02]);
    const p2 = new Uint8Array([0x03, 0x04]);
    const input: DriverCalibrationDownloadModel[] = [
      {
        moduleDefinitionId: 0x100,
        keyIds: [0x10],
        ckvs: [
          {valueIds: [0x20], parameters: [{parameterId: 0x30, payload: p1}]},
          {valueIds: [0x21], parameters: [{parameterId: 0x31, payload: p2}]},
        ],
      },
    ];

    const result = buildAndSerialize(input, datapool);
    const dtView = new DataView(result.gcdt.buffer);
    expect(BinaryUtils.readUint32(dtView, 4)).toBe(2); // numKVLUTEntries

    // Entry 0 at byte 8: valueId(4) + gcdeOffset(4) + gcdoOffset(4)
    const gcdeOffset0 = BinaryUtils.readUint32(dtView, 8 + 4);
    const gcdoOffset0 = BinaryUtils.readUint32(dtView, 8 + 8);
    expect(gcdeOffset0).toBe(0);
    expect(gcdoOffset0).toBe(0);

    // Entry 1 at byte 8 + 12 = 20
    const gcdeOffset1 = BinaryUtils.readUint32(dtView, 20 + 4);
    const gcdoOffset1 = BinaryUtils.readUint32(dtView, 20 + 8);
    // GCDE entry 0: numPids(4) + pId(4) = 8 bytes
    expect(gcdeOffset1).toBe(8);
    // GCDO entry 0: numOffsets(4) + poolOffset(4) = 8 bytes
    expect(gcdoOffset1).toBe(8);
  });

  it('sorts out-of-order input to produce the same binary as pre-sorted input', () => {
    const datapool1 = new DatapoolChunk();
    const datapool2 = new DatapoolChunk();
    const payload = new Uint8Array([0x01]);
    const sorted: DriverCalibrationDownloadModel[] = [
      {
        moduleDefinitionId: 0x100,
        keyIds: [0x10],
        ckvs: [{valueIds: [0x20], parameters: [{parameterId: 0x30, payload}]}],
      },
      {
        moduleDefinitionId: 0x200,
        keyIds: [0x10],
        ckvs: [{valueIds: [0x20], parameters: [{parameterId: 0x30, payload}]}],
      },
    ];
    const unsorted: DriverCalibrationDownloadModel[] = [sorted[1], sorted[0]];

    const r1 = buildAndSerialize(sorted, datapool1);
    const r2 = buildAndSerialize(unsorted, datapool2);

    expect(r1.gclu).toEqual(r2.gclu);
    expect(r1.gckt).toEqual(r2.gckt);
    expect(r1.gcdt).toEqual(r2.gcdt);
  });
});
