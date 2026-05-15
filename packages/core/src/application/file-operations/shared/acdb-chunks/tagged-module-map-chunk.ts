/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';

/**
 * Tagged module entry from TAGGED_MODULES_LUT chunk.
 * Maps (subgraphId, tagId) to a tagged module definition offset.
 */
export interface TaggedModuleEntry {
  subgraphId: number;
  tagId: number;
  offsetTaggedModuleDef: number;
}

/**
 * Module-instance pair from TAGGED_MODULES_DEF chunk.
 * Represents a (moduleId, instanceId) pair.
 */
export interface ModuleInstancePair {
  moduleId: number; // mId (module definition ID)
  instanceId: number; // iId (module instance ID)
}

/**
 * Tagged module definition entry from TAGGED_MODULES_DEF chunk.
 * Contains multiple module-instance pairs.
 */
export interface TaggedModuleDefEntry {
  moduleInstancePairs: ModuleInstancePair[];
}

/**
 * Parsed tagged module map chunk representing TAGGED_MODULES_LUT and TAGGED_MODULES_DEF chunks.
 * Uses offset-based caching to avoid redundant parsing of shared sub-structures.
 *
 * Architecture:
 * - TMLU (TAGGED_MODULES_LUT): Entry point with TaggedModuleEntry array
 * - TMDE (TAGGED_MODULES_DEF): Definition entries referenced by offsets
 *
 * Follows the same pattern as other chunk classes with offset-based caching.
 */
export class TaggedModuleMapChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP;

  /**
   * Array of tagged module entries from TMLU chunk.
   * Each entry maps (subgraphId, tagId) to a tagged module definition offset.
   */
  taggedModuleEntries: TaggedModuleEntry[] = [];

  /**
   * Offset-based cache for tagged module definition entries from TMDE chunk.
   * Key: byte offset in TMDE chunk
   * Value: parsed TaggedModuleDefEntry
   */
  private taggedModuleDefCache = new Map<number, TaggedModuleDefEntry>();

  /**
   * Get cached tagged module definition entry by offset.
   * @param offset Byte offset in TMDE chunk
   * @returns Cached TaggedModuleDefEntry or undefined if not cached
   */
  getTaggedModuleDef(offset: number): TaggedModuleDefEntry | undefined {
    return this.taggedModuleDefCache.get(offset);
  }

  /**
   * Cache a tagged module definition entry by offset.
   * @param offset Byte offset in TMDE chunk
   * @param entry TaggedModuleDefEntry to cache
   */
  setTaggedModuleDef(offset: number, entry: TaggedModuleDefEntry): void {
    this.taggedModuleDefCache.set(offset, entry);
  }
}
