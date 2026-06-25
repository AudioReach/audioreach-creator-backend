/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {TaggedModuleMapChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/tagged-module-map-chunk-builder.js';
import {TaggedModuleMapChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/tagged-module-map-chunk-serializer.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';

function build(
  taggedModules: Parameters<
    typeof TaggedModuleMapChunkBuilder.buildChunk
  >[0]['taggedModules'],
) {
  const chunk = TaggedModuleMapChunkBuilder.buildChunk({taggedModules}).chunk;
  return new TaggedModuleMapChunkSerializer().serialize(chunk);
}

describe('TaggedModuleMapChunkBuilder', () => {
  it('returns empty TMLU and empty TMDE for empty input', () => {
    const result = build([]);
    // TMLU: numEntries(4) = 4 bytes
    expect(result.tmlu.byteLength).toBe(4);
    expect(result.tmde.byteLength).toBe(0);
    const view = new DataView(result.tmlu.buffer);
    expect(BinaryUtils.readUint32(view, 0)).toBe(0);
  });

  it('excludes voice tag entries', () => {
    const input = [
      {
        subgraphId: 1,
        tagId: 10,
        isVoice: true,
        moduleInstances: [{moduleId: 100, instanceId: 200}],
      },
      {
        subgraphId: 1,
        tagId: 20,
        isVoice: false,
        moduleInstances: [{moduleId: 101, instanceId: 201}],
      },
    ];
    const result = build(input);
    const view = new DataView(result.tmlu.buffer);
    expect(BinaryUtils.readUint32(view, 0)).toBe(1); // only 1 entry (non-voice)
    expect(BinaryUtils.readUint32(view, 8)).toBe(20); // tagId of non-voice entry
  });

  it('writes correct TMLU entry pointing into TMDE', () => {
    const input = [
      {
        subgraphId: 5,
        tagId: 10,
        isVoice: false,
        moduleInstances: [
          {moduleId: 0xa0, instanceId: 0xb0},
          {moduleId: 0xa1, instanceId: 0xb1},
        ],
      },
    ];
    const result = build(input);

    // TMLU: numEntries(4) + [sgId(4) + tagId(4) + tmdeOffset(4)] = 16 bytes
    expect(result.tmlu.byteLength).toBe(16);
    const lv = new DataView(result.tmlu.buffer);
    expect(BinaryUtils.readUint32(lv, 0)).toBe(1); // numEntries
    expect(BinaryUtils.readUint32(lv, 4)).toBe(5); // subgraphId
    expect(BinaryUtils.readUint32(lv, 8)).toBe(10); // tagId
    const tmdeOffset = BinaryUtils.readUint32(lv, 12);
    expect(tmdeOffset).toBe(0); // first entry starts at offset 0

    // TMDE at offset 0: numPairs(4) + [mId(4)+iId(4)] * 2 = 20 bytes
    expect(result.tmde.byteLength).toBe(20);
    const dv = new DataView(result.tmde.buffer);
    expect(BinaryUtils.readUint32(dv, 0)).toBe(2); // numPairs
    expect(BinaryUtils.readUint32(dv, 4)).toBe(0xa0); // mId[0]
    expect(BinaryUtils.readUint32(dv, 8)).toBe(0xb0); // iId[0]
    expect(BinaryUtils.readUint32(dv, 12)).toBe(0xa1); // mId[1]
    expect(BinaryUtils.readUint32(dv, 16)).toBe(0xb1); // iId[1]
  });

  it('TMDE offset advances correctly for multiple entries', () => {
    const input = [
      {
        subgraphId: 1,
        tagId: 10,
        isVoice: false,
        moduleInstances: [{moduleId: 1, instanceId: 2}],
      },
      {
        subgraphId: 1,
        tagId: 20,
        isVoice: false,
        moduleInstances: [{moduleId: 3, instanceId: 4}],
      },
    ];
    const result = build(input);
    const lv = new DataView(result.tmlu.buffer);
    const offset0 = BinaryUtils.readUint32(lv, 12); // first entry tmdeOffset
    const offset1 = BinaryUtils.readUint32(lv, 24); // second entry tmdeOffset
    // first TMDE entry: numPairs(4) + 1*[mId(4)+iId(4)] = 12 bytes
    expect(offset0).toBe(0);
    expect(offset1).toBe(12);
  });
});
