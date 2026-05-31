/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Key Info Entry from Master Key Table
 * Format: KeyInfo = VocKeyId IsDynamic
 */
export interface VoiceKeyInfo {
  voiceKeyId: number;
  isDynamic: boolean;
}

/**
 * Master Key Table
 * Format: VCPMMasterKeyTbl = NumMasterKeys KeyInfo+
 */
export interface VoiceMasterKeyTable {
  keyInfos: VoiceKeyInfo[];
}

/**
 * Calibration Key Table
 * Format: VocCalKeyTbl = NumVocKeyIds VocKeyId+
 */
export interface VoiceCalKeyTable {
  voiceKeyIds: number[];
}

/**
 * Calibration Key-Value LUT Entry
 * Format: VocCKVLUTEntry = VocCalKeyVal+
 * (number of values determined by parent table's numVoiceCalKeyValues)
 */
export interface VoiceCkvLookupEntry {
  voiceCalKeyValues: number[];
}

/**
 * Calibration Key-Value LUT Table
 * Format: VocCKVLUTTbl = NumVocCalKeyVals NumVocCKVLUTEntries VocCKVLUTEntry+
 */
export interface VoiceCkvLookupTable {
  numVoiceCalKeyValues: number;
  voiceCkvLookupEntries: VoiceCkvLookupEntry[];
}

/**
 * Voice Calibration Definition Entry
 * Format: VocCalDefTbl = NumMiidPidPairs MiidPidPair+
 *         MiidPidPair = Miid Pid
 */
export interface VoiceCalDefinitionEntry {
  moduleInstanceParamPairs: Array<{moduleInstanceId: number; paramId: number}>;
}

/**
 * Voice Calibration Data Offset Table Entry
 * Contains offsets to datapool for each module-parameter pair
 */
export interface VoiceCalDataOffsetEntry {
  offsetsInGlobalDataPool: number[];
}

/**
 * Calibration Data Object
 * Format: CalDataObj = OffsetVocCKVLUTTbl OffsetVocCalDefTbl NumMiidPidPairs OffsetInGlbDataPool+
 */
export interface VoiceCalDataObject {
  offsetVoiceCkvLookupTable: number;
  offsetVoiceCalDefinitionTable: number;
  numModuleInstanceParamPairs: number;
  offsetsInGlobalDataPool: number[];
}

/**
 * Voice CKV Data Table
 * Format: VocCKVDataTbl = VocCKVDataTblSize OffsetVocCalKeyTbl DOTTblSize NumCalDataObj CalDataObj+
 */
export interface VoiceCkvDataTable {
  voiceCkvDataTableSize: number;
  offsetVoiceCalKeyTable: number;
  dataOffsetTableSize: number;
  calDataObjects: VoiceCalDataObject[];
}

/**
 * Subgraph Calibration Table
 * Format: SGCalTbl = SGID SGCalTblSize MajorVers MinorVers OffsetVCPMMasterKeyTbl NumCKVDataTbl VocCKVDataTbl+
 */
export interface VoiceSubgraphCalTable {
  subgraphId: number;
  subgraphCalTableSize: number;
  majorVersion: number;
  minorVersion: number;
  offsetVoiceMasterKeyTable: number;
  voiceCkvDataTables: VoiceCkvDataTable[];
}

/**
 * Voice calibration chunk (VCPM_CALDATA).
 * Contains calibration data for voice subgraphs.
 *
 * Format:
 * VCPMCalDataChunk = VCPMInstId VCPMCalTblParamId NumSGIDs SGCalTbl+
 * SGCalTbl = SGID SGCalTblSize MajorVers MinorVers OffsetVCPMMasterKeyTbl NumCKVDataTbl VocCKVDataTbl+
 * VocCKVDataTbl = VocCKVDataTblSize OffsetVocCalKeyTbl DOTTblSize NumCalDataObj CalDataObj+
 * CalDataObj = OffsetVocCKVLUTTbl OffsetVocCalDefTbl NumMiidPidPairs OffsetInGlbDataPool+
 *
 * Dependencies:
 * - VCPM_MASTER_KEY: VCPMMasterKeyTbl = NumMasterKeys KeyInfo+
 *                    KeyInfo = VocKeyId IsDynamic
 *
 * - VCPM_CALIBRATION_KEY_TABLE: VocCalKeyTbl = NumVocKeyIds VocKeyId+
 *
 * - VCPM_CALIBRATION_DATA_LUT: VocCKVLUTTbl = NumVocCalKeyVals NumVocCKVLUTEntries VocCKVLUTEntry+
 *                               VocCKVLUTEntry = VocCalKeyVal+
 *
 * - VCPM_CALIBRATION_DATA_DEF: VocCalDefTbl = NumMiidPidPairs MiidPidPair+
 *                               MiidPidPair = Miid Pid
 */
export class VoiceCalibrationChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA;

  /** Voice module instance ID */
  voiceModuleInstanceId: number = 0;

  /** Voice parameter ID */
  voiceParamId: number = 0;

  /** Array of subgraph calibration tables */
  subgraphCalTables: VoiceSubgraphCalTable[] = [];

  /**
   * Unified storage using Maps for fast O(1) lookup.
   * Works for both upload (parsing) and download (building) directions.
   */
  private masterKeyTableCache = new Map<number, VoiceMasterKeyTable>();
  private masterKeyTableTotalLength: number = 0;

  private calKeyTableCache = new Map<number, VoiceCalKeyTable>();
  private calKeyTableTotalLength: number = 0;

  private ckvLookupTableCache = new Map<number, VoiceCkvLookupTable>();
  private ckvLookupTableTotalLength: number = 0;

  private calDefinitionEntryCache = new Map<number, VoiceCalDefinitionEntry>();
  private calDefinitionEntryTotalLength: number = 0;

  private calDataOffsetEntryCache = new Map<number, VoiceCalDataOffsetEntry>();
  private calDataOffsetEntryTotalLength: number = 0;

  /**
   * Reverse lookup maps for deduplication (content hash -> offset).
   * Used during download to find existing entries with same content.
   */
  private masterKeyTableHashMap = new Map<string, number>();
  private calKeyTableHashMap = new Map<string, number>();
  private ckvLookupTableHashMap = new Map<string, number>();
  private calDefinitionEntryHashMap = new Map<string, number>();
  private calDataOffsetEntryHashMap = new Map<string, number>();

  // Public accessor methods
  getMasterKeyTable(offset: number): VoiceMasterKeyTable | undefined {
    return this.masterKeyTableCache.get(offset);
  }

  getCalKeyTable(offset: number): VoiceCalKeyTable | undefined {
    return this.calKeyTableCache.get(offset);
  }

  getCkvLookupTable(offset: number): VoiceCkvLookupTable | undefined {
    return this.ckvLookupTableCache.get(offset);
  }

  getCalDefinitionEntry(offset: number): VoiceCalDefinitionEntry | undefined {
    return this.calDefinitionEntryCache.get(offset);
  }

  getCalDataOffsetEntry(offset: number): VoiceCalDataOffsetEntry | undefined {
    return this.calDataOffsetEntryCache.get(offset);
  }

  /**
   * Store MasterKeyTable at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setMasterKeyTableAt(offset: number, table: VoiceMasterKeyTable): void {
    this.masterKeyTableCache.set(offset, table);
  }

  /**
   * Add MasterKeyTable with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addMasterKeyTable(table: VoiceMasterKeyTable): number {
    const hash = table.keyInfos
      .map(k => `${k.voiceKeyId}:${k.isDynamic}`)
      .join(',');

    const existingOffset = this.masterKeyTableHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      table.keyInfos.length * 2 * BinaryUtils.SIZEOF_UINT32;
    const offset = this.masterKeyTableTotalLength;

    this.masterKeyTableCache.set(offset, table);
    this.masterKeyTableHashMap.set(hash, offset);
    this.masterKeyTableTotalLength += size;

    return offset;
  }

  /**
   * Store CalKeyTable at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setCalKeyTableAt(offset: number, table: VoiceCalKeyTable): void {
    this.calKeyTableCache.set(offset, table);
  }

  /**
   * Add CalKeyTable with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCalKeyTable(table: VoiceCalKeyTable): number {
    const hash = table.voiceKeyIds.join(',');

    const existingOffset = this.calKeyTableHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      table.voiceKeyIds.length * BinaryUtils.SIZEOF_UINT32;
    const offset = this.calKeyTableTotalLength;

    this.calKeyTableCache.set(offset, table);
    this.calKeyTableHashMap.set(hash, offset);
    this.calKeyTableTotalLength += size;

    return offset;
  }

  /**
   * Store CkvLookupTable at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setCkvLookupTableAt(offset: number, table: VoiceCkvLookupTable): void {
    this.ckvLookupTableCache.set(offset, table);
  }

  /**
   * Add CkvLookupTable with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCkvLookupTable(table: VoiceCkvLookupTable): number {
    const hash = this.hashVoiceCkvLookupTable(table);

    const existingOffset = this.ckvLookupTableHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    // Calculate size
    let size = BinaryUtils.SIZEOF_UINT32 + BinaryUtils.SIZEOF_UINT32;
    for (const entry of table.voiceCkvLookupEntries) {
      size += entry.voiceCalKeyValues.length * BinaryUtils.SIZEOF_UINT32;
    }

    const offset = this.ckvLookupTableTotalLength;
    this.ckvLookupTableCache.set(offset, table);
    this.ckvLookupTableHashMap.set(hash, offset);
    this.ckvLookupTableTotalLength += size;

    return offset;
  }

  /**
   * Store CalDefinitionEntry at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setCalDefinitionEntryAt(
    offset: number,
    entry: VoiceCalDefinitionEntry,
  ): void {
    this.calDefinitionEntryCache.set(offset, entry);
  }

  /**
   * Add CalDefinitionEntry with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCalDefinitionEntry(entry: VoiceCalDefinitionEntry): number {
    const hash = entry.moduleInstanceParamPairs
      .map(e => `${e.moduleInstanceId}:${e.paramId}`)
      .join(',');

    const existingOffset = this.calDefinitionEntryHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      entry.moduleInstanceParamPairs.length * 2 * BinaryUtils.SIZEOF_UINT32;
    const offset = this.calDefinitionEntryTotalLength;

    this.calDefinitionEntryCache.set(offset, entry);
    this.calDefinitionEntryHashMap.set(hash, offset);
    this.calDefinitionEntryTotalLength += size;

    return offset;
  }

  /**
   * Store CalDataOffsetEntry at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setCalDataOffsetEntryAt(
    offset: number,
    entry: VoiceCalDataOffsetEntry,
  ): void {
    this.calDataOffsetEntryCache.set(offset, entry);
  }

  /**
   * Add CalDataOffsetEntry with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCalDataOffsetEntry(entry: VoiceCalDataOffsetEntry): number {
    const hash = entry.offsetsInGlobalDataPool.join(',');

    const existingOffset = this.calDataOffsetEntryHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      entry.offsetsInGlobalDataPool.length * BinaryUtils.SIZEOF_UINT32;
    const offset = this.calDataOffsetEntryTotalLength;

    this.calDataOffsetEntryCache.set(offset, entry);
    this.calDataOffsetEntryHashMap.set(hash, offset);
    this.calDataOffsetEntryTotalLength += size;

    return offset;
  }

  /**
   * Create hash string for VoiceCkvLookupTable for deduplication.
   */
  private hashVoiceCkvLookupTable(table: VoiceCkvLookupTable): string {
    const parts: string[] = [table.numVoiceCalKeyValues.toString()];
    for (const entry of table.voiceCkvLookupEntries) {
      parts.push(entry.voiceCalKeyValues.join(':'));
    }
    return parts.join('|');
  }

  /**
   * Serialize all master key tables to binary payloads.
   */
  serializeMasterKeyTablePayloads(): Uint8Array[] {
    const payloads: Uint8Array[] = [];
    const sortedOffsets = [...this.masterKeyTableCache.keys()].sort(
      (a, b) => a - b,
    );

    for (const offset of sortedOffsets) {
      const table = this.masterKeyTableCache.get(offset)!;
      const buffer = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          table.keyInfos.length * 2 * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buffer.buffer);
      let bufferOffset = 0;

      BinaryUtils.writeUint32(view, bufferOffset, table.keyInfos.length);
      bufferOffset += BinaryUtils.SIZEOF_UINT32;

      for (const keyInfo of table.keyInfos) {
        BinaryUtils.writeUint32(view, bufferOffset, keyInfo.voiceKeyId);
        bufferOffset += BinaryUtils.SIZEOF_UINT32;

        BinaryUtils.writeUint32(view, bufferOffset, keyInfo.isDynamic ? 1 : 0);
        bufferOffset += BinaryUtils.SIZEOF_UINT32;
      }

      payloads.push(buffer);
    }

    return payloads;
  }

  /**
   * Serialize all cal key tables to binary payloads.
   */
  serializeCalKeyTablePayloads(): Uint8Array[] {
    const payloads: Uint8Array[] = [];
    const sortedOffsets = [...this.calKeyTableCache.keys()].sort(
      (a, b) => a - b,
    );

    for (const offset of sortedOffsets) {
      const table = this.calKeyTableCache.get(offset)!;
      const buffer = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          table.voiceKeyIds.length * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buffer.buffer);
      let bufferOffset = 0;

      BinaryUtils.writeUint32(view, bufferOffset, table.voiceKeyIds.length);
      bufferOffset += BinaryUtils.SIZEOF_UINT32;

      for (const keyId of table.voiceKeyIds) {
        BinaryUtils.writeUint32(view, bufferOffset, keyId);
        bufferOffset += BinaryUtils.SIZEOF_UINT32;
      }

      payloads.push(buffer);
    }

    return payloads;
  }

  /**
   * Serialize all CKV LUT tables to binary payloads.
   */
  serializeCkvLutPayloads(): Uint8Array[] {
    const payloads: Uint8Array[] = [];
    const sortedOffsets = [...this.ckvLookupTableCache.keys()].sort(
      (a, b) => a - b,
    );

    for (const offset of sortedOffsets) {
      const table = this.ckvLookupTableCache.get(offset)!;
      let size = BinaryUtils.SIZEOF_UINT32 + BinaryUtils.SIZEOF_UINT32;
      for (const entry of table.voiceCkvLookupEntries) {
        size += entry.voiceCalKeyValues.length * BinaryUtils.SIZEOF_UINT32;
      }

      const buffer = new Uint8Array(size);
      const view = new DataView(buffer.buffer);
      let bufferOffset = 0;

      BinaryUtils.writeUint32(view, bufferOffset, table.numVoiceCalKeyValues);
      bufferOffset += BinaryUtils.SIZEOF_UINT32;

      BinaryUtils.writeUint32(
        view,
        bufferOffset,
        table.voiceCkvLookupEntries.length,
      );
      bufferOffset += BinaryUtils.SIZEOF_UINT32;

      for (const entry of table.voiceCkvLookupEntries) {
        for (const value of entry.voiceCalKeyValues) {
          BinaryUtils.writeUint32(view, bufferOffset, value);
          bufferOffset += BinaryUtils.SIZEOF_UINT32;
        }
      }

      payloads.push(buffer);
    }

    return payloads;
  }

  /**
   * Serialize all cal definition entries to binary payloads.
   */
  serializeCalDefPayloads(): Uint8Array[] {
    const payloads: Uint8Array[] = [];
    const sortedOffsets = [...this.calDefinitionEntryCache.keys()].sort(
      (a, b) => a - b,
    );

    for (const offset of sortedOffsets) {
      const entry = this.calDefinitionEntryCache.get(offset)!;
      const buffer = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.moduleInstanceParamPairs.length * 2 * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(buffer.buffer);
      let bufferOffset = 0;

      BinaryUtils.writeUint32(
        view,
        bufferOffset,
        entry.moduleInstanceParamPairs.length,
      );
      bufferOffset += BinaryUtils.SIZEOF_UINT32;

      for (const pair of entry.moduleInstanceParamPairs) {
        BinaryUtils.writeUint32(view, bufferOffset, pair.moduleInstanceId);
        bufferOffset += BinaryUtils.SIZEOF_UINT32;

        BinaryUtils.writeUint32(view, bufferOffset, pair.paramId);
        bufferOffset += BinaryUtils.SIZEOF_UINT32;
      }

      payloads.push(buffer);
    }

    return payloads;
  }

  /**
   * Get all subgraph IDs that have voice calibration data
   */
  getAllSubgraphIds(): number[] {
    return this.subgraphCalTables.map(tbl => tbl.subgraphId);
  }

  /**
   * Get the total number of subgraphs with voice calibration data
   */
  getSubgraphCount(): number {
    return this.subgraphCalTables.length;
  }
}
