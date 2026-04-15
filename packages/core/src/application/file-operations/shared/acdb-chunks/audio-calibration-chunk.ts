/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';

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
  private calKeyTableCache = new Map<number, number[]>();
  private ckvLookupTableCache = new Map<number, CkvLookupTable>();
  private definitionEntryCache = new Map<number, CalDefinitionEntry>();
  private dataOffsetEntryCache = new Map<number, CalDataOffsetEntry>();

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

  // Internal methods for parser to populate caches
  setCalKeyTable(offset: number, keyIds: number[]): void {
    this.calKeyTableCache.set(offset, keyIds);
  }

  setCkvLookupTable(offset: number, table: CkvLookupTable): void {
    this.ckvLookupTableCache.set(offset, table);
  }

  setCalDefinitionEntry(offset: number, entry: CalDefinitionEntry): void {
    this.definitionEntryCache.set(offset, entry);
  }

  setCalDataOffsetEntry(offset: number, entry: CalDataOffsetEntry): void {
    this.dataOffsetEntryCache.set(offset, entry);
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
