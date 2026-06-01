/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';

/**
 * Represents a parsed driver calibration chunk from ACDB file.
 * Contains driver module calibration data with key-value pairs.
 */
export class DriverCalibrationChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA;

  /**
   * Array of module lookup entries, each containing calibration data for a driver module
   */
  moduleLookupEntries: ModuleLookupEntry[] = [];

  // Cached lookup tables for efficient access
  private calKeyTableCache = new Map<number, number[]>();
  private ckvLookupTableCache = new Map<number, CkvLookupTable>();
  private calDefinitionEntryCache = new Map<number, CalDefinitionEntry>();
  private calDataOffsetEntryCache = new Map<number, CalDataOffsetEntry>();

  /**
   * Get cached calibration key table by offset
   */
  getCalKeyTable(offset: number): number[] | undefined {
    return this.calKeyTableCache.get(offset);
  }

  /**
   * Store calibration key table in cache
   */
  setCalKeyTable(offset: number, keyIds: number[]): void {
    this.calKeyTableCache.set(offset, keyIds);
  }

  /**
   * Get cached CKV lookup table by offset
   */
  getCkvLookupTable(offset: number): CkvLookupTable | undefined {
    return this.ckvLookupTableCache.get(offset);
  }

  /**
   * Store CKV lookup table in cache
   */
  setCkvLookupTable(offset: number, table: CkvLookupTable): void {
    this.ckvLookupTableCache.set(offset, table);
  }

  /**
   * Get cached calibration definition entry by offset
   */
  getCalDefinitionEntry(offset: number): CalDefinitionEntry | undefined {
    return this.calDefinitionEntryCache.get(offset);
  }

  /**
   * Store calibration definition entry in cache
   */
  setCalDefinitionEntry(offset: number, entry: CalDefinitionEntry): void {
    this.calDefinitionEntryCache.set(offset, entry);
  }

  /**
   * Get cached calibration data offset entry by offset
   */
  getCalDataOffsetEntry(offset: number): CalDataOffsetEntry | undefined {
    return this.calDataOffsetEntryCache.get(offset);
  }

  /**
   * Store calibration data offset entry in cache
   */
  setCalDataOffsetEntry(offset: number, entry: CalDataOffsetEntry): void {
    this.calDataOffsetEntryCache.set(offset, entry);
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
