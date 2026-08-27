/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunkParser} from './base-chunk-parser.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  ACDB_RAW_CHUNK_TYPES,
  PARSED_CHUNK_TYPES,
} from '../../../shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {
  VoiceCalibrationChunk,
  type VoiceSubgraphCalTable,
  type VoiceCkvDataTable,
  type VoiceCalDataObject,
  type VoiceMasterKeyTable,
  type VoiceKeyInfo,
  type VoiceCalKeyTable,
  type VoiceCkvLookupTable,
  type VoiceCkvLookupEntry,
  type VoiceCalDefinitionEntry,
  type VoiceCalDataOffsetEntry,
} from '../../../shared/acdb-chunks/voice-calibration-chunk.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Parser for VCPM_CALDATA chunk.
 * Parses voice calibration data containing module-parameter-payload information.
 */
export class VoiceCalibrationChunkParser extends BaseChunkParser<VoiceCalibrationChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA;

  constructor(private readonly logger?: Logger) {
    super();
  }

  /**
   * Extract master key table from VCPM_MASTER_KEY chunk
   *
   * Format:
   * VCPMMasterKeyTbl = NumMasterKeys KeyInfo+
   * KeyInfo = VocKeyId IsDynamic
   */
  private extractMasterKeyTable(
    masterKeyData: Uint8Array,
    offset: number,
    chunk: VoiceCalibrationChunk,
  ): VoiceMasterKeyTable {
    // Check cache first
    const cached = chunk.getMasterKeyTable(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      masterKeyData.buffer,
      masterKeyData.byteOffset,
      masterKeyData.byteLength,
    );

    // Read number of master keys
    const numMasterKeys = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read key info entries
    const keyInfos: VoiceKeyInfo[] = [];
    for (let i = 0; i < numMasterKeys; i++) {
      const voiceKeyId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const isDynamic = BinaryUtils.readUint32(view, currentOffset) !== 0;
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      keyInfos.push({voiceKeyId, isDynamic});
    }

    const table: VoiceMasterKeyTable = {keyInfos};

    // Cache and return
    chunk.setMasterKeyTableAt(offset, table);
    return table;
  }

  /**
   * Extract calibration key table from VCPM_CALIBRATION_KEY_TABLE chunk
   *
   * Format:
   * VocCalKeyTbl = NumVocKeyIds VocKeyId+
   */
  private extractCalKeyTable(
    keyTableData: Uint8Array,
    offset: number,
    chunk: VoiceCalibrationChunk,
  ): VoiceCalKeyTable {
    // Check cache first
    const cached = chunk.getCalKeyTable(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      keyTableData.buffer,
      keyTableData.byteOffset,
      keyTableData.byteLength,
    );

    // Read number of key IDs
    const numVoiceKeyIds = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read key IDs
    const voiceKeyIds: number[] = [];
    for (let i = 0; i < numVoiceKeyIds; i++) {
      voiceKeyIds.push(BinaryUtils.readUint32(view, currentOffset));
      currentOffset += BinaryUtils.SIZEOF_UINT32;
    }

    const table: VoiceCalKeyTable = {voiceKeyIds};

    // Cache and return
    chunk.setCalKeyTableAt(offset, table);
    return table;
  }

  /**
   * Extract CKV LUT table from VCPM_CALIBRATION_DATA_LUT chunk
   *
   * Format:
   * VocCKVLUTTbl = NumVocCalKeyVals NumVocCKVLUTEntries VocCKVLUTEntry+
   * VocCKVLUTEntry = VocCalKeyVal+
   */
  private extractCkvLookupTable(
    dataLutData: Uint8Array,
    offset: number,
    chunk: VoiceCalibrationChunk,
  ): VoiceCkvLookupTable {
    // Check cache first
    const cached = chunk.getCkvLookupTable(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      dataLutData.buffer,
      dataLutData.byteOffset,
      dataLutData.byteLength,
    );

    // Read header
    const numVoiceCalKeyValues = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    const numVoiceCkvLookupEntries = BinaryUtils.readUint32(
      view,
      currentOffset,
    );
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read CKV LUT entries
    const voiceCkvLookupEntries: VoiceCkvLookupEntry[] = [];
    for (let i = 0; i < numVoiceCkvLookupEntries; i++) {
      // Read calibration key values (variable length)
      const voiceCalKeyValues: number[] = [];
      for (let j = 0; j < numVoiceCalKeyValues; j++) {
        voiceCalKeyValues.push(BinaryUtils.readUint32(view, currentOffset));
        currentOffset += BinaryUtils.SIZEOF_UINT32;
      }

      voiceCkvLookupEntries.push({voiceCalKeyValues});
    }

    const table: VoiceCkvLookupTable = {
      numVoiceCalKeyValues,
      voiceCkvLookupEntries,
    };

    // Cache and return
    chunk.setCkvLookupTableAt(offset, table);
    return table;
  }

  /**
   * Extract calibration definition entry from VCPM_CALIBRATION_DATA_DEF chunk
   *
   * Format:
   * VocCalDefTbl = NumMiidPidPairs MiidPidPair+
   * MiidPidPair = Miid Pid
   */
  private extractCalDefinitionEntry(
    dataDefData: Uint8Array,
    offset: number,
    chunk: VoiceCalibrationChunk,
  ): VoiceCalDefinitionEntry {
    // Check cache first
    const cached = chunk.getCalDefinitionEntry(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      dataDefData.buffer,
      dataDefData.byteOffset,
      dataDefData.byteLength,
    );

    // Read number of module-parameter pairs
    const numModuleInstanceParamPairs = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read [moduleInstanceId, paramId] pairs
    const moduleInstanceParamPairs: Array<{
      moduleInstanceId: number;
      paramId: number;
    }> = [];
    for (let i = 0; i < numModuleInstanceParamPairs; i++) {
      const moduleInstanceId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const paramId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      moduleInstanceParamPairs.push({moduleInstanceId, paramId});
    }

    const entry: VoiceCalDefinitionEntry = {moduleInstanceParamPairs};

    // Cache and return
    chunk.setCalDefinitionEntryAt(offset, entry);
    return entry;
  }

  /**
   * Parse a single calibration data object
   *
   * Format:
   * CalDataObj = OffsetVocCKVLUTTbl OffsetVocCalDefTbl NumMiidPidPairs OffsetInGlbDataPool+
   */
  private parseCalDataObject(
    view: DataView,
    offset: number,
    chunk: VoiceCalibrationChunk,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
  ): {entry: VoiceCalDataObject; newOffset: number} {
    // Read offsets
    const offsetVoiceCkvLookupTable = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    const offsetVoiceCalDefinitionTable = BinaryUtils.readUint32(
      view,
      currentOffset,
    );
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    const numModuleInstanceParamPairs = BinaryUtils.readUint32(
      view,
      currentOffset,
    );
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read array of offsets in global data pool
    const offsetsInGlobalDataPool: number[] = [];
    for (let i = 0; i < numModuleInstanceParamPairs; i++) {
      offsetsInGlobalDataPool.push(BinaryUtils.readUint32(view, currentOffset));
      currentOffset += BinaryUtils.SIZEOF_UINT32;
    }

    // Extract and cache CKV LUT table
    this.extractCkvLookupTable(dataLutData, offsetVoiceCkvLookupTable, chunk);

    // Extract and cache DEF entry
    this.extractCalDefinitionEntry(
      dataDefData,
      offsetVoiceCalDefinitionTable,
      chunk,
    );

    // Create and cache DOT entry
    const dotEntry: VoiceCalDataOffsetEntry = {offsetsInGlobalDataPool};
    chunk.setCalDataOffsetEntryAt(offsetVoiceCalDefinitionTable, dotEntry); // Use DEF offset as key

    const entry: VoiceCalDataObject = {
      offsetVoiceCkvLookupTable,
      offsetVoiceCalDefinitionTable,
      numModuleInstanceParamPairs,
      offsetsInGlobalDataPool,
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Parse a single voice CKV data table
   *
   * Format:
   * VocCKVDataTbl = VocCKVDataTblSize OffsetVocCalKeyTbl DOTTblSize NumCalDataObj CalDataObj+
   */
  private parseVoiceCkvDataTable(
    view: DataView,
    offset: number,
    chunk: VoiceCalibrationChunk,
    keyTableData: Uint8Array,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
  ): {entry: VoiceCkvDataTable; newOffset: number} {
    // Read header
    const voiceCkvDataTableSize = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    const offsetVoiceCalKeyTable = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    const dataOffsetTableSize = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    const numCalDataObjects = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Extract and cache calibration key table
    this.extractCalKeyTable(keyTableData, offsetVoiceCalKeyTable, chunk);

    // Parse each calibration data object
    const calDataObjects: VoiceCalDataObject[] = [];
    for (let i = 0; i < numCalDataObjects; i++) {
      const result = this.parseCalDataObject(
        view,
        currentOffset,
        chunk,
        dataLutData,
        dataDefData,
      );
      calDataObjects.push(result.entry);
      currentOffset = result.newOffset;
    }

    const entry: VoiceCkvDataTable = {
      voiceCkvDataTableSize,
      offsetVoiceCalKeyTable,
      dataOffsetTableSize,
      calDataObjects,
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Parse a single subgraph calibration table
   *
   * Format:
   * SGCalTbl = SGID SGCalTblSize MajorVers MinorVers OffsetVCPMMasterKeyTbl NumCKVDataTbl VocCKVDataTbl+
   */
  private parseSubgraphCalTable(
    view: DataView,
    offset: number,
    chunk: VoiceCalibrationChunk,
    masterKeyData: Uint8Array,
    keyTableData: Uint8Array,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
  ): {entry: VoiceSubgraphCalTable; newOffset: number} {
    // Read header
    const subgraphId = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    const subgraphCalTableSize = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    const majorVersion = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    const minorVersion = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    const offsetVoiceMasterKeyTable = BinaryUtils.readUint32(
      view,
      currentOffset,
    );
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Extract and cache master key table
    this.extractMasterKeyTable(masterKeyData, offsetVoiceMasterKeyTable, chunk);

    // Read number of CKV data tables
    const numCkvDataTables = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Parse each CKV data table
    const voiceCkvDataTables: VoiceCkvDataTable[] = [];
    for (let i = 0; i < numCkvDataTables; i++) {
      const result = this.parseVoiceCkvDataTable(
        view,
        currentOffset,
        chunk,
        keyTableData,
        dataLutData,
        dataDefData,
      );
      voiceCkvDataTables.push(result.entry);
      currentOffset = result.newOffset;
    }

    const entry: VoiceSubgraphCalTable = {
      subgraphId,
      subgraphCalTableSize,
      majorVersion,
      minorVersion,
      offsetVoiceMasterKeyTable,
      voiceCkvDataTables,
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Parse VCPM_CALDATA chunk
   *
   * Format:
   * VCPMCalDataChunk = VCPMInstId VCPMCalTblParamId NumSGIDs SGCalTbl+
   */
  parse(context: ChunkParseContext): VoiceCalibrationChunk {
    const chunk = new VoiceCalibrationChunk();

    // Get the main chunk data
    const chunkData = context.rawChunks?.get(ACDB_RAW_CHUNK_TYPES.VCPM_CALDATA);
    if (!chunkData || chunkData.length === 0) {
      return chunk;
    }

    // Get dependent chunks
    const masterKeyData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.VCPM_MASTER_KEY,
    );
    const keyTableData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_KEY_TABLE,
    );
    const dataLutData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_LUT,
    );
    const dataDefData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_DEF,
    );

    if (!masterKeyData || masterKeyData.length === 0) {
      const errorMsg =
        'VCPM_MASTER_KEY chunk is required for parsing VCPM_CALDATA';
      this.logger?.logError({
        msg: 'parse_voice_calibration_failed',
        description: errorMsg,
        component: 'VoiceCalibrationChunkParser',
        tag: 'calibration-parsing',
        error: new Error(errorMsg),
      });
      throw new Error(errorMsg);
    }

    if (!keyTableData || !dataLutData || !dataDefData) {
      const errorMsg =
        'VCPM_CALIBRATION_KEY_TABLE, VCPM_CALIBRATION_DATA_LUT, and VCPM_CALIBRATION_DATA_DEF chunks are required';
      this.logger?.logError({
        msg: 'parse_voice_calibration_failed',
        description: errorMsg,
        component: 'VoiceCalibrationChunkParser',
        tag: 'calibration-parsing',
        error: new Error(errorMsg),
      });
      throw new Error(errorMsg);
    }

    const view = new DataView(
      chunkData.buffer,
      chunkData.byteOffset,
      chunkData.byteLength,
    );

    let offset = 0;

    // Read Voice module instance ID
    chunk.voiceModuleInstanceId = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Read Voice parameter ID
    chunk.voiceParamId = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Read number of subgraphs
    const numSubgraphIds = BinaryUtils.readUint32(view, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Parse each subgraph calibration table
    for (let i = 0; i < numSubgraphIds; i++) {
      try {
        const result = this.parseSubgraphCalTable(
          view,
          offset,
          chunk,
          masterKeyData,
          keyTableData,
          dataLutData,
          dataDefData,
        );
        chunk.subgraphCalTables.push(result.entry);
        offset = result.newOffset;
      } catch (error) {
        this.logger?.logError({
          msg: 'parse_voice_calibration_entry_failed',
          description: `Failed to parse voice calibration entry ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          component: 'VoiceCalibrationChunkParser',
          tag: 'calibration-parsing',
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    }

    return chunk;
  }
}
