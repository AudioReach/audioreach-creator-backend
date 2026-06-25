/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {VoiceCalibrationChunk} from '../../../shared/acdb-chunks/voice-calibration-chunk.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  SPF_VCPM_MODULE_ID,
  PARAM_ID_VOICE_CAL_TBL,
} from '../../../shared/constants/spf-ids.js';

/**
 * Result of voice calibration chunk serialization.
 */
export interface VoiceCalibrationSerializationResult {
  vcpmCalData: Uint8Array;
  vcpmMasterKey: Uint8Array;
  vcpmCalKeyTable: Uint8Array;
  vcpmCalDataLut: Uint8Array;
  vcpmCalDataDef: Uint8Array;
}

/**
 * Serializer for voice calibration chunks.
 * Handles sequential datapool offset assignment and binary serialization.
 *
 * MUST be sequential due to shared datapool state.
 */
export class VoiceCalibrationChunkSerializer {
  /**
   * Serialize voice calibration chunk to binary format.
   *
   * The builder has already assigned datapool offsets while mutating the shared
   * datapool sequentially.
   *
   * @param chunk - Parsed voice calibration chunk
   * @returns Binary chunks for ACDB file
   */
  serialize(chunk: VoiceCalibrationChunk): VoiceCalibrationSerializationResult {
    // Early return if no data
    if (chunk.subgraphCalTables.length === 0) {
      return {
        vcpmCalData: new Uint8Array(0),
        vcpmMasterKey: new Uint8Array(0),
        vcpmCalKeyTable: new Uint8Array(0),
        vcpmCalDataLut: new Uint8Array(0),
        vcpmCalDataDef: new Uint8Array(0),
      };
    }

    // Serialize to binary
    return this.serializeToBinary(chunk);
  }

  /**
   * Phase 2: Serialize chunk to binary format.
   */
  private serializeToBinary(
    chunk: VoiceCalibrationChunk,
  ): VoiceCalibrationSerializationResult {
    // Serialize VCPM_CALDATA
    const vcpmCalData = this.serializeVcpmCalData(chunk);

    // Serialize VCPM_MASTER_KEY (concatenated)
    const vcpmMasterKey = this.serializeVcpmMasterKey(chunk);

    // Serialize VCPM_CALIBRATION_KEY_TABLE (concatenated)
    const vcpmCalKeyTable = this.serializeVcpmCalKeyTable(chunk);

    // Serialize VCPM_CALIBRATION_DATA_LUT (concatenated)
    const vcpmCalDataLut = this.serializeVcpmCalDataLut(chunk);

    // Serialize VCPM_CALIBRATION_DATA_DEF (concatenated)
    const vcpmCalDataDef = this.serializeVcpmCalDataDef(chunk);

    return {
      vcpmCalData,
      vcpmMasterKey,
      vcpmCalKeyTable,
      vcpmCalDataLut,
      vcpmCalDataDef,
    };
  }

  private serializeVcpmCalData(chunk: VoiceCalibrationChunk): Uint8Array {
    const totalSize = this.calculateVcpmCalDataSize(chunk);
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(buffer.buffer);
    let offset = 0;

    offset = this.writeVcpmCalDataHeader(view, offset, chunk);
    this.writeSubgraphTables(view, offset, chunk);

    return buffer;
  }

  private calculateVcpmCalDataSize(chunk: VoiceCalibrationChunk): number {
    let totalSize =
      BinaryUtils.SIZEOF_UINT32 + // VCPMInstId
      BinaryUtils.SIZEOF_UINT32 + // VCPMCalTblParamId
      BinaryUtils.SIZEOF_UINT32; // NumSGIDs

    for (const sgTable of chunk.subgraphCalTables) {
      totalSize += this.calculateSubgraphTableSize(sgTable);
    }

    return totalSize;
  }

  private calculateSubgraphTableSize(
    sgTable: VoiceCalibrationChunk['subgraphCalTables'][0],
  ): number {
    let size =
      BinaryUtils.SIZEOF_UINT32 + // SGID
      BinaryUtils.SIZEOF_UINT32 + // SGCalTblSize
      BinaryUtils.SIZEOF_UINT32 + // MajorVers
      BinaryUtils.SIZEOF_UINT32 + // MinorVers
      BinaryUtils.SIZEOF_UINT32 + // OffsetVCPMMasterKeyTbl
      BinaryUtils.SIZEOF_UINT32; // NumCKVDataTbl

    for (const ckvDataTable of sgTable.voiceCkvDataTables) {
      size += this.calculateCkvDataTableSize(ckvDataTable);
    }

    return size;
  }

  private calculateCkvDataTableSize(
    ckvDataTable: VoiceCalibrationChunk['subgraphCalTables'][0]['voiceCkvDataTables'][0],
  ): number {
    let size =
      BinaryUtils.SIZEOF_UINT32 + // VocCKVDataTblSize
      BinaryUtils.SIZEOF_UINT32 + // OffsetVocCalKeyTbl
      BinaryUtils.SIZEOF_UINT32 + // DOTTblSize
      BinaryUtils.SIZEOF_UINT32; // NumCalDataObj

    for (const calDataObj of ckvDataTable.calDataObjects) {
      size +=
        BinaryUtils.SIZEOF_UINT32 + // OffsetVocCKVLUTTbl
        BinaryUtils.SIZEOF_UINT32 + // OffsetVocCalDefTbl
        BinaryUtils.SIZEOF_UINT32 + // NumMiidPidPairs
        calDataObj.numModuleInstanceParamPairs * BinaryUtils.SIZEOF_UINT32;
    }

    return size;
  }

  private writeVcpmCalDataHeader(
    view: DataView,
    offset: number,
    chunk: VoiceCalibrationChunk,
  ): number {
    BinaryUtils.writeUint32(view, offset, SPF_VCPM_MODULE_ID);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, PARAM_ID_VOICE_CAL_TBL);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, chunk.subgraphCalTables.length);
    offset += BinaryUtils.SIZEOF_UINT32;

    return offset;
  }

  private writeSubgraphTables(
    view: DataView,
    offset: number,
    chunk: VoiceCalibrationChunk,
  ): number {
    for (const sgTable of chunk.subgraphCalTables) {
      offset = this.writeSubgraphTable(view, offset, sgTable);
    }
    return offset;
  }

  private writeSubgraphTable(
    view: DataView,
    offset: number,
    sgTable: VoiceCalibrationChunk['subgraphCalTables'][0],
  ): number {
    BinaryUtils.writeUint32(view, offset, sgTable.subgraphId);
    offset += BinaryUtils.SIZEOF_UINT32;

    const sgCalTblSize = this.calculateSgCalTblSize(sgTable);
    BinaryUtils.writeUint32(view, offset, sgCalTblSize);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, sgTable.majorVersion);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, sgTable.minorVersion);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, sgTable.offsetVoiceMasterKeyTable);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, sgTable.voiceCkvDataTables.length);
    offset += BinaryUtils.SIZEOF_UINT32;

    for (const ckvDataTable of sgTable.voiceCkvDataTables) {
      offset = this.writeCkvDataTable(view, offset, ckvDataTable);
    }

    return offset;
  }

  private calculateSgCalTblSize(
    sgTable: VoiceCalibrationChunk['subgraphCalTables'][0],
  ): number {
    let size =
      BinaryUtils.SIZEOF_UINT32 + // MajorVers
      BinaryUtils.SIZEOF_UINT32 + // MinorVers
      BinaryUtils.SIZEOF_UINT32 + // OffsetVCPMMasterKeyTbl
      BinaryUtils.SIZEOF_UINT32; // NumCKVDataTbl

    for (const ckvDataTable of sgTable.voiceCkvDataTables) {
      size += this.calculateCkvDataTableSize(ckvDataTable);
    }

    return size;
  }

  private writeCkvDataTable(
    view: DataView,
    offset: number,
    ckvDataTable: VoiceCalibrationChunk['subgraphCalTables'][0]['voiceCkvDataTables'][0],
  ): number {
    const ckvDataTblSize = this.calculateCkvDataTblSize(ckvDataTable);
    BinaryUtils.writeUint32(view, offset, ckvDataTblSize);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, ckvDataTable.offsetVoiceCalKeyTable);
    offset += BinaryUtils.SIZEOF_UINT32;

    const dotTblSize = this.calculateDotTblSize(ckvDataTable);
    BinaryUtils.writeUint32(view, offset, dotTblSize);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(view, offset, ckvDataTable.calDataObjects.length);
    offset += BinaryUtils.SIZEOF_UINT32;

    for (const calDataObj of ckvDataTable.calDataObjects) {
      offset = this.writeCalDataObject(view, offset, calDataObj);
    }

    return offset;
  }

  private calculateCkvDataTblSize(
    ckvDataTable: VoiceCalibrationChunk['subgraphCalTables'][0]['voiceCkvDataTables'][0],
  ): number {
    let size =
      BinaryUtils.SIZEOF_UINT32 + // OffsetVocCalKeyTbl
      BinaryUtils.SIZEOF_UINT32 + // DOTTblSize
      BinaryUtils.SIZEOF_UINT32; // NumCalDataObj

    for (const calDataObj of ckvDataTable.calDataObjects) {
      size +=
        BinaryUtils.SIZEOF_UINT32 + // OffsetVocCKVLUTTbl
        BinaryUtils.SIZEOF_UINT32 + // OffsetVocCalDefTbl
        BinaryUtils.SIZEOF_UINT32 + // NumMiidPidPairs
        calDataObj.numModuleInstanceParamPairs * BinaryUtils.SIZEOF_UINT32;
    }

    return size;
  }

  private calculateDotTblSize(
    ckvDataTable: VoiceCalibrationChunk['subgraphCalTables'][0]['voiceCkvDataTables'][0],
  ): number {
    let size = BinaryUtils.SIZEOF_UINT32; // NumCalDataObj

    for (const calDataObj of ckvDataTable.calDataObjects) {
      size +=
        BinaryUtils.SIZEOF_UINT32 + // OffsetVocCKVLUTTbl
        BinaryUtils.SIZEOF_UINT32 + // OffsetVocCalDefTbl
        BinaryUtils.SIZEOF_UINT32 + // NumMiidPidPairs
        calDataObj.numModuleInstanceParamPairs * BinaryUtils.SIZEOF_UINT32;
    }

    return size;
  }

  private writeCalDataObject(
    view: DataView,
    offset: number,
    calDataObj: VoiceCalibrationChunk['subgraphCalTables'][0]['voiceCkvDataTables'][0]['calDataObjects'][0],
  ): number {
    BinaryUtils.writeUint32(view, offset, calDataObj.offsetVoiceCkvLookupTable);
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(
      view,
      offset,
      calDataObj.offsetVoiceCalDefinitionTable,
    );
    offset += BinaryUtils.SIZEOF_UINT32;

    BinaryUtils.writeUint32(
      view,
      offset,
      calDataObj.numModuleInstanceParamPairs,
    );
    offset += BinaryUtils.SIZEOF_UINT32;

    for (const dpOffset of calDataObj.offsetsInGlobalDataPool) {
      BinaryUtils.writeUint32(view, offset, dpOffset);
      offset += BinaryUtils.SIZEOF_UINT32;
    }

    return offset;
  }

  private serializeVcpmMasterKey(chunk: VoiceCalibrationChunk): Uint8Array {
    const payloads = chunk.getMasterKeyTableEntries().map(({table}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          table.keyInfos.length * 2 * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, table.keyInfos.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const keyInfo of table.keyInfos) {
        BinaryUtils.writeUint32(view, pos, keyInfo.voiceKeyId);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, keyInfo.isDynamic ? 1 : 0);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeVcpmCalKeyTable(chunk: VoiceCalibrationChunk): Uint8Array {
    const payloads = chunk.getCalKeyTableEntries().map(({table}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          table.voiceKeyIds.length * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, table.voiceKeyIds.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const keyId of table.voiceKeyIds) {
        BinaryUtils.writeUint32(view, pos, keyId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeVcpmCalDataLut(chunk: VoiceCalibrationChunk): Uint8Array {
    const payloads = chunk.getCkvLookupTableEntries().map(({table}) => {
      let size =
        BinaryUtils.SIZEOF_UINT32 + // numVoiceCalKeyValues
        BinaryUtils.SIZEOF_UINT32; // numEntries
      for (const entry of table.voiceCkvLookupEntries) {
        size += entry.voiceCalKeyValues.length * BinaryUtils.SIZEOF_UINT32;
      }

      const buf = new Uint8Array(size);
      const view = new DataView(buf.buffer);
      let pos = 0;

      BinaryUtils.writeUint32(view, pos, table.numVoiceCalKeyValues);
      pos += BinaryUtils.SIZEOF_UINT32;

      BinaryUtils.writeUint32(view, pos, table.voiceCkvLookupEntries.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (const entry of table.voiceCkvLookupEntries) {
        for (const value of entry.voiceCalKeyValues) {
          BinaryUtils.writeUint32(view, pos, value);
          pos += BinaryUtils.SIZEOF_UINT32;
        }
      }

      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }

  private serializeVcpmCalDataDef(chunk: VoiceCalibrationChunk): Uint8Array {
    const payloads = chunk.getCalDefinitionEntries().map(({entry}) => {
      const buf = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.moduleInstanceParamPairs.length * 2 * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buf.buffer);
      BinaryUtils.writeUint32(view, 0, entry.moduleInstanceParamPairs.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const pair of entry.moduleInstanceParamPairs) {
        BinaryUtils.writeUint32(view, pos, pair.moduleInstanceId);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, pair.paramId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      return buf;
    });
    return BinaryUtils.concatenate(payloads);
  }
}
