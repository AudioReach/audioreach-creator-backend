/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Calibration Definition Entry
 *
 * Format:
 * CalDEFEntry = NumCalIdEntries CalIdEntry+
 * CalIdEntry = iId pId
 */
export interface CalDefinitionEntry {
  calIdEntries: Array<{moduleInstanceId: number; paramId: number}>;
}

/**
 * Calibration Data Offset Table Entry
 *
 * Format:
 * CalDOTEntry = NumCalDataOffsets CalDataOffset+
 */
export interface CalDataOffsetEntry {
  calDataOffsets: number[];
}

/**
 * Calibration Key-Value LUT Entry
 *
 * Format:
 * CKVLUTEntry = CalKeyVal+ OffsetCalDEF OffsetCalDOT OffsetDOT2
 *
 * Note: OffsetDOT2 is datapool offset of Global persistent IIDs
 */
export interface CkvLookupEntry {
  calKeyValues: number[];
  offsetCalDefinition: number;
  offsetCalDataOffset: number;
  offsetDOT2: number;
}

/**
 * Calibration Key-Value LUT Table
 *
 * Format:
 * CKVLUTTbl = NumCalKeyVals NumCKVLUTEntries CKVLUTEntry+
 */
export interface CkvLookupTable {
  /** Number of calibration key values per entry (needed for parsing variable-length calKeyValues) */
  numCalKeyValues: number;
  ckvLookupEntries: CkvLookupEntry[];
}

/**
 * Calibration Key Table Entry
 *
 * Format:
 * CalKeyTblEntry = OffsetCalKeyTbl OffsetCalLUTTable
 */
export interface CalKeyTableEntry {
  offsetCalKeyTable: number;
  offsetCalLookupTable: number;
}

/**
 * Subgraph LUT Entry
 *
 * Format:
 * SGLUTEntry = SGId NumCalKeyTblEntries CalKeyTblEntry+
 */
export interface SubgraphLookupEntry {
  subgraphId: number;
  calKeyTableEntries: CalKeyTableEntry[];
}

/**
 * Audio Calibration Chunk (CALIBRATION_SUBGRAPH_LUT)
 * Contains calibration data for audio subgraphs.
 *
 * Format:
 * CalSGLUTChunkPayload = NumSGIDs SGLUTEntry+
 * SGLUTEntry = SGId NumCalKeyTblEntries CalKeyTblEntry+
 * CalKeyTblEntry = OffsetCalKeyTbl OffsetCalLUTTable
 *
 * Dependencies:
 * - CALIBRATION_KEY_TABLE: CalKeyTblChunkPayload = CalKeyTbl+
 *                          CalKeyTbl = NumKeyIds KeyId+
 *
 * - CALIBRATION_DATA_LUT: CKVLUTTblChunkPayload = CKVLUTTbl+
 *                         CKVLUTTbl = NumCalKeyVals NumCKVLUTEntries CKVLUTEntry+
 *                         CKVLUTEntry = CalKeyVal+ OffsetCalDEF OffsetCalDOT OffsetDOT2
 *
 * - CALIBRATION_DATA_DEF: CalDEFChunkPayload = CalDEFEntry+
 *                         CalDEFEntry = NumCalIdEntries CalIdEntry+
 *                         CalIdEntry = iId pId
 *
 * - CALIBRATION_DATA_DOT: CalDOTChunkPayload = CalDOTEntry+
 *                         CalDOTEntry = NumCalDataOffsets CalDataOffset+
 */
export class AudioCalibrationChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA;

  /** Array of subgraph LUT entries */
  subgraphLookupEntries: SubgraphLookupEntry[] = [];

  /**
   * Unified storage using Maps for fast O(1) lookup.
   * Works for both upload (parsing) and download (building) directions.
   */
  private calKeyTableCache = new Map<number, number[]>();
  private calKeyTableTotalLength: number = 0;

  private ckvLookupTableCache = new Map<number, CkvLookupTable>();
  private ckvLookupTableTotalLength: number = 0;

  private definitionEntryCache = new Map<number, CalDefinitionEntry>();
  private definitionEntryTotalLength: number = 0;

  private dataOffsetEntryCache = new Map<number, CalDataOffsetEntry>();
  private dataOffsetEntryTotalLength: number = 0;

  /**
   * Reverse lookup maps for deduplication (content hash -> offset).
   * Used during download to find existing entries with same content.
   */
  private calKeyTableHashMap = new Map<string, number>();
  private ckvLookupTableHashMap = new Map<string, number>();
  private definitionEntryHashMap = new Map<string, number>();
  private dataOffsetEntryHashMap = new Map<string, number>();

  // Public accessor methods
  getCalKeyTable(offset: number): number[] | undefined {
    return this.calKeyTableCache.get(offset);
  }

  getCkvLookupTable(offset: number): CkvLookupTable | undefined {
    return this.ckvLookupTableCache.get(offset);
  }

  getCalDefinitionEntry(offset: number): CalDefinitionEntry | undefined {
    return this.definitionEntryCache.get(offset);
  }

  getCalDataOffsetEntry(offset: number): CalDataOffsetEntry | undefined {
    return this.dataOffsetEntryCache.get(offset);
  }

  /**
   * Store CalKeyTable at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setCalKeyTableAt(offset: number, keyIds: number[]): void {
    this.calKeyTableCache.set(offset, keyIds);
  }

  /**
   * Add CalKeyTable with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCalKeyTable(keyIds: number[]): number {
    const hash = keyIds.join(',');

    // Check if duplicate exists
    const existingOffset = this.calKeyTableHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    // New entry - calculate size and offset
    const size =
      BinaryUtils.SIZEOF_UINT32 + keyIds.length * BinaryUtils.SIZEOF_UINT32;
    const offset = this.calKeyTableTotalLength;

    this.calKeyTableCache.set(offset, keyIds);
    this.calKeyTableHashMap.set(hash, offset);
    this.calKeyTableTotalLength += size;

    return offset;
  }

  /**
   * Store CkvLookupTable at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setCkvLookupTableAt(offset: number, table: CkvLookupTable): void {
    this.ckvLookupTableCache.set(offset, table);
  }

  /**
   * Add CkvLookupTable with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCkvLookupTable(table: CkvLookupTable): number {
    const hash = this.hashCkvLookupTable(table);

    const existingOffset = this.ckvLookupTableHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    // Calculate size
    let size = BinaryUtils.SIZEOF_UINT32 + BinaryUtils.SIZEOF_UINT32;
    for (const entry of table.ckvLookupEntries) {
      size +=
        entry.calKeyValues.length * BinaryUtils.SIZEOF_UINT32 +
        3 * BinaryUtils.SIZEOF_UINT32;
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
  setCalDefinitionEntryAt(offset: number, entry: CalDefinitionEntry): void {
    this.definitionEntryCache.set(offset, entry);
  }

  /**
   * Add CalDefinitionEntry with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCalDefinitionEntry(entry: CalDefinitionEntry): number {
    const hash = entry.calIdEntries
      .map(e => `${e.moduleInstanceId}:${e.paramId}`)
      .join(',');

    const existingOffset = this.definitionEntryHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      entry.calIdEntries.length * 2 * BinaryUtils.SIZEOF_UINT32;
    const offset = this.definitionEntryTotalLength;

    this.definitionEntryCache.set(offset, entry);
    this.definitionEntryHashMap.set(hash, offset);
    this.definitionEntryTotalLength += size;

    return offset;
  }

  /**
   * Store CalDataOffsetEntry at a specific offset (upload direction).
   * Used when parsing binary data and storing at known offsets.
   */
  setCalDataOffsetEntryAt(offset: number, entry: CalDataOffsetEntry): void {
    this.dataOffsetEntryCache.set(offset, entry);
  }

  /**
   * Add CalDataOffsetEntry with deduplication (download direction).
   * Checks for duplicates and returns existing or new offset.
   */
  addCalDataOffsetEntry(entry: CalDataOffsetEntry): number {
    const hash = entry.calDataOffsets.join(',');

    const existingOffset = this.dataOffsetEntryHashMap.get(hash);
    if (existingOffset !== undefined) {
      return existingOffset;
    }

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      entry.calDataOffsets.length * BinaryUtils.SIZEOF_UINT32;
    const offset = this.dataOffsetEntryTotalLength;

    this.dataOffsetEntryCache.set(offset, entry);
    this.dataOffsetEntryHashMap.set(hash, offset);
    this.dataOffsetEntryTotalLength += size;

    return offset;
  }

  /**
   * Create hash string for CkvLookupTable for deduplication.
   */
  private hashCkvLookupTable(table: CkvLookupTable): string {
    const parts: string[] = [table.numCalKeyValues.toString()];
    for (const entry of table.ckvLookupEntries) {
      parts.push(
        entry.calKeyValues.join(':'),
        entry.offsetCalDefinition.toString(),
        entry.offsetCalDataOffset.toString(),
        entry.offsetDOT2.toString(),
      );
    }
    return parts.join('|');
  }

  // ── Read accessors for serializer (sorted by offset) ────────────────────

  getCalKeyTableEntries(): Array<{offset: number; keyIds: number[]}> {
    return [...this.calKeyTableCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, keyIds]) => ({offset, keyIds}));
  }

  getCkvLookupTableEntries(): Array<{offset: number; table: CkvLookupTable}> {
    return [...this.ckvLookupTableCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, table]) => ({offset, table}));
  }

  getCalDefinitionEntries(): Array<{
    offset: number;
    entry: CalDefinitionEntry;
  }> {
    return [...this.definitionEntryCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, entry]) => ({offset, entry}));
  }

  getCalDataOffsetEntries(): Array<{
    offset: number;
    entry: CalDataOffsetEntry;
  }> {
    return [...this.dataOffsetEntryCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, entry]) => ({offset, entry}));
  }

  /**
   * Get all subgraph IDs that have audio calibration data
   */
  getAllSubgraphIds(): number[] {
    return this.subgraphLookupEntries.map(entry => entry.subgraphId);
  }

  /**
   * Get the total number of subgraphs with audio calibration data
   */
  getSubgraphCount(): number {
    return this.subgraphLookupEntries.length;
  }
}
