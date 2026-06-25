/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

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

  // ─── Download direction ───────────────────────────────────────────────────

  private taggedModuleDefTotalLength = 0;
  private taggedModuleDefHashMap = new Map<string, number>();

  /**
   * Append a tagged module entry (download direction).
   */
  addTaggedModuleEntry(
    subgraphId: number,
    tagId: number,
    tmdeOffset: number,
  ): void {
    this.taggedModuleEntries.push({
      subgraphId,
      tagId,
      offsetTaggedModuleDef: tmdeOffset,
    });
  }

  /**
   * Add a TaggedModuleDefEntry with deduplication (download direction).
   * Returns the byte offset in the TMDE buffer.
   */
  addTaggedModuleDefEntry(entry: TaggedModuleDefEntry): number {
    const hash = entry.moduleInstancePairs
      .map(p => `${p.moduleId}:${p.instanceId}`)
      .join(',');
    const existing = this.taggedModuleDefHashMap.get(hash);
    if (existing !== undefined) return existing;

    const offset = this.taggedModuleDefTotalLength;
    this.taggedModuleDefCache.set(offset, entry);
    this.taggedModuleDefHashMap.set(hash, offset);
    this.taggedModuleDefTotalLength +=
      BinaryUtils.SIZEOF_UINT32 +
      entry.moduleInstancePairs.length * 2 * BinaryUtils.SIZEOF_UINT32;

    return offset;
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  serializeTmluPayload(): Uint8Array {
    const numEntries = this.taggedModuleEntries.length;
    const bytes = new Uint8Array(
      BinaryUtils.SIZEOF_UINT32 + numEntries * 3 * BinaryUtils.SIZEOF_UINT32,
    );
    const view = new DataView(bytes.buffer);
    BinaryUtils.writeUint32(view, 0, numEntries);
    let pos = BinaryUtils.SIZEOF_UINT32;
    for (const entry of this.taggedModuleEntries) {
      BinaryUtils.writeUint32(view, pos, entry.subgraphId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, entry.tagId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, entry.offsetTaggedModuleDef);
      pos += BinaryUtils.SIZEOF_UINT32;
    }
    return bytes;
  }

  serializeTmdePayload(): Uint8Array {
    const sortedOffsets = [...this.taggedModuleDefCache.keys()].sort(
      (a, b) => a - b,
    );
    const parts: Uint8Array[] = [];
    for (const offset of sortedOffsets) {
      const entry = this.taggedModuleDefCache.get(offset)!;
      const bytes = new Uint8Array(
        BinaryUtils.SIZEOF_UINT32 +
          entry.moduleInstancePairs.length * 2 * BinaryUtils.SIZEOF_UINT32,
      );
      const view = new DataView(bytes.buffer);
      BinaryUtils.writeUint32(view, 0, entry.moduleInstancePairs.length);
      let pos = BinaryUtils.SIZEOF_UINT32;
      for (const pair of entry.moduleInstancePairs) {
        BinaryUtils.writeUint32(view, pos, pair.moduleId);
        pos += BinaryUtils.SIZEOF_UINT32;
        BinaryUtils.writeUint32(view, pos, pair.instanceId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
      parts.push(bytes);
    }
    return parts.length > 0
      ? BinaryUtils.concatenate(parts)
      : new Uint8Array(0);
  }
}
