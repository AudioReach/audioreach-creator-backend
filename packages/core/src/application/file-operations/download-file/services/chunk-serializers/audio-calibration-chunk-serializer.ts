/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {AudioCalibrationChunk} from '../../../shared/acdb-chunks/audio-calibration-chunk.js';

export interface AudioCalibrationSerializationResult {
  calSgLut: Uint8Array;
  calKeyTable: Uint8Array;
  ckvLut: Uint8Array;
  calDef: Uint8Array;
  calDot: Uint8Array;
}

/**
 * Serializer for audio calibration chunks.
 * Handles sequential datapool offset assignment and binary serialization.
 *
 * MUST be sequential due to shared datapool state.
 */
export class AudioCalibrationChunkSerializer {
  /**
   * Serialize audio calibration chunk to binary format.
   *
   * The builder has already assigned optimized CDDE/CDDO/DOT2 offsets while
   * mutating the shared datapool sequentially.
   *
   * @param chunk - Parsed audio calibration chunk
   * @returns Binary chunks for ACDB file
   */
  serialize(chunk: AudioCalibrationChunk): AudioCalibrationSerializationResult {
    if (chunk.subgraphLookupEntries.length === 0) {
      return {
        calSgLut: new Uint8Array(0),
        calKeyTable: new Uint8Array(0),
        ckvLut: new Uint8Array(0),
        calDef: new Uint8Array(0),
        calDot: new Uint8Array(0),
      };
    }

    return {
      calSgLut: this.serializeCalSgLut(chunk),
      calKeyTable: this.serializeCalKeyTable(chunk),
      ckvLut: this.serializeCkvLut(chunk),
      calDef: this.serializeCalDef(chunk),
      calDot: this.serializeCalDot(chunk),
    };
  }

  private serializeCalSgLut(chunk: AudioCalibrationChunk): Uint8Array {
    let totalSize = BinaryUtils.SIZEOF_UINT32; // NumSGIDs

    for (const sgEntry of chunk.subgraphLookupEntries) {
      totalSize +=
        BinaryUtils.SIZEOF_UINT32 + // SGId
        BinaryUtils.SIZEOF_UINT32 + // NumCalKeyTblEntries
        sgEntry.calKeyTableEntries.length * 2 * BinaryUtils.SIZEOF_UINT32; // offset pairs
    }

    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    BinaryUtils.writeUint32(view, offset, chunk.subgraphLookupEntries.length);
    offset += BinaryUtils.SIZEOF_UINT32;

    for (const sgEntry of chunk.subgraphLookupEntries) {
      BinaryUtils.writeUint32(view, offset, sgEntry.subgraphId);
      offset += BinaryUtils.SIZEOF_UINT32;

      BinaryUtils.writeUint32(view, offset, sgEntry.calKeyTableEntries.length);
      offset += BinaryUtils.SIZEOF_UINT32;

      for (const calKeyEntry of sgEntry.calKeyTableEntries) {
        BinaryUtils.writeUint32(view, offset, calKeyEntry.offsetCalKeyTable);
        offset += BinaryUtils.SIZEOF_UINT32;

        BinaryUtils.writeUint32(view, offset, calKeyEntry.offsetCalLookupTable);
        offset += BinaryUtils.SIZEOF_UINT32;
      }
    }

    return buffer;
  }

  private serializeCalKeyTable(chunk: AudioCalibrationChunk): Uint8Array {
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

  private serializeCkvLut(chunk: AudioCalibrationChunk): Uint8Array {
    const payloads = chunk.getCkvLookupTableEntries().map(({table}) => {
      let size =
        BinaryUtils.SIZEOF_UINT32 + // numCalKeyValues
        BinaryUtils.SIZEOF_UINT32; // numCKVLUTEntries
      for (const entry of table.ckvLookupEntries) {
        size +=
          entry.calKeyValues.length * BinaryUtils.SIZEOF_UINT32 +
          3 * BinaryUtils.SIZEOF_UINT32; // offsetCalDEF + offsetCalDOT + offsetDOT2
      }

      const buf = new Uint8Array(size);
      const view = new DataView(buf.buffer);
      let pos = 0;

      BinaryUtils.writeUint32(view, pos, table.numCalKeyValues);
      pos += BinaryUtils.SIZEOF_UINT32;

      BinaryUtils.writeUint32(view, pos, table.ckvLookupEntries.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (const entry of table.ckvLookupEntries) {
        for (const value of entry.calKeyValues) {
          BinaryUtils.writeUint32(view, pos, value);
          pos += BinaryUtils.SIZEOF_UINT32;
        }
        BinaryUtils.writeUint32(view, pos, entry.offsetCalDefinition);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, entry.offsetCalDataOffset);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, entry.offsetDOT2);
        pos += BinaryUtils.SIZEOF_UINT32;
      }

      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeCalDef(chunk: AudioCalibrationChunk): Uint8Array {
    const payloads = chunk.getCalDefinitionEntries().map(({entry}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.calIdEntries.length * 2 * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, entry.calIdEntries.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const idEntry of entry.calIdEntries) {
        BinaryUtils.writeUint32(view, pos, idEntry.moduleInstanceId);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, idEntry.paramId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeCalDot(chunk: AudioCalibrationChunk): Uint8Array {
    const payloads = chunk.getCalDataOffsetEntries().map(({entry}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.calDataOffsets.length * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, entry.calDataOffsets.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const dataOffset of entry.calDataOffsets) {
        BinaryUtils.writeUint32(view, pos, dataOffset);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }
}
