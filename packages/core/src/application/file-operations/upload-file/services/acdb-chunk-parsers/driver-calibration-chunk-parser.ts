/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunkParser} from './base-chunk-parser.js';
import {
  ACDB_RAW_CHUNK_TYPES,
  PARSED_CHUNK_TYPES,
} from '../../../shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {
  DriverCalibrationChunk,
  type ModuleLookupEntry,
  type CkvLookupTable,
  type CalDefinitionEntry,
  type CalDataOffsetEntry,
} from '../../../shared/acdb-chunks/driver-calibration-chunk.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

/**
 * Parser for DRIVER_CALIBRATION_LUT chunk.
 * Parses driver module calibration data containing key-data pairs.
 */
export class DriverCalibrationChunkParser extends BaseChunkParser<DriverCalibrationChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA;

  constructor(private readonly logger?: Logger) {
    super();
  }

  /**
   * Parse DRIVER_CALIBRATION_LUT chunk and related chunks
   */
  parse(context: ChunkParseContext): DriverCalibrationChunk {
    const chunk = new DriverCalibrationChunk();

    // Get the main chunk data
    const lutChunkData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_LUT,
    );

    if (!lutChunkData || lutChunkData.length === 0) {
      return chunk;
    }

    // Get dependent chunks
    const keyTableData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_KEY_TABLE,
    );
    const dataLutData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_TABLE,
    );
    const dataDefData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DEF,
    );
    const dataDotData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.DRIVER_CALIBRATION_DATA_DOT,
    );

    if (!keyTableData || !dataLutData || !dataDefData || !dataDotData) {
      const errorMsg =
        'DRIVER_CALIBRATION_KEY_TABLE, DRIVER_CALIBRATION_DATA_TABLE, DRIVER_CALIBRATION_DATA_DEF, and DRIVER_CALIBRATION_DATA_DOT chunks are not present';
      this.logger?.logWarn({
        msg: errorMsg,
        action: 'parse_driver_calibration_not_found',
        component: 'DriverCalibrationChunkParser',
        tag: 'calibration-parsing',
        error: new Error(errorMsg),
        timestamp: new Date(),
      });
      return chunk; // Return empty chunk if dependencies are missing
    }

    const lutView = new DataView(
      lutChunkData.buffer,
      lutChunkData.byteOffset,
      lutChunkData.byteLength,
    );

    // Read number of modules
    const numModules = BinaryUtils.readUint32(lutView, 0);
    let currentOffset = BinaryUtils.SIZEOF_UINT32;

    // Parse each module lookup entry
    for (let i = 0; i < numModules; i++) {
      try {
        const {entry, newOffset} = this.parseModuleLookupEntry(
          lutView,
          currentOffset,
          chunk,
          keyTableData,
          dataLutData,
          dataDefData,
          dataDotData,
        );

        chunk.moduleLookupEntries.push(entry);
        currentOffset = newOffset;
      } catch (error) {
        this.logger?.logWarn({
          msg: `Failed to parse module lookup entry at offset ${currentOffset}`,
          action: 'parse_module_entry_failed',
          component: 'DriverCalibrationChunkParser',
          tag: 'calibration-parsing',
          error: error as Error,
          timestamp: new Date(),
        });
        // Continue with next entry
      }
    }

    this.logger?.logInfo({
      msg: `Parsed ${chunk.moduleLookupEntries.length} driver calibration module entries`,
      action: 'parse_driver_calibration_success',
      component: 'DriverCalibrationChunkParser',
      tag: 'calibration-parsing',
      timestamp: new Date(),
    });

    return chunk;
  }

  /**
   * Parse a single module lookup entry from DRIVER_CALIBRATION_LUT chunk
   *
   * Format:
   * ModuleLUTEntry = MId OffsetCalKeyTbl OffsetCKVLUTTbl
   */
  private parseModuleLookupEntry(
    lutView: DataView,
    offset: number,
    chunk: DriverCalibrationChunk,
    keyTableData: Uint8Array,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): {entry: ModuleLookupEntry; newOffset: number} {
    let currentOffset = offset;

    // Read module definition ID
    const moduleDefinitionId = BinaryUtils.readUint32(lutView, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read offset to calibration key table
    const offsetCalKeyTable = BinaryUtils.readUint32(lutView, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read offset to CKV lookup table
    const offsetCalLookupTable = BinaryUtils.readUint32(lutView, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Extract key table
    const keyIds = this.extractCalKeyTable(
      keyTableData,
      offsetCalKeyTable,
      chunk,
    );

    // Extract CKV lookup table
    const ckvLutTable = this.extractCkvLookupTable(
      dataLutData,
      offsetCalLookupTable,
      chunk,
      keyIds.length,
    );

    // Process each CKV lookup entry to populate caches
    for (const ckvEntry of ckvLutTable.ckvLookupEntries) {
      // Extract and cache DEF entry
      this.extractCalDefinitionEntry(
        dataDefData,
        ckvEntry.offsetCalDefinition,
        chunk,
      );

      // Extract and cache DOT entry
      this.extractCalDataOffsetEntry(
        dataDotData,
        ckvEntry.offsetCalDataOffset,
        chunk,
      );
    }

    const entry: ModuleLookupEntry = {
      moduleDefinitionId,
      calKeyTableEntries: [
        {
          offsetCalKeyTable,
          offsetCalLookupTable,
        },
      ],
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Extract key table from DRIVER_CALIBRATION_KEY_TABLE chunk
   *
   * Format:
   * CalKeyTbl = NumKeyIds KeyId+
   */
  private extractCalKeyTable(
    keyTableData: Uint8Array,
    offset: number,
    chunk: DriverCalibrationChunk,
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
   * Extract CKV lookup table from DRIVER_CALIBRATION_DATA_TABLE chunk
   *
   * Format:
   * CKVLUTTbl = NumCalKeyVals NumCKVLUTEntries CKVLUTEntry+
   * CKVLUTEntry = CalKeyVal+ OffsetCalDEF OffsetCalDOT OffsetDOT2
   */
  private extractCkvLookupTable(
    dataLutData: Uint8Array,
    offset: number,
    chunk: DriverCalibrationChunk,
    numCalKeyValues: number,
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

    let currentOffset = offset;

    // Read numCalKeyValues (should match parameter)
    const readNumCalKeyValues = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read number of CKV lookup entries
    const numCkvLookupEntries = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read CKV lookup entries
    const ckvLookupEntries: CkvLookupTable['ckvLookupEntries'] = [];
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

      ckvLookupEntries.push({
        calKeyValues,
        offsetCalDefinition,
        offsetCalDataOffset,
      });
    }

    const table: CkvLookupTable = {
      numCalKeyValues: readNumCalKeyValues,
      ckvLookupEntries,
    };

    // Cache and return
    chunk.setCkvLookupTable(offset, table);
    return table;
  }

  /**
   * Extract calibration definition entry from DRIVER_CALIBRATION_DATA_DEF chunk
   *
   * Format:
   * CalDEFEntry = NumPids pId+
   * (Driver calibration DEF entries only contain parameter IDs, no module instance IDs)
   */
  private extractCalDefinitionEntry(
    dataDefData: Uint8Array,
    offset: number,
    chunk: DriverCalibrationChunk,
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

    // Read number of parameter IDs
    const numCalIdEntries = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read parameter IDs only (no moduleInstanceId in driver calibration format)
    const calIdEntries: Array<{paramId: number}> = [];
    for (let i = 0; i < numCalIdEntries; i++) {
      const paramId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      calIdEntries.push({paramId});
    }

    const entry: CalDefinitionEntry = {calIdEntries};

    // Cache and return
    chunk.setCalDefinitionEntry(offset, entry);
    return entry;
  }

  /**
   * Extract calibration data offset table entry from DRIVER_CALIBRATION_DATA_DOT chunk
   *
   * Format:
   * CalDOTEntry = NumCalDataOffsets CalDataOffset+
   */
  private extractCalDataOffsetEntry(
    dataDotData: Uint8Array,
    offset: number,
    chunk: DriverCalibrationChunk,
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
}
