/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {DriverCalibrationChunk} from '../../../shared/acdb-chunks/driver-calibration-chunk.js';

export interface DriverCalibrationSerializationResult {
  gclu: Uint8Array;
  gckt: Uint8Array;
  gcdt: Uint8Array;
  gcde: Uint8Array;
  gcdo: Uint8Array;
}

/**
 * Serializes a DriverCalibrationChunk to the five binary ACDB chunks.
 *
 * Mirrors AudioCalibrationChunkSerializer: the chunk object holds structured
 * data.
 *
 * GCLU = module LUT  (equivalent to CalSGLUT, keyed by moduleDefinitionId)
 * GCKT = key table   (CalKeyTblChunk)
 * GCDT = CKV LUT     (CalDataLUTChunk)
 * GCDE = DEF table   (CalDEFChunk)
 * GCDO = DOT table   (CalDOTChunk)
 */
export class DriverCalibrationChunkSerializer {
  serialize(
    chunk: DriverCalibrationChunk,
  ): DriverCalibrationSerializationResult {
    if (chunk.moduleLookupEntries.length === 0) {
      return {
        gclu: new Uint8Array(0),
        gckt: new Uint8Array(0),
        gcdt: new Uint8Array(0),
        gcde: new Uint8Array(0),
        gcdo: new Uint8Array(0),
      };
    }

    return {
      gclu: this.serializeGclu(chunk),
      gckt: this.serializeGckt(chunk),
      gcdt: this.serializeGcdt(chunk),
      gcde: this.serializeGcde(chunk),
      gcdo: this.serializeGcdo(chunk),
    };
  }

  private serializeGclu(chunk: DriverCalibrationChunk): Uint8Array {
    // numEntries = total (MID, keySet) pairs across all module lookup entries
    let numEntries = 0;
    for (const entry of chunk.moduleLookupEntries) {
      numEntries += entry.calKeyTableEntries.length;
    }

    // GCLU: numEntries(4) + per pair: mid(4) + keyTblOffset(4) + dataLutOffset(4)
    const buffer = new Uint8Array(
      BinaryUtils.SIZEOF_UINT32 + numEntries * 3 * BinaryUtils.SIZEOF_UINT32,
    );
    const view = new DataView(buffer.buffer);
    let offset = 0;

    BinaryUtils.writeUint32(view, offset, numEntries);
    offset += BinaryUtils.SIZEOF_UINT32;

    for (const entry of chunk.moduleLookupEntries) {
      for (const calKeyEntry of entry.calKeyTableEntries) {
        BinaryUtils.writeUint32(view, offset, entry.moduleDefinitionId);
        offset += BinaryUtils.SIZEOF_UINT32;

        BinaryUtils.writeUint32(view, offset, calKeyEntry.offsetCalKeyTable);
        offset += BinaryUtils.SIZEOF_UINT32;

        BinaryUtils.writeUint32(view, offset, calKeyEntry.offsetCalLookupTable);
        offset += BinaryUtils.SIZEOF_UINT32;
      }
    }

    return buffer;
  }

  private serializeGckt(chunk: DriverCalibrationChunk): Uint8Array {
    const payloads = chunk.getCalKeyTableEntries().map(({keyIds}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 + keyIds.length * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, keyIds.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const id of keyIds) {
        BinaryUtils.writeUint32(view, pos, id);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeGcdt(chunk: DriverCalibrationChunk): Uint8Array {
    const payloads = chunk.getCkvLookupTableEntries().map(({table}) => {
      let size =
        BinaryUtils.SIZEOF_UINT32 + // numCalKeyValues
        BinaryUtils.SIZEOF_UINT32; // numEntries
      for (const e of table.ckvLookupEntries) {
        size +=
          e.calKeyValues.length * BinaryUtils.SIZEOF_UINT32 +
          2 * BinaryUtils.SIZEOF_UINT32; // offsetCalDEF + offsetCalDOT
      }

      const buf = new Uint8Array(size);
      const view = new DataView(buf.buffer);
      let pos = 0;

      BinaryUtils.writeUint32(view, pos, table.numCalKeyValues);
      pos += BinaryUtils.SIZEOF_UINT32;

      BinaryUtils.writeUint32(view, pos, table.ckvLookupEntries.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (const e of table.ckvLookupEntries) {
        for (const v of e.calKeyValues) {
          BinaryUtils.writeUint32(view, pos, v);
          pos += BinaryUtils.SIZEOF_UINT32;
        }
        BinaryUtils.writeUint32(view, pos, e.offsetCalDefinition);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, e.offsetCalDataOffset);
        pos += BinaryUtils.SIZEOF_UINT32;
      }

      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeGcde(chunk: DriverCalibrationChunk): Uint8Array {
    const payloads = chunk.getCalDefinitionEntries().map(({entry}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.calIdEntries.length * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, entry.calIdEntries.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const e of entry.calIdEntries) {
        BinaryUtils.writeUint32(view, pos, e.paramId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeGcdo(chunk: DriverCalibrationChunk): Uint8Array {
    const payloads = chunk.getCalDataOffsetEntries().map(({entry}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.calDataOffsets.length * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, entry.calDataOffsets.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const o of entry.calDataOffsets) {
        BinaryUtils.writeUint32(view, pos, o);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }
}
