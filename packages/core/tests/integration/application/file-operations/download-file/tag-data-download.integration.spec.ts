/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AcdbFileSerializer} from '../../../../../src/application/file-operations/download-file/services/acdb-file-serializer.js';
import type {DownloadEntities} from '../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {TagDataChunkParser} from '../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/tag-data-chunk-parser.js';
import {TaggedModuleMapChunkParser} from '../../../../../src/application/file-operations/upload-file/services/acdb-chunk-parsers/tagged-module-map-chunk-parser.js';
import {
  ACDB_RAW_CHUNK_TYPES,
  type AcdbRawChunkType,
} from '../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import {BinaryUtils} from '../../../../../src/shared/utilities/binary-utils.js';

function extractChunk(acdb: Uint8Array, chunkId: string): Uint8Array | null {
  const view = new DataView(acdb.buffer, acdb.byteOffset, acdb.byteLength);
  let pos = 12; // skip 12-byte file header
  while (pos < acdb.byteLength) {
    const id = BinaryUtils.uint32ToString(BinaryUtils.readUint32(view, pos));
    const len = BinaryUtils.readUint32(view, pos + 4);
    if (id === chunkId) {
      return acdb.slice(pos + 8, pos + 8 + len);
    }
    pos += 8 + len;
  }
  return null;
}

describe('Tag Data Download Integration', () => {
  it('round-trips tag data (MTKL, MTKT/MTLU/MTDE/MTDO) and tagged module map (TMLU/TMDE)', async () => {
    const payload1 = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const payload2 = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);

    const entities: DownloadEntities = {
      headerMetadata: {
        version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: 'Test',
      },
      tagKeys: [
        {tagId: 0x100, keyIds: [0x10, 0x20]},
        {tagId: 0x200, keyIds: [0x30]},
      ],
      tagData: [
        {
          subgraphId: 1,
          tagId: 0x100,
          numTagKeyValues: 2,
          tkvs: [
            {
              tagKeyValues: [0xa0, 0xb0],
              modules: [
                {
                  moduleInstanceId: 0x300,
                  parameters: [
                    {parameterId: 0x400, payload: payload1},
                    {parameterId: 0x401, payload: payload2},
                  ],
                },
              ],
            },
          ],
        },
      ],
      taggedModules: [
        {
          subgraphId: 1,
          tagId: 0x100,
          isVoice: false,
          moduleInstances: [
            {moduleId: 0x500, instanceId: 0x600},
            {moduleId: 0x501, instanceId: 0x601},
          ],
        },
        {
          subgraphId: 1,
          tagId: 0x200,
          isVoice: true, // should be excluded from TMLU/TMDE
          moduleInstances: [{moduleId: 0x700, instanceId: 0x800}],
        },
      ],
    };

    const serializer = new AcdbFileSerializer();
    const acdb = await serializer.serialize(entities);

    // ── Verify MTKL is present and has 2 entries ──
    const mtkl = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_KEYIDS_TABLE,
    );
    expect(mtkl).not.toBeNull();
    const mv = new DataView(mtkl!.buffer, mtkl!.byteOffset);
    expect(BinaryUtils.readUint32(mv, 0)).toBe(2); // 2 tag key entries

    // ── Verify MTKT is present and round-trips via TagDataChunkParser ──
    const rawChunks = new Map<AcdbRawChunkType, Uint8Array>();
    for (const id of [
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_KEY_TABLE,
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_LUT,
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DEF,
      ACDB_RAW_CHUNK_TYPES.MODULE_TAG_DATA_DOT,
      ACDB_RAW_CHUNK_TYPES.DATAPOOL,
    ] as AcdbRawChunkType[]) {
      const chunk = extractChunk(acdb, id);
      if (chunk) rawChunks.set(id, chunk);
    }

    const tagDataParser = new TagDataChunkParser();
    const tagDataChunk = tagDataParser.parse({rawChunks});
    expect(tagDataChunk.tagIndexEntries).toHaveLength(1);
    expect(tagDataChunk.tagIndexEntries[0].subgraphId).toBe(1);
    expect(tagDataChunk.tagIndexEntries[0].tagId).toBe(0x100);

    // ── Verify TMLU/TMDE round-trips via TaggedModuleMapChunkParser ──
    const tmluChunk = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT,
    );
    const tmdeChunk = extractChunk(
      acdb,
      ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_DEF,
    );
    expect(tmluChunk).not.toBeNull();
    expect(tmdeChunk).not.toBeNull();

    const tmRawChunks = new Map<AcdbRawChunkType, Uint8Array>([
      [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_LUT, tmluChunk!],
      [ACDB_RAW_CHUNK_TYPES.TAGGED_MODULES_DEF, tmdeChunk!],
    ]);
    const tmParser = new TaggedModuleMapChunkParser();
    const tmChunk = tmParser.parse({rawChunks: tmRawChunks});

    // Only 1 entry — voice entry (tagId 0x200) excluded
    expect(tmChunk.taggedModuleEntries).toHaveLength(1);
    expect(tmChunk.taggedModuleEntries[0].subgraphId).toBe(1);
    expect(tmChunk.taggedModuleEntries[0].tagId).toBe(0x100);

    const defEntry = tmChunk.getTaggedModuleDef(
      tmChunk.taggedModuleEntries[0].offsetTaggedModuleDef,
    );
    expect(defEntry).not.toBeUndefined();
    expect(defEntry!.moduleInstancePairs).toHaveLength(2);
    expect(defEntry!.moduleInstancePairs[0].moduleId).toBe(0x500);
    expect(defEntry!.moduleInstancePairs[0].instanceId).toBe(0x600);
  });
});
