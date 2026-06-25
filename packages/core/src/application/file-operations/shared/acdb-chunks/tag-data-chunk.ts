/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Tag index entry from MODULE_TAG_KEY_TABLE chunk.
 * Maps (subgraphId, tagId) to a tag data table offset.
 */
export interface TagIndexEntry {
  subgraphId: number;
  tagId: number;
  offsetTagDataTable: number;
}

/**
 * Tag key-value vector entry from MODULE_TAG_DATA_LUT chunk.
 * Contains tag key values and offsets to DEF and DOT entries.
 */
export interface TagKeyVectorEntry {
  tagKeyValues: number[];
  offsetTagDataDEF: number;
  offsetTagDataDOT: number;
}

/**
 * Tag lookup data table from MODULE_TAG_DATA_LUT chunk.
 * Contains multiple tag key-value vector entries.
 */
export interface TagLutDataTable {
  numTagKeyValues: number;
  numTagKeyVectorEntries: number;
  tagKeyVectorEntries: TagKeyVectorEntry[];
}

/**
 * Tagged ID entry from MODULE_TAG_DATA_DEF chunk.
 * Represents a (moduleInstanceId, paramId) pair.
 */
export interface TaggedIdEntry {
  moduleInstanceId: number; // iId
  paramId: number; // pId
}

/**
 * Tag data definition entry from MODULE_TAG_DATA_DEF chunk.
 * Contains multiple tagged ID entries.
 */
export interface TagDataDefEntry {
  taggedIdEntries: TaggedIdEntry[];
}

/**
 * Tag data offset entry from MODULE_TAG_DATA_DOT chunk.
 * Contains offsets to tagged data in the datapool.
 */
export interface TagDataDotEntry {
  taggedDataOffsets: number[];
}

/**
 * Parsed tag data chunk representing MODULE_TAG_KEY_TABLE and related chunks.
 * Uses offset-based caching to avoid redundant parsing of shared sub-structures.
 *
 * Architecture:
 * - MTKT (MODULE_TAG_KEY_TABLE): Entry point with TagIndexEntry array
 * - MTLU (MODULE_TAG_DATA_LUT): Lookup tables referenced by offsets
 * - MTDE (MODULE_TAG_DATA_DEF): Definition entries referenced by offsets
 * - MTDO (MODULE_TAG_DATA_DOT): Data offset entries referenced by offsets
 *
 * Follows the same pattern as AudioCalibrationChunk with offset-based caching.
 */
export class TagDataChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.TAG_DATA;

  /**
   * Array of tag index entries from MTKT chunk.
   * Each entry maps (subgraphId, tagId) to a tag data table offset.
   */
  tagIndexEntries: TagIndexEntry[] = [];

  /**
   * Offset-based cache for tag LUT data tables from MTLU chunk.
   * Key: byte offset in MTLU chunk
   * Value: parsed TagLutDataTable
   */
  private tagLutTableCache = new Map<number, TagLutDataTable>();

  /**
   * Offset-based cache for tag data definition entries from MTDE chunk.
   * Key: byte offset in MTDE chunk
   * Value: parsed TagDataDefEntry
   */
  private tagDefEntryCache = new Map<number, TagDataDefEntry>();

  /**
   * Offset-based cache for tag data offset entries from MTDO chunk.
   * Key: byte offset in MTDO chunk
   * Value: parsed TagDataDotEntry
   */
  private tagDotEntryCache = new Map<number, TagDataDotEntry>();

  /**
   * Get cached tag LUT data table by offset.
   * @param offset Byte offset in MTLU chunk
   * @returns Cached TagLutDataTable or undefined if not cached
   */
  getTagLutDataTable(offset: number): TagLutDataTable | undefined {
    return this.tagLutTableCache.get(offset);
  }

  /**
   * Get cached tag data definition entry by offset.
   * @param offset Byte offset in MTDE chunk
   * @returns Cached TagDataDefEntry or undefined if not cached
   */
  getTagDataDefEntry(offset: number): TagDataDefEntry | undefined {
    return this.tagDefEntryCache.get(offset);
  }

  /**
   * Get cached tag data offset entry by offset.
   * @param offset Byte offset in MTDO chunk
   * @returns Cached TagDataDotEntry or undefined if not cached
   */
  getTagDataDotEntry(offset: number): TagDataDotEntry | undefined {
    return this.tagDotEntryCache.get(offset);
  }

  /**
   * Cache a tag LUT data table by offset.
   * @param offset Byte offset in MTLU chunk
   * @param table TagLutDataTable to cache
   */
  setTagLutDataTable(offset: number, table: TagLutDataTable): void {
    this.tagLutTableCache.set(offset, table);
  }

  /**
   * Cache a tag data definition entry by offset.
   * @param offset Byte offset in MTDE chunk
   * @param entry TagDataDefEntry to cache
   */
  setTagDataDefEntry(offset: number, entry: TagDataDefEntry): void {
    this.tagDefEntryCache.set(offset, entry);
  }

  /**
   * Cache a tag data offset entry by offset.
   * @param offset Byte offset in MTDO chunk
   * @param entry TagDataDotEntry to cache
   */
  setTagDataDotEntry(offset: number, entry: TagDataDotEntry): void {
    this.tagDotEntryCache.set(offset, entry);
  }

  // ─── Download direction ───────────────────────────────────────────────────

  private tagLutTotalLength = 0;
  private tagDefTotalLength = 0;
  private tagDotTotalLength = 0;

  private tagLutHashMap = new Map<string, number>();
  private tagDefHashMap = new Map<string, number>();
  private tagDotHashMap = new Map<string, number>();

  /**
   * Append a tag index entry (download direction).
   */
  addTagIndexEntry(
    subgraphId: number,
    tagId: number,
    mtluOffset: number,
  ): void {
    this.tagIndexEntries.push({
      subgraphId,
      tagId,
      offsetTagDataTable: mtluOffset,
    });
  }

  /**
   * Add a TagLutDataTable with deduplication (download direction).
   * Returns the byte offset in the MTLU buffer.
   */
  addTagLutDataTable(table: TagLutDataTable): number {
    const hash = this.hashTagLutDataTable(table);
    const existing = this.tagLutHashMap.get(hash);
    if (existing !== undefined) return existing;

    const offset = this.tagLutTotalLength;
    this.tagLutTableCache.set(offset, table);
    this.tagLutHashMap.set(hash, offset);

    // header (8) + numVectorEntries * (numTagKeyValues + 2) * 4
    const vectorSize = (table.numTagKeyValues + 2) * BinaryUtils.SIZEOF_UINT32;
    this.tagLutTotalLength +=
      2 * BinaryUtils.SIZEOF_UINT32 + table.numTagKeyVectorEntries * vectorSize;

    return offset;
  }

  /**
   * Add a TagDataDefEntry with deduplication (download direction).
   * Returns the byte offset in the MTDE buffer.
   */
  addTagDataDefEntry(entry: TagDataDefEntry): number {
    const hash = entry.taggedIdEntries
      .map(e => `${e.moduleInstanceId}:${e.paramId}`)
      .join(',');
    const existing = this.tagDefHashMap.get(hash);
    if (existing !== undefined) return existing;

    const offset = this.tagDefTotalLength;
    this.tagDefEntryCache.set(offset, entry);
    this.tagDefHashMap.set(hash, offset);
    this.tagDefTotalLength +=
      BinaryUtils.SIZEOF_UINT32 +
      entry.taggedIdEntries.length * 2 * BinaryUtils.SIZEOF_UINT32;

    return offset;
  }

  /**
   * Add a TagDataDotEntry with deduplication (download direction).
   * Returns the byte offset in the MTDO buffer.
   */
  addTagDataDotEntry(entry: TagDataDotEntry): number {
    const hash = entry.taggedDataOffsets.join(',');
    const existing = this.tagDotHashMap.get(hash);
    if (existing !== undefined) return existing;

    const offset = this.tagDotTotalLength;
    this.tagDotEntryCache.set(offset, entry);
    this.tagDotHashMap.set(hash, offset);
    this.tagDotTotalLength +=
      BinaryUtils.SIZEOF_UINT32 +
      entry.taggedDataOffsets.length * BinaryUtils.SIZEOF_UINT32;

    return offset;
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  getTagLutEntries(): Array<{offset: number; table: TagLutDataTable}> {
    return [...this.tagLutTableCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, table]) => ({offset, table}));
  }

  getTagDefEntries(): Array<{offset: number; entry: TagDataDefEntry}> {
    return [...this.tagDefEntryCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, entry]) => ({offset, entry}));
  }

  getTagDotEntries(): Array<{offset: number; entry: TagDataDotEntry}> {
    return [...this.tagDotEntryCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, entry]) => ({offset, entry}));
  }

  private hashTagLutDataTable(table: TagLutDataTable): string {
    const parts: string[] = [
      table.numTagKeyValues.toString(),
      table.numTagKeyVectorEntries.toString(),
    ];
    for (const ve of table.tagKeyVectorEntries) {
      parts.push(
        ve.tagKeyValues.join(':'),
        ve.offsetTagDataDEF.toString(),
        ve.offsetTagDataDOT.toString(),
      );
    }
    return parts.join('|');
  }
}
