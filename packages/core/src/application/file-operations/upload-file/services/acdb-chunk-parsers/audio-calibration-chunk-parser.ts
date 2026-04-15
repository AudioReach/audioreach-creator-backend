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
  AudioCalibrationChunk,
  type CalDefinitionEntry,
  type CalDataOffsetEntry,
  type CkvLookupEntry,
  type CkvLookupTable,
  type CalKeyTableEntry,
  type SubgraphLookupEntry,
} from '../../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Parser for CALIBRATION_SUBGRAPH_LUT chunk.
 * Parses audio calibration data containing key-data pairs for subgraphs.
 */
export class AudioCalibrationChunkParser extends BaseChunkParser<AudioCalibrationChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA;

  constructor(private readonly logger?: Logger) {
    super();
  }

  /**
   * Extract key table from CALIBRATION_KEY_TABLE chunk
   *
   * Format:
   * CalKeyTbl = NumKeyIds KeyId+
   */
  private extractCalKeyTable(
    keyTableData: Uint8Array,
    offset: number,
    chunk: AudioCalibrationChunk,
  ): number[] {
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
    const numKeyIds = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read key IDs
    const keyIds: number[] = [];
    for (let i = 0; i < numKeyIds; i++) {
      keyIds.push(BinaryUtils.readUint32(view, currentOffset));
      currentOffset += BinaryUtils.SIZEOF_UINT32;
    }

    // Cache and return
    chunk.setCalKeyTable(offset, keyIds);
    return keyIds;
  }

  /**
   * Extract calibration definition entry from CALIBRATION_DATA_DEF chunk
   *
   * Format:
   * CalDEFEntry = NumCalIdEntries CalIdEntry+
   * CalIdEntry = iId pId
   */
  private extractCalDefinitionEntry(
    dataDefData: Uint8Array,
    offset: number,
    chunk: AudioCalibrationChunk,
  ): CalDefinitionEntry {
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

    // Read number of calibration ID entries
    const numCalIdEntries = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read [moduleInstanceId, paramId] pairs
    const calIdEntries: Array<{moduleInstanceId: number; paramId: number}> = [];
    for (let i = 0; i < numCalIdEntries; i++) {
      const moduleInstanceId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const paramId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      calIdEntries.push({moduleInstanceId, paramId});
    }

    const entry: CalDefinitionEntry = {calIdEntries};

    // Cache and return
    chunk.setCalDefinitionEntry(offset, entry);
    return entry;
  }

  /**
   * Extract calibration data offset table entry from CALIBRATION_DATA_DOT chunk
   *
   * Format:
   * CalDOTEntry = NumCalDataOffsets CalDataOffset+
   */
  private extractCalDataOffsetEntry(
    dataDotData: Uint8Array,
    offset: number,
    chunk: AudioCalibrationChunk,
  ): CalDataOffsetEntry {
    // Check cache first
    const cached = chunk.getCalDataOffsetEntry(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      dataDotData.buffer,
      dataDotData.byteOffset,
      dataDotData.byteLength,
    );

    // Read number of calibration data offsets
    const numCalDataOffsets = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read data offsets
    const calDataOffsets: number[] = [];
    for (let i = 0; i < numCalDataOffsets; i++) {
      calDataOffsets.push(BinaryUtils.readUint32(view, currentOffset));
      currentOffset += BinaryUtils.SIZEOF_UINT32;
    }

    const entry: CalDataOffsetEntry = {calDataOffsets};

    // Cache and return
    chunk.setCalDataOffsetEntry(offset, entry);
    return entry;
  }

  /**
   * Extract CKV LUT table from CALIBRATION_DATA_LUT chunk
   *
   * Format:
   * CKVLUTTbl = NumCalKeyVals NumCKVLUTEntries CKVLUTEntry+
   * CKVLUTEntry = CalKeyVal+ OffsetCalDEF OffsetCalDOT OffsetDOT2
   */
  private extractCkvLookupTable(
    dataLutData: Uint8Array,
    offset: number,
    chunk: AudioCalibrationChunk,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): CkvLookupTable {
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
    const numCalKeyValues = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    const numCkvLookupEntries = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read CKV LUT entries
    const ckvLookupEntries: CkvLookupEntry[] = [];
    for (let i = 0; i < numCkvLookupEntries; i++) {
      // Read calibration key values
      const calKeyValues: number[] = [];
      for (let j = 0; j < numCalKeyValues; j++) {
        calKeyValues.push(BinaryUtils.readUint32(view, currentOffset));
        currentOffset += BinaryUtils.SIZEOF_UINT32;
      }

      // Read offsets
      const offsetCalDefinition = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const offsetCalDataOffset = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const offsetDOT2 = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      // Extract and cache DEF and DOT entries
      this.extractCalDefinitionEntry(dataDefData, offsetCalDefinition, chunk);
      this.extractCalDataOffsetEntry(dataDotData, offsetCalDataOffset, chunk);

      ckvLookupEntries.push({
        calKeyValues,
        offsetCalDefinition,
        offsetCalDataOffset,
        offsetDOT2,
      });
    }

    const table: CkvLookupTable = {
      numCalKeyValues,
      ckvLookupEntries,
    };

    // Cache and return
    chunk.setCkvLookupTable(offset, table);
    return table;
  }

  /**
   * Parse a single calibration key table entry
   *
   * Format:
   * CalKeyTblEntry = OffsetCalKeyTbl OffsetCalLUTTable
   */
  private parseCalKeyTableEntry(
    lutView: DataView,
    offset: number,
    chunk: AudioCalibrationChunk,
    keyTableData: Uint8Array,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): {entry: CalKeyTableEntry; newOffset: number} {
    // Read offsets
    const offsetCalKeyTable = BinaryUtils.readUint32(lutView, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    const offsetCalLookupTable = BinaryUtils.readUint32(lutView, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Extract and cache key table
    this.extractCalKeyTable(keyTableData, offsetCalKeyTable, chunk);

    // Extract and cache CKV LUT table (which also extracts DEF and DOT entries)
    this.extractCkvLookupTable(
      dataLutData,
      offsetCalLookupTable,
      chunk,
      dataDefData,
      dataDotData,
    );

    const entry: CalKeyTableEntry = {
      offsetCalKeyTable,
      offsetCalLookupTable,
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Parse a single subgraph LUT entry
   *
   * Format:
   * SGLUTEntry = SGId NumCalKeyTblEntries CalKeyTblEntry+
   */
  private parseSubgraphLookupEntry(
    lutView: DataView,
    offset: number,
    chunk: AudioCalibrationChunk,
    keyTableData: Uint8Array,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): {entry: SubgraphLookupEntry; newOffset: number} {
    // Read subgraph ID
    const subgraphId = BinaryUtils.readUint32(lutView, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read number of calibration key table entries
    const numCalKeyTableEntries = BinaryUtils.readUint32(
      lutView,
      currentOffset,
    );
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Parse each calibration key table entry
    const calKeyTableEntries: CalKeyTableEntry[] = [];
    for (let i = 0; i < numCalKeyTableEntries; i++) {
      const result = this.parseCalKeyTableEntry(
        lutView,
        currentOffset,
        chunk,
        keyTableData,
        dataLutData,
        dataDefData,
        dataDotData,
      );
      calKeyTableEntries.push(result.entry);
      currentOffset = result.newOffset;
    }

    const entry: SubgraphLookupEntry = {
      subgraphId,
      calKeyTableEntries,
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Parse CALIBRATION_SUBGRAPH_LUT chunk
   *
   * Format:
   * CalSGLUTChunkPayload = NumSGIDs SGLUTEntry+
   */
  parse(context: ChunkParseContext): AudioCalibrationChunk {
    const chunk = new AudioCalibrationChunk();

    // Get the main chunk data
    const lutChunkData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT,
    );
    if (!lutChunkData || lutChunkData.length === 0) {
      return chunk;
    }

    // Get dependent chunks
    const keyTableData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE,
    );
    const dataLutData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT,
    );
    const dataDefData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF,
    );
    const dataDotData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT,
    );

    if (!keyTableData || !dataLutData || !dataDefData || !dataDotData) {
      const errorMsg =
        'CALIBRATION_KEY_TABLE, CALIBRATION_DATA_LUT, CALIBRATION_DATA_DEF, and CALIBRATION_DATA_DOT chunks are required';
      this.logger?.logError({
        msg: errorMsg,
        action: 'parse_audio_calibration_failed',
        component: 'AudioCalibrationChunkParser',
        tag: 'calibration-parsing',
        error: new Error(errorMsg),
        timestamp: new Date(),
      });
      throw new Error(errorMsg);
    }

    const lutView = new DataView(
      lutChunkData.buffer,
      lutChunkData.byteOffset,
      lutChunkData.byteLength,
    );

    let offset = 0;

    // Read number of subgraphs
    const numSubgraphIds = BinaryUtils.readUint32(lutView, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Parse each subgraph entry
    for (let i = 0; i < numSubgraphIds; i++) {
      try {
        const result = this.parseSubgraphLookupEntry(
          lutView,
          offset,
          chunk,
          keyTableData,
          dataLutData,
          dataDefData,
          dataDotData,
        );
        chunk.subgraphLookupEntries.push(result.entry);
        offset = result.newOffset;
      } catch (error) {
        this.logger?.logError({
          msg: `Failed to parse audio calibration entry ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'parse_audio_calibration_entry_failed',
          component: 'AudioCalibrationChunkParser',
          tag: 'calibration-parsing',
          error: error as Error,
          timestamp: new Date(),
        });
        throw error;
      }
    }

    return chunk;
  }
}
