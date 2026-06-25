/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {TagKeysChunk} from '../../../shared/acdb-chunks/tag-keys-chunk.js';
import type {TagKeysDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

export interface TagKeysChunkBuildInput {
  tagKeys: TagKeysDownloadModel[];
  datapool: DatapoolChunk;
}

export interface TagKeysChunkBuildResult {
  chunk: TagKeysChunk;
}

function buildKeyIdsPayload(keyIds: number[]): Uint8Array {
  const payloadSize =
    BinaryUtils.SIZEOF_UINT32 + keyIds.length * BinaryUtils.SIZEOF_UINT32;
  const payload = new Uint8Array(payloadSize);
  const pv = new DataView(payload.buffer);
  BinaryUtils.writeUint32(pv, 0, keyIds.length);
  let ppos = BinaryUtils.SIZEOF_UINT32;
  for (const keyId of keyIds) {
    BinaryUtils.writeUint32(pv, ppos, keyId);
    ppos += BinaryUtils.SIZEOF_UINT32;
  }
  return payload;
}

/**
 * Builds the MTKL (MOD_TAG_KEYIDS_TABLE) chunk.
 *
 * Format:
 *   numEntries: uint32
 *   Entry[tagId ASC]:
 *     tagId:       uint32
 *     poolOffset:  uint32  ← offset into shared POOL chunk
 *
 * Datapool entry at poolOffset:
 *   numKeys: uint32
 *   keyId[]: uint32 * numKeys  ← already sorted ASC from DB query
 */
export const TagKeysChunkBuilder = {
  buildChunk(input: TagKeysChunkBuildInput): TagKeysChunkBuildResult {
    const chunk = new TagKeysChunk();
    const sorted = [...input.tagKeys].sort((a, b) => a.tagId - b.tagId);

    for (const entry of sorted) {
      const payload = buildKeyIdsPayload(entry.keyIds);
      const poolOffset = input.datapool.addOrReuse(payload);
      chunk.addTagKeyEntry(entry.tagId, poolOffset);
    }

    return {chunk};
  },
};
