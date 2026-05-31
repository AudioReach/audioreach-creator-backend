/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {
  AudioCalibrationChunk,
  CkvLookupTable,
  CkvLookupEntry,
} from '../../../shared/acdb-chunks/audio-calibration-chunk.js';

/**
 * Result of audio calibration chunk serialization.
 */
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
    // Early return if no data
    if (chunk.subgraphLookupEntries.length === 0) {
      return {
        calSgLut: new Uint8Array(0),
        calKeyTable: new Uint8Array(0),
        ckvLut: new Uint8Array(0),
        calDef: new Uint8Array(0),
        calDot: new Uint8Array(0),
      };
    }

    // Serialize to binary using chunk's serialize methods
    return this.serializeToBinary(chunk);
  }

  /**
   * Phase 2: Serialize chunk to binary format.
   */
  private serializeToBinary(
    chunk: AudioCalibrationChunk,
  ): AudioCalibrationSerializationResult {
    // Serialize CalSGLUT
    const calSgLut = this.serializeCalSgLut(chunk);

    // Serialize CalKeyTable (concatenated)
    const calKeyTable = this.serializeCalKeyTable(chunk);

    // Serialize CkvLut (concatenated)
    const ckvLut = this.serializeCkvLut(chunk);

    // Serialize CalDef (concatenated)
    const calDef = this.serializeCalDef(chunk);

    // Serialize CalDot (concatenated)
    const calDot = this.serializeCalDot(chunk);

    return {
      calSgLut,
      calKeyTable,
      ckvLut,
      calDef,
      calDot,
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

    // NumSGIDs
    BinaryUtils.writeUint32(view, offset, chunk.subgraphLookupEntries.length);
    offset += BinaryUtils.SIZEOF_UINT32;

    for (const sgEntry of chunk.subgraphLookupEntries) {
      // SGId
      BinaryUtils.writeUint32(view, offset, sgEntry.subgraphId);
      offset += BinaryUtils.SIZEOF_UINT32;

      // NumCalKeyTblEntries
      BinaryUtils.writeUint32(view, offset, sgEntry.calKeyTableEntries.length);
      offset += BinaryUtils.SIZEOF_UINT32;

      for (const calKeyEntry of sgEntry.calKeyTableEntries) {
        // OffsetCalKeyTbl
        BinaryUtils.writeUint32(view, offset, calKeyEntry.offsetCalKeyTable);
        offset += BinaryUtils.SIZEOF_UINT32;

        // OffsetCalLUTTable
        BinaryUtils.writeUint32(view, offset, calKeyEntry.offsetCalLookupTable);
        offset += BinaryUtils.SIZEOF_UINT32;
      }
    }

    return buffer;
  }

  private serializeCalKeyTable(chunk: AudioCalibrationChunk): Uint8Array {
    const payloads = chunk.serializeCalKeyTablePayloads();
    return BinaryUtils.concatenate(payloads);
  }

  private serializeCkvLut(chunk: AudioCalibrationChunk): Uint8Array {
    const luts: Uint8Array[] = [];

    for (const sgEntry of chunk.subgraphLookupEntries) {
      for (const calKeyEntry of sgEntry.calKeyTableEntries) {
        const ckvLut = chunk.getCkvLookupTable(
          calKeyEntry.offsetCalLookupTable,
        );
        if (ckvLut) {
          luts.push(this.serializeSingleCkvLut(ckvLut));
        }
      }
    }

    return BinaryUtils.concatenate(luts);
  }

  private calculateCkvLutSize(ckvLut: CkvLookupTable): number {
    let size =
      BinaryUtils.SIZEOF_UINT32 + // numCalKeyValues
      BinaryUtils.SIZEOF_UINT32; // numCKVLUTEntries

    for (const ckvEntry of ckvLut.ckvLookupEntries) {
      size +=
        ckvEntry.calKeyValues.length * BinaryUtils.SIZEOF_UINT32 +
        BinaryUtils.SIZEOF_UINT32 + // offsetCalDefinition
        BinaryUtils.SIZEOF_UINT32 + // offsetCalDataOffset
        BinaryUtils.SIZEOF_UINT32; // offsetDOT2
    }

    return size;
  }

  private serializeSingleCkvLut(ckvLut: CkvLookupTable): Uint8Array {
    const lutSize = this.calculateCkvLutSize(ckvLut);
    const buffer = new Uint8Array(lutSize);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    // NumCalKeyVals
    BinaryUtils.writeUint32(view, offset, ckvLut.numCalKeyValues);
    offset += BinaryUtils.SIZEOF_UINT32;

    // NumCKVLUTEntries
    BinaryUtils.writeUint32(view, offset, ckvLut.ckvLookupEntries.length);
    offset += BinaryUtils.SIZEOF_UINT32;

    for (const ckvEntry of ckvLut.ckvLookupEntries) {
      offset = this.writeCkvEntry(view, offset, ckvEntry);
    }

    return buffer;
  }

  private writeCkvEntry(
    view: DataView,
    offset: number,
    ckvEntry: CkvLookupEntry,
  ): number {
    // CalKeyValues
    for (const value of ckvEntry.calKeyValues) {
      BinaryUtils.writeUint32(view, offset, value);
      offset += BinaryUtils.SIZEOF_UINT32;
    }

    // OffsetCalDEF
    BinaryUtils.writeUint32(view, offset, ckvEntry.offsetCalDefinition);
    offset += BinaryUtils.SIZEOF_UINT32;

    // OffsetCalDOT
    BinaryUtils.writeUint32(view, offset, ckvEntry.offsetCalDataOffset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // OffsetDOT2
    BinaryUtils.writeUint32(view, offset, ckvEntry.offsetDOT2);
    offset += BinaryUtils.SIZEOF_UINT32;

    return offset;
  }

  private serializeCalDef(chunk: AudioCalibrationChunk): Uint8Array {
    const payloads = chunk.serializeCalDefPayloads();
    return BinaryUtils.concatenate(payloads);
  }

  private serializeCalDot(chunk: AudioCalibrationChunk): Uint8Array {
    const payloads = chunk.serializeCalDotPayloads();
    return BinaryUtils.concatenate(payloads);
  }
}
