/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {TagKeysChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/tag-keys-chunk-builder.js';
import {TagKeysChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/tag-keys-chunk-serializer.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';

function build(
  tagKeys: Parameters<typeof TagKeysChunkBuilder.buildChunk>[0]['tagKeys'],
  datapool: DatapoolChunk,
): Uint8Array {
  const chunk = TagKeysChunkBuilder.buildChunk({tagKeys, datapool}).chunk;
  return new TagKeysChunkSerializer().serialize(chunk);
}

describe('TagKeysChunkBuilder', () => {
  it('returns empty table for empty input', () => {
    const datapool = new DatapoolChunk();
    const result = build([], datapool);
    // 4 bytes for numEntries = 0
    expect(result.byteLength).toBe(4);
    const view = new DataView(result.buffer);
    expect(BinaryUtils.readUint32(view, 0)).toBe(0);
  });

  it('writes tagId and datapool offset for a single tag', () => {
    const datapool = new DatapoolChunk();
    const input = [{tagId: 0x1000, keyIds: [0x100, 0x200]}];
    const result = build(input, datapool);

    // table: numEntries(4) + [tagId(4) + poolOffset(4)] = 12 bytes
    expect(result.byteLength).toBe(12);
    const view = new DataView(result.buffer);
    expect(BinaryUtils.readUint32(view, 0)).toBe(1); // numEntries
    expect(BinaryUtils.readUint32(view, 4)).toBe(0x1000); // tagId
    const poolOffset = BinaryUtils.readUint32(view, 8);

    // verify datapool payload: numKeys(4) + keyId(4) + keyId(4) = 12 bytes
    const poolPayload = datapool.getDataAtOffset(poolOffset);
    expect(poolPayload).not.toBeNull();
    const pv = new DataView(poolPayload!.buffer, poolPayload!.byteOffset);
    expect(BinaryUtils.readUint32(pv, 0)).toBe(2); // numKeys
    expect(BinaryUtils.readUint32(pv, 4)).toBe(0x100); // keyId[0]
    expect(BinaryUtils.readUint32(pv, 8)).toBe(0x200); // keyId[1]
  });

  it('sorts entries by tagId ASC', () => {
    const datapool = new DatapoolChunk();
    const input = [
      {tagId: 0x2000, keyIds: [0x10]},
      {tagId: 0x1000, keyIds: [0x20]},
    ];
    const result = build(input, datapool);
    const view = new DataView(result.buffer);
    expect(BinaryUtils.readUint32(view, 4)).toBe(0x1000); // first entry tagId
    expect(BinaryUtils.readUint32(view, 12)).toBe(0x2000); // second entry tagId
  });

  it('deduplicates payloads via addOrReuse when keyIds are identical', () => {
    const datapool = new DatapoolChunk();
    const input = [
      {tagId: 0x1000, keyIds: [0x100]},
      {tagId: 0x2000, keyIds: [0x100]},
    ];
    build(input, datapool);
    // Two tags with same keyIds → same datapool offset (addOrReuse)
    expect(datapool.getTotalSize()).toBeLessThan(
      (4 + 4) * 2 + 16, // would be bigger if stored twice
    );
  });
});
