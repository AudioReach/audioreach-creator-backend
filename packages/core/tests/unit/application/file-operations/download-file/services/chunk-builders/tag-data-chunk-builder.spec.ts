/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {TagDataChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/tag-data-chunk-builder.js';
import {TagDataChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/tag-data-chunk-serializer.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';

type TagDataInput = Parameters<
  typeof TagDataChunkBuilder.buildChunk
>[0]['tagData'];

function build(tagData: TagDataInput, datapool: DatapoolChunk) {
  const chunk = TagDataChunkBuilder.buildChunk({tagData, datapool}).chunk;
  return new TagDataChunkSerializer().serialize(chunk);
}

describe('TagDataChunkBuilder', () => {
  it('returns empty output buffers for empty input', () => {
    const datapool = new DatapoolChunk();
    const result = build([], datapool);
    const mtktView = new DataView(result.mtkt.buffer);
    expect(BinaryUtils.readUint32(mtktView, 0)).toBe(0); // numEntries
    expect(result.mtlu.byteLength).toBe(0);
    expect(result.mtde.byteLength).toBe(0);
    expect(result.mtdo.byteLength).toBe(0);
  });

  it('skips entries that have no TKVs (should not appear in MTKT)', () => {
    const datapool = new DatapoolChunk();
    const input = [
      {
        subgraphId: 1,
        tagId: 0x10,
        numTagKeyValues: 0,
        tkvs: [],
      },
      {
        subgraphId: 1,
        tagId: 0x20,
        numTagKeyValues: 1,
        tkvs: [
          {
            tagKeyValues: [0x30],
            modules: [
              {
                moduleInstanceId: 0x40,
                parameters: [
                  {parameterId: 0x50, payload: new Uint8Array([0x01])},
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = build(input, datapool);

    const ktv = new DataView(result.mtkt.buffer);
    expect(BinaryUtils.readUint32(ktv, 0)).toBe(1); // only 1 MTKT entry
    expect(BinaryUtils.readUint32(ktv, 8)).toBe(0x20); // tagId of the entry with TKVs
  });

  it('builds correct MTKT, MTLU, MTDE, MTDO for one entry with one TKV', () => {
    const datapool = new DatapoolChunk();
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const input = [
      {
        subgraphId: 5,
        tagId: 0x10,
        numTagKeyValues: 1,
        tkvs: [
          {
            tagKeyValues: [0x20],
            modules: [
              {
                moduleInstanceId: 0x30,
                parameters: [{parameterId: 0x40, payload}],
              },
            ],
          },
        ],
      },
    ];

    const result = build(input, datapool);

    // ── MTKT ──
    // numEntries(4) + [sgId(4) + tagId(4) + mtluOffset(4)] = 16 bytes
    expect(result.mtkt.byteLength).toBe(16);
    const ktv = new DataView(result.mtkt.buffer);
    expect(BinaryUtils.readUint32(ktv, 0)).toBe(1); // numEntries
    expect(BinaryUtils.readUint32(ktv, 4)).toBe(5); // subgraphId
    expect(BinaryUtils.readUint32(ktv, 8)).toBe(0x10); // tagId
    const mtluOffset = BinaryUtils.readUint32(ktv, 12);
    expect(mtluOffset).toBe(0); // first entry at offset 0

    // ── MTLU at offset 0 ──
    // numTagKeyValues(4) + numVectorEntries(4) + [value(4) + mtdeOffset(4) + mtdoOffset(4)] = 20 bytes
    expect(result.mtlu.byteLength).toBe(20);
    const lv = new DataView(result.mtlu.buffer);
    expect(BinaryUtils.readUint32(lv, 0)).toBe(1); // numTagKeyValues
    expect(BinaryUtils.readUint32(lv, 4)).toBe(1); // numVectorEntries
    expect(BinaryUtils.readUint32(lv, 8)).toBe(0x20); // tagKeyValue[0]
    const mtdeOffset = BinaryUtils.readUint32(lv, 12);
    const mtdoOffset = BinaryUtils.readUint32(lv, 16);
    expect(mtdeOffset).toBe(0);
    expect(mtdoOffset).toBe(0);

    // ── MTDE at offset 0 ──
    // numPairs(4) + [iId(4) + pId(4)] = 12 bytes
    expect(result.mtde.byteLength).toBe(12);
    const dv = new DataView(result.mtde.buffer);
    expect(BinaryUtils.readUint32(dv, 0)).toBe(1); // numPairs
    expect(BinaryUtils.readUint32(dv, 4)).toBe(0x30); // iId
    expect(BinaryUtils.readUint32(dv, 8)).toBe(0x40); // pId

    // ── MTDO at offset 0 ──
    // numOffsets(4) + [poolOffset(4)] = 8 bytes
    expect(result.mtdo.byteLength).toBe(8);
    const ov = new DataView(result.mtdo.buffer);
    expect(BinaryUtils.readUint32(ov, 0)).toBe(1); // numOffsets
    const poolOffset = BinaryUtils.readUint32(ov, 4);

    // verify payload is in datapool
    const poolPayload = datapool.getDataAtOffset(poolOffset);
    expect(poolPayload).toEqual(payload);
  });

  it('MTLU offset advances per entry in MTKT', () => {
    const datapool = new DatapoolChunk();
    const payload = new Uint8Array([0x01]);
    const input = [
      {
        subgraphId: 1,
        tagId: 10,
        numTagKeyValues: 1,
        tkvs: [
          {
            tagKeyValues: [1],
            modules: [
              {moduleInstanceId: 1, parameters: [{parameterId: 1, payload}]},
            ],
          },
        ],
      },
      {
        subgraphId: 1,
        tagId: 20,
        numTagKeyValues: 1,
        tkvs: [
          {
            tagKeyValues: [2],
            modules: [
              {moduleInstanceId: 2, parameters: [{parameterId: 2, payload}]},
            ],
          },
        ],
      },
    ];
    const result = build(input, datapool);

    const ktv = new DataView(result.mtkt.buffer);
    const offset0 = BinaryUtils.readUint32(ktv, 12); // first MTKT entry mtluOffset
    const offset1 = BinaryUtils.readUint32(ktv, 24); // second MTKT entry mtluOffset
    expect(offset0).toBe(0);
    // First MTLU block: numTagKeyValues(4)+numVectorEntries(4)+[value(4)+mtdeOff(4)+mtdoOff(4)] = 20
    expect(offset1).toBe(20);
  });

  it('consolidates modules sharing a value vector into one MTLU entry', () => {
    const datapool = new DatapoolChunk();
    const input = [
      {
        subgraphId: 1,
        tagId: 10,
        numTagKeyValues: 1,
        tkvs: [
          {
            tagKeyValues: [7],
            modules: [
              {
                moduleInstanceId: 0x30,
                parameters: [
                  {parameterId: 0x40, payload: new Uint8Array([0xaa])},
                ],
              },
            ],
          },
          {
            // same value vector → must merge with the entry above
            tagKeyValues: [7],
            modules: [
              {
                moduleInstanceId: 0x20,
                parameters: [
                  {parameterId: 0x50, payload: new Uint8Array([0xbb])},
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = build(input, datapool);

    // ── MTLU: single consolidated vector entry ──
    const lv = new DataView(result.mtlu.buffer);
    expect(BinaryUtils.readUint32(lv, 0)).toBe(1); // numTagKeyValues
    expect(BinaryUtils.readUint32(lv, 4)).toBe(1); // numVectorEntries (consolidated)
    expect(BinaryUtils.readUint32(lv, 8)).toBe(7); // tagKeyValue[0]

    // ── MTDE: one entry with both pairs, sorted by (iId, pId) ──
    const dv = new DataView(result.mtde.buffer);
    expect(BinaryUtils.readUint32(dv, 0)).toBe(2); // numPairs
    expect(BinaryUtils.readUint32(dv, 4)).toBe(0x20); // iId (sorted first)
    expect(BinaryUtils.readUint32(dv, 8)).toBe(0x50); // pId
    expect(BinaryUtils.readUint32(dv, 12)).toBe(0x30); // iId
    expect(BinaryUtils.readUint32(dv, 16)).toBe(0x40); // pId
  });

  it('reuses MTDE/MTDO offsets for value vectors with identical content', () => {
    const datapool = new DatapoolChunk();
    const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const sharedModule = {
      moduleInstanceId: 0x30,
      parameters: [{parameterId: 0x40, payload}],
    };
    const input = [
      {
        subgraphId: 1,
        tagId: 10,
        numTagKeyValues: 1,
        tkvs: [
          {tagKeyValues: [1], modules: [sharedModule]},
          {tagKeyValues: [2], modules: [sharedModule]}, // identical DEF/DOT content
        ],
      },
    ];

    const result = build(input, datapool);

    const lv = new DataView(result.mtlu.buffer);
    expect(BinaryUtils.readUint32(lv, 4)).toBe(2); // two distinct value vectors

    // vector entry 0: value(8) + mtdeOff(12) + mtdoOff(16)
    const mtde0 = BinaryUtils.readUint32(lv, 12);
    const mtdo0 = BinaryUtils.readUint32(lv, 16);
    // vector entry 1 starts after header(8) + entry0(12) = 20
    const mtde1 = BinaryUtils.readUint32(lv, 24);
    const mtdo1 = BinaryUtils.readUint32(lv, 28);

    expect(mtde1).toBe(mtde0); // DEF offset reused
    expect(mtdo1).toBe(mtdo0); // DOT offset reused

    // Only one physical entry written to each chunk
    expect(result.mtde.byteLength).toBe(12); // numPairs(4)+iId(4)+pId(4)
    expect(result.mtdo.byteLength).toBe(8); // numOffsets(4)+offset(4)
  });

  it('sorts consolidated value vectors ascending', () => {
    const datapool = new DatapoolChunk();
    const mod = (iid: number) => ({
      moduleInstanceId: iid,
      parameters: [{parameterId: 1, payload: new Uint8Array([iid])}],
    });
    const input = [
      {
        subgraphId: 1,
        tagId: 10,
        numTagKeyValues: 1,
        tkvs: [
          {tagKeyValues: [9], modules: [mod(9)]},
          {tagKeyValues: [3], modules: [mod(3)]},
        ],
      },
    ];

    const result = build(input, datapool);

    const lv = new DataView(result.mtlu.buffer);
    expect(BinaryUtils.readUint32(lv, 4)).toBe(2); // numVectorEntries
    expect(BinaryUtils.readUint32(lv, 8)).toBe(3); // first vector value (sorted ASC)
    // second vector starts at header(8)+entry(12)=20, value at +0
    expect(BinaryUtils.readUint32(lv, 20)).toBe(9);
  });
});
