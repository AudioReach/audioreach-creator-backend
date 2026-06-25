/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import {BaseChunk} from './base-chunk.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Tag key entry from MODULE_TAG_KEYIDS_TABLE chunk.
 * Maps a tagId to a poolOffset in the shared datapool.
 */
export interface TagKeyEntry {
  tagId: number;
  poolOffset: number;
}

/**
 * Parsed tag keys chunk representing MODULE_TAG_KEYIDS_TABLE (MTKL).
 *
 * Format:
 *   numEntries: uint32
 *   Entry[tagId ASC]:
 *     tagId:      uint32
 *     poolOffset: uint32  ← offset into shared POOL chunk
 */
export class TagKeysChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.TAG_KEYS;

  /** Tag key entries sorted ascending by tagId. */
  tagKeyEntries: TagKeyEntry[] = [];

  /**
   * Append a tag key entry (download direction).
   */
  addTagKeyEntry(tagId: number, poolOffset: number): void {
    this.tagKeyEntries.push({tagId, poolOffset});
  }

  /**
   * Serialize to MTKL binary payload.
   */
  serializeMtklPayload(): Uint8Array {
    const numEntries = this.tagKeyEntries.length;
    const bytes = new Uint8Array(
      BinaryUtils.SIZEOF_UINT32 + numEntries * 2 * BinaryUtils.SIZEOF_UINT32,
    );
    const view = new DataView(bytes.buffer);
    BinaryUtils.writeUint32(view, 0, numEntries);
    let pos = BinaryUtils.SIZEOF_UINT32;
    for (const entry of this.tagKeyEntries) {
      BinaryUtils.writeUint32(view, pos, entry.tagId);
      pos += BinaryUtils.SIZEOF_UINT32;
      BinaryUtils.writeUint32(view, pos, entry.poolOffset);
      pos += BinaryUtils.SIZEOF_UINT32;
    }
    return bytes;
  }
}
