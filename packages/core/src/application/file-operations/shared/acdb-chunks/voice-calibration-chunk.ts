/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';

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
   * Offset-based caches for parsed sub-structures.
   *
   * These caches memoize parsing of binary sub-structures that are referenced
   * multiple times by byte offset within the chunk. The caching strategy relies
   * on the immutability of binary data - the same offset always produces the
   * same parsed result.
   *
   * Benefits:
   * - Avoids redundant parsing of the same binary data
   * - Improves performance when multiple entries reference the same sub-structure
   *
   * Implementation note: The parser populates these caches during the initial
   * parse pass, and subsequent lookups return cached results.
   */
  private masterKeyTableCache = new Map<number, VoiceMasterKeyTable>();
  private calKeyTableCache = new Map<number, VoiceCalKeyTable>();
  private ckvLookupTableCache = new Map<number, VoiceCkvLookupTable>();
  private calDefinitionEntryCache = new Map<number, VoiceCalDefinitionEntry>();
  private calDataOffsetEntryCache = new Map<number, VoiceCalDataOffsetEntry>();

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

  // Internal methods for parser to populate caches
  setMasterKeyTable(offset: number, table: VoiceMasterKeyTable): void {
    this.masterKeyTableCache.set(offset, table);
  }

  setCalKeyTable(offset: number, table: VoiceCalKeyTable): void {
    this.calKeyTableCache.set(offset, table);
  }

  setCkvLookupTable(offset: number, table: VoiceCkvLookupTable): void {
    this.ckvLookupTableCache.set(offset, table);
  }

  setCalDefinitionEntry(offset: number, entry: VoiceCalDefinitionEntry): void {
    this.calDefinitionEntryCache.set(offset, entry);
  }

  setCalDataOffsetEntry(offset: number, entry: VoiceCalDataOffsetEntry): void {
    this.calDataOffsetEntryCache.set(offset, entry);
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
