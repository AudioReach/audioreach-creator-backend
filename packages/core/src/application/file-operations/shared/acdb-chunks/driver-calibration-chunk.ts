/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Represents a parsed driver calibration chunk from ACDB file.
 * Contains driver module calibration data with key-value pairs.
 */
export class DriverCalibrationChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA;

  moduleLookupEntries: ModuleLookupEntry[] = [];

  // Caches keyed by byte offset — used by both upload (set*) and download (add*)
  private calKeyTableCache = new Map<number, number[]>();
  private calKeyTableTotalLength = 0;
  private calKeyTableHashMap = new Map<string, number>();

  private ckvLookupTableCache = new Map<number, CkvLookupTable>();
  private ckvLookupTableTotalLength = 0;
  private ckvLookupTableHashMap = new Map<string, number>();

  private calDefinitionEntryCache = new Map<number, CalDefinitionEntry>();
  private calDefinitionEntryTotalLength = 0;
  private calDefinitionEntryHashMap = new Map<string, number>();

  private calDataOffsetEntryCache = new Map<number, CalDataOffsetEntry>();
  private calDataOffsetEntryTotalLength = 0;
  private calDataOffsetEntryHashMap = new Map<string, number>();

  // ── Upload-direction accessors (set by parser at known offsets) ──────────

  getCalKeyTable(offset: number): number[] | undefined {
    return this.calKeyTableCache.get(offset);
  }

  setCalKeyTable(offset: number, keyIds: number[]): void {
    this.calKeyTableCache.set(offset, keyIds);
  }

  getCkvLookupTable(offset: number): CkvLookupTable | undefined {
    return this.ckvLookupTableCache.get(offset);
  }

  setCkvLookupTable(offset: number, table: CkvLookupTable): void {
    this.ckvLookupTableCache.set(offset, table);
  }

  getCalDefinitionEntry(offset: number): CalDefinitionEntry | undefined {
    return this.calDefinitionEntryCache.get(offset);
  }

  setCalDefinitionEntry(offset: number, entry: CalDefinitionEntry): void {
    this.calDefinitionEntryCache.set(offset, entry);
  }

  getCalDataOffsetEntry(offset: number): CalDataOffsetEntry | undefined {
    return this.calDataOffsetEntryCache.get(offset);
  }

  setCalDataOffsetEntry(offset: number, entry: CalDataOffsetEntry): void {
    this.calDataOffsetEntryCache.set(offset, entry);
  }

  // ── Download-direction add*() — assign offsets, deduplicate ─────────────

  addCalKeyTable(keyIds: number[]): number {
    const hash = keyIds.join(',');
    const existing = this.calKeyTableHashMap.get(hash);
    if (existing !== undefined) return existing;

    const offset = this.calKeyTableTotalLength;
    this.calKeyTableCache.set(offset, keyIds);
    this.calKeyTableHashMap.set(hash, offset);
    this.calKeyTableTotalLength +=
      BinaryUtils.SIZEOF_UINT32 + keyIds.length * BinaryUtils.SIZEOF_UINT32;
    return offset;
  }

  addCkvLookupTable(table: CkvLookupTable): number {
    const hash = this.hashCkvLookupTable(table);
    const existing = this.ckvLookupTableHashMap.get(hash);
    if (existing !== undefined) return existing;

    let size = 2 * BinaryUtils.SIZEOF_UINT32; // numCalKeyVals + numEntries
    for (const e of table.ckvLookupEntries) {
      size +=
        e.calKeyValues.length * BinaryUtils.SIZEOF_UINT32 +
        2 * BinaryUtils.SIZEOF_UINT32; // offsetCalDEF + offsetCalDOT
    }

    const offset = this.ckvLookupTableTotalLength;
    this.ckvLookupTableCache.set(offset, table);
    this.ckvLookupTableHashMap.set(hash, offset);
    this.ckvLookupTableTotalLength += size;
    return offset;
  }

  addCalDefinitionEntry(entry: CalDefinitionEntry): number {
    const hash = entry.calIdEntries.map(e => e.paramId).join(',');
    const existing = this.calDefinitionEntryHashMap.get(hash);
    if (existing !== undefined) return existing;

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      entry.calIdEntries.length * BinaryUtils.SIZEOF_UINT32;
    const offset = this.calDefinitionEntryTotalLength;
    this.calDefinitionEntryCache.set(offset, entry);
    this.calDefinitionEntryHashMap.set(hash, offset);
    this.calDefinitionEntryTotalLength += size;
    return offset;
  }

  addCalDataOffsetEntry(entry: CalDataOffsetEntry): number {
    const hash = entry.calDataOffsets.join(',');
    const existing = this.calDataOffsetEntryHashMap.get(hash);
    if (existing !== undefined) return existing;

    const size =
      BinaryUtils.SIZEOF_UINT32 +
      entry.calDataOffsets.length * BinaryUtils.SIZEOF_UINT32;
    const offset = this.calDataOffsetEntryTotalLength;
    this.calDataOffsetEntryCache.set(offset, entry);
    this.calDataOffsetEntryHashMap.set(hash, offset);
    this.calDataOffsetEntryTotalLength += size;
    return offset;
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
    return [...this.calDefinitionEntryCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, entry]) => ({offset, entry}));
  }

  getCalDataOffsetEntries(): Array<{
    offset: number;
    entry: CalDataOffsetEntry;
  }> {
    return [...this.calDataOffsetEntryCache.entries()]
      .sort(([a], [b]) => a - b)
      .map(([offset, entry]) => ({offset, entry}));
  }

  private hashCkvLookupTable(table: CkvLookupTable): string {
    const parts: string[] = [table.numCalKeyValues.toString()];
    for (const e of table.ckvLookupEntries) {
      parts.push(
        e.calKeyValues.join(':'),
        e.offsetCalDefinition.toString(),
        e.offsetCalDataOffset.toString(),
      );
    }
    return parts.join('|');
  }
}

/**
 * Module lookup entry containing calibration data for a driver module
 */
export interface ModuleLookupEntry {
  /** Module definition ID (MId from ABNF) */
  moduleDefinitionId: number;
  /** Array of calibration key table entries */
  calKeyTableEntries: CalKeyTableEntry[];
}

/**
 * Calibration key table entry with offsets to key and lookup tables
 */
export interface CalKeyTableEntry {
  /** Offset to calibration key table */
  offsetCalKeyTable: number;
  /** Offset to calibration lookup table */
  offsetCalLookupTable: number;
}

/**
 * CKV (Calibration Key-Value) lookup table
 */
export interface CkvLookupTable {
  /** Number of calibration key values */
  numCalKeyValues: number;
  /** Array of CKV lookup entries */
  ckvLookupEntries: CkvLookupEntry[];
}

/**
 * CKV lookup entry with key values and offsets
 */
export interface CkvLookupEntry {
  /** Array of calibration key values */
  calKeyValues: number[];
  /** Offset to calibration definition entry */
  offsetCalDefinition: number;
  /** Offset to calibration data offset entry */
  offsetCalDataOffset: number;
}

/**
 * Calibration definition entry containing parameter IDs
 * Format: CalDEFEntry = NumPids pId +
 */
export interface CalDefinitionEntry {
  /** Array of parameter IDs */
  calIdEntries: Array<{
    /** Parameter ID */
    paramId: number;
  }>;
}

/**
 * Calibration data offset entry containing offsets to parameter payloads
 */
export interface CalDataOffsetEntry {
  /** Array of calibration data offsets */
  calDataOffsets: number[];
}
