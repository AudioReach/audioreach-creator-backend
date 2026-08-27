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
  TaggedModuleMapChunk,
  type TaggedModuleDefEntry,
  type TaggedModuleEntry,
} from '../../../shared/acdb-chunks/tagged-module-map-chunk.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Parser for TAGGED_MODULES_LUT chunk.
 * Parses tagged module map containing simple tag-to-module associations.
 */
export class TaggedModuleMapChunkParser extends BaseChunkParser<TaggedModuleMapChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP;

  constructor(private readonly logger?: Logger) {
    super();
  }

  /**
   * Extract tagged module definition entry from TAGGED_MODULES_DEF chunk
   *
   * Format:
   * TaggedModDEFEntry = NumMIDIIDEntries MidIIDPair+
   * MidIidPair = mId iId
   */
  private extractTaggedModuleDef(
    tmdeData: Uint8Array,
    offset: number,
    chunk: TaggedModuleMapChunk,
  ): TaggedModuleDefEntry {
    // Check cache first
    const cached = chunk.getTaggedModuleDef(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      tmdeData.buffer,
      tmdeData.byteOffset,
      tmdeData.byteLength,
    );

    // Read number of module-instance pairs
    const numPairs = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read module-instance pairs
    const moduleInstancePairs: Array<{moduleId: number; instanceId: number}> =
      [];
    for (let i = 0; i < numPairs; i++) {
      const moduleId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const instanceId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      moduleInstancePairs.push({moduleId, instanceId});
    }

    const entry: TaggedModuleDefEntry = {moduleInstancePairs};

    // Cache and return
    chunk.setTaggedModuleDef(offset, entry);
    return entry;
  }

  /**
   * Parse a single tagged module entry
   *
   * Format:
   * TaggedModuleEntry = SGId TagId OffsetTaggedModuleMapDEF
   */
  private parseTaggedModuleEntry(
    tmluView: DataView,
    offset: number,
    chunk: TaggedModuleMapChunk,
    tmdeData: Uint8Array,
  ): {entry: TaggedModuleEntry; newOffset: number} {
    // Read subgraph ID
    const subgraphId = BinaryUtils.readUint32(tmluView, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read tag ID
    const tagId = BinaryUtils.readUint32(tmluView, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read offset to tagged module definition
    const offsetTaggedModuleDef = BinaryUtils.readUint32(
      tmluView,
      currentOffset,
    );
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Extract and cache tagged module definition entry
    this.extractTaggedModuleDef(tmdeData, offsetTaggedModuleDef, chunk);

    const entry: TaggedModuleEntry = {
      subgraphId,
      tagId,
      offsetTaggedModuleDef,
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Parse TAGGED_MODULES_LUT chunk
   *
   * Format:
   * TaggedModuleMapLUTChunkPayload = NumSGTagEntries TaggedModuleEntry+
   */
  parse(context: ChunkParseContext): TaggedModuleMapChunk {
    const chunk = new TaggedModuleMapChunk();

    // Get the main chunk data
    const lutData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT,
    );
    if (!lutData || lutData.length === 0) {
      throw new Error('TAGGED_MODULES_LUT chunk is required');
    }

    // Get dependent chunk
    const defData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_DEF,
    );
    if (!defData) {
      const errorMsg = 'TAGGED_MODULES_DEF chunk is required';
      this.logger?.logError({
        msg: 'parse_tagged_module_map_failed',
        description: errorMsg,
        component: 'TaggedModuleMapChunkParser',
        tag: 'tagged-module-map-parsing',
        error: new Error(errorMsg),
      });
      throw new Error(errorMsg);
    }

    const lutView = new DataView(
      lutData.buffer,
      lutData.byteOffset,
      lutData.byteLength,
    );

    let offset = 0;

    // Read number of tagged module entries
    const numEntries = BinaryUtils.readUint32(lutView, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Parse each tagged module entry
    for (let i = 0; i < numEntries; i++) {
      try {
        const result = this.parseTaggedModuleEntry(
          lutView,
          offset,
          chunk,
          defData,
        );
        chunk.taggedModuleEntries.push(result.entry);
        offset = result.newOffset;
      } catch (error) {
        this.logger?.logError({
          msg: 'parse_tagged_module_entry_failed',
          description: `Failed to parse tagged module entry ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          component: 'TaggedModuleMapChunkParser',
          tag: 'tagged-module-map-parsing',
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    }

    return chunk;
  }
}
