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
  TagDataChunk,
  type TagDataDotEntry,
  type TagDataDefEntry,
  type TagLutDataTable,
  type TagIndexEntry,
} from '../../../shared/acdb-chunks/tag-data-chunk.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Parser for MODULE_TAG_KEY_TABLE chunk.
 * Parses module tag data containing key-value pairs for modules.
 */
export class TagDataChunkParser extends BaseChunkParser<TagDataChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.TAG_DATA;

  constructor(private readonly logger?: Logger) {
    super();
  }

  /**
   * Extract tag data offset entry from MODULE_TAG_DATA_DOT chunk
   *
   * Format:
   * TagDataDOTEntry = NumTaggedDataOffset OffsetTaggedData+
   */
  private extractTagDataDotEntry(
    dataDotData: Uint8Array,
    offset: number,
    chunk: TagDataChunk,
  ): TagDataDotEntry {
    // Check cache first
    const cached = chunk.getTagDataDotEntry(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      dataDotData.buffer,
      dataDotData.byteOffset,
      dataDotData.byteLength,
    );

    // Read number of tagged data offsets
    const numTaggedDataOffsets = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read data offsets
    const taggedDataOffsets: number[] = [];
    for (let i = 0; i < numTaggedDataOffsets; i++) {
      taggedDataOffsets.push(BinaryUtils.readUint32(view, currentOffset));
      currentOffset += BinaryUtils.SIZEOF_UINT32;
    }

    const entry: TagDataDotEntry = {taggedDataOffsets};

    // Cache and return
    chunk.setTagDataDotEntry(offset, entry);
    return entry;
  }

  /**
   * Extract tag data definition entry from MODULE_TAG_DATA_DEF chunk
   *
   * Format:
   * TagDataDEFEntry = NumTaggedIDEntries TaggedIDEntry+
   * TaggedIDEntry = iId pId
   */
  private extractTagDataDefEntry(
    dataDefData: Uint8Array,
    offset: number,
    chunk: TagDataChunk,
  ): TagDataDefEntry {
    // Check cache first
    const cached = chunk.getTagDataDefEntry(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      dataDefData.buffer,
      dataDefData.byteOffset,
      dataDefData.byteLength,
    );

    // Read number of tagged ID entries
    const numTaggedIdEntries = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read [moduleInstanceId, paramId] pairs
    const taggedIdEntries: Array<{
      moduleInstanceId: number;
      paramId: number;
    }> = [];
    for (let i = 0; i < numTaggedIdEntries; i++) {
      const moduleInstanceId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const paramId = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      taggedIdEntries.push({moduleInstanceId, paramId});
    }

    const entry: TagDataDefEntry = {taggedIdEntries};

    // Cache and return
    chunk.setTagDataDefEntry(offset, entry);
    return entry;
  }

  /**
   * Extract tag LUT data table from MODULE_TAG_DATA_LUT chunk
   *
   * Format:
   * TagLutDataTbl = NumTagKeyVals NumTagKeyVectorEntries TagKeyVectorEntry+
   * TagKeyVectorEntry = TagKeyVal+ OffsetTagDataDEF OffsetTagDataDOT
   */
  private extractTagLutDataTable(
    dataLutData: Uint8Array,
    offset: number,
    chunk: TagDataChunk,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): TagLutDataTable {
    // Check cache first
    const cached = chunk.getTagLutDataTable(offset);
    if (cached) {
      return cached;
    }

    const view = new DataView(
      dataLutData.buffer,
      dataLutData.byteOffset,
      dataLutData.byteLength,
    );

    // Read header
    const numTagKeyValues = BinaryUtils.readUint32(view, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    const numTagKeyVectorEntries = BinaryUtils.readUint32(view, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read tag key vector entries
    const tagKeyVectorEntries = [];
    for (let i = 0; i < numTagKeyVectorEntries; i++) {
      // Read tag key values
      const tagKeyValues: number[] = [];
      for (let j = 0; j < numTagKeyValues; j++) {
        tagKeyValues.push(BinaryUtils.readUint32(view, currentOffset));
        currentOffset += BinaryUtils.SIZEOF_UINT32;
      }

      // Read offsets
      const offsetTagDataDEF = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      const offsetTagDataDOT = BinaryUtils.readUint32(view, currentOffset);
      currentOffset += BinaryUtils.SIZEOF_UINT32;

      // Extract and cache DEF and DOT entries
      this.extractTagDataDefEntry(dataDefData, offsetTagDataDEF, chunk);
      this.extractTagDataDotEntry(dataDotData, offsetTagDataDOT, chunk);

      tagKeyVectorEntries.push({
        tagKeyValues,
        offsetTagDataDEF,
        offsetTagDataDOT,
      });
    }

    const table: TagLutDataTable = {
      numTagKeyValues,
      numTagKeyVectorEntries,
      tagKeyVectorEntries,
    };

    // Cache and return
    chunk.setTagLutDataTable(offset, table);
    return table;
  }

  /**
   * Parse a single tag index entry
   *
   * Format:
   * TagIndexEntry = SGId TagId OffsetTagDatTbl
   */
  private parseTagIndexEntry(
    keyTableView: DataView,
    offset: number,
    chunk: TagDataChunk,
    dataLutData: Uint8Array,
    dataDefData: Uint8Array,
    dataDotData: Uint8Array,
  ): {entry: TagIndexEntry; newOffset: number} {
    // Read subgraph ID
    const subgraphId = BinaryUtils.readUint32(keyTableView, offset);
    let currentOffset = offset + BinaryUtils.SIZEOF_UINT32;

    // Read tag ID
    const tagId = BinaryUtils.readUint32(keyTableView, currentOffset);
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Read offset to tag data table
    const offsetTagDataTable = BinaryUtils.readUint32(
      keyTableView,
      currentOffset,
    );
    currentOffset += BinaryUtils.SIZEOF_UINT32;

    // Extract and cache tag LUT data table (which also extracts DEF and DOT entries)
    this.extractTagLutDataTable(
      dataLutData,
      offsetTagDataTable,
      chunk,
      dataDefData,
      dataDotData,
    );

    const entry: TagIndexEntry = {
      subgraphId,
      tagId,
      offsetTagDataTable,
    };

    return {entry, newOffset: currentOffset};
  }

  /**
   * Parse MODULE_TAG_KEY_TABLE chunk
   *
   * Format:
   * TagDataKeyTblChunkPayload = NumTagIndexEntries TagIndexEntry+
   */
  parse(context: ChunkParseContext): TagDataChunk {
    const chunk = new TagDataChunk();

    // Get the main chunk data
    const keyTableData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_KEY_TABLE,
    );
    if (!keyTableData || keyTableData.length === 0) {
      throw new Error('MODULE_TAG_KEY_TABLE chunk is required');
    }

    // Get dependent chunks
    const dataLutData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_LUT,
    );
    const dataDefData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DEF,
    );
    const dataDotData = context.rawChunks?.get(
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DOT,
    );

    if (!dataLutData || !dataDefData || !dataDotData) {
      const errorMsg =
        'MODULE_TAG_DATA_LUT, MODULE_TAG_DATA_DEF, and MODULE_TAG_DATA_DOT chunks are required';
      this.logger?.logError({
        msg: 'parse_tag_data_failed',
        description: errorMsg,
        component: 'TagDataChunkParser',
        tag: 'tag-data-parsing',
        error: new Error(errorMsg),
      });
      throw new Error(errorMsg);
    }

    const keyTableView = new DataView(
      keyTableData.buffer,
      keyTableData.byteOffset,
      keyTableData.byteLength,
    );

    let offset = 0;

    // Read number of tag index entries
    const numTagIndexEntries = BinaryUtils.readUint32(keyTableView, offset);
    offset += BinaryUtils.SIZEOF_UINT32;

    // Parse each tag index entry
    for (let i = 0; i < numTagIndexEntries; i++) {
      try {
        const result = this.parseTagIndexEntry(
          keyTableView,
          offset,
          chunk,
          dataLutData,
          dataDefData,
          dataDotData,
        );
        chunk.tagIndexEntries.push(result.entry);
        offset = result.newOffset;
      } catch (error) {
        this.logger?.logError({
          msg: 'parse_tag_data_entry_failed',
          description: `Failed to parse tag data entry ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          component: 'TagDataChunkParser',
          tag: 'tag-data-parsing',
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    }

    return chunk;
  }
}
