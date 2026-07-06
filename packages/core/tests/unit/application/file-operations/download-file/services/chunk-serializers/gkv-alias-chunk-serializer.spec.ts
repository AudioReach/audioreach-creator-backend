/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {GkvAliasChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/gkv-alias-chunk-serializer.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import type {UsecaseDataDownloadModel} from '../../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

function makeUsecase(
  keyIds: number[],
  valueIds: number[],
  aliasId?: number,
  alias?: string,
): UsecaseDataDownloadModel {
  return {
    systemId: 1,
    keyIds,
    valueIds,
    subgraphIds: [],
    subgraphPairs: [],
    aliasId,
    alias,
  };
}

describe('GkvAliasChunkSerializer', () => {
  it('returns empty Uint8Array when no entries have aliasId', () => {
    const datapool = new DatapoolChunk();
    const serializer = new GkvAliasChunkSerializer();
    const result = serializer.serialize(
      [makeUsecase([1], [10])], // no aliasId
      datapool,
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });

  it('serializes a single entry with aliasId only (no name)', () => {
    const datapool = new DatapoolChunk();
    const serializer = new GkvAliasChunkSerializer();
    const result = serializer.serialize(
      [makeUsecase([1, 2], [10, 20], 42)],
      datapool,
    );
    expect(result.length).toBeGreaterThan(0);

    const view = new DataView(
      result.buffer,
      result.byteOffset,
      result.byteLength,
    );
    let pos = 0;
    // numKeyTables
    expect(view.getUint32(pos, true)).toBe(1);
    pos += 4;
    // numKeys for this table
    expect(view.getUint32(pos, true)).toBe(2);
    pos += 4;
    // numGkvs
    expect(view.getUint32(pos, true)).toBe(1);
    pos += 4;
    // keyId[0], keyVal[0]
    expect(view.getUint32(pos, true)).toBe(1);
    pos += 4;
    expect(view.getUint32(pos, true)).toBe(10);
    pos += 4;
    // keyId[1], keyVal[1]
    expect(view.getUint32(pos, true)).toBe(2);
    pos += 4;
    expect(view.getUint32(pos, true)).toBe(20);
    pos += 4;
    // datapoolOffset (some non-negative number)
    const dpOffset = view.getUint32(pos, true);
    expect(dpOffset).toBeGreaterThanOrEqual(0);
  });

  it('serializes a single entry with aliasId and alias name without error', () => {
    const datapool = new DatapoolChunk();
    const serializer = new GkvAliasChunkSerializer();
    const result = serializer.serialize(
      [makeUsecase([1], [5], 99, 'MyUsecase')],
      datapool,
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('groups entries with same numKeys into one table', () => {
    const datapool = new DatapoolChunk();
    const serializer = new GkvAliasChunkSerializer();
    const result = serializer.serialize(
      [makeUsecase([1], [10], 1), makeUsecase([2], [20], 2)],
      datapool,
    );
    const view = new DataView(
      result.buffer,
      result.byteOffset,
      result.byteLength,
    );
    // numKeyTables should be 1 (both have numKeys=1)
    expect(view.getUint32(0, true)).toBe(1);
    // numGkvs should be 2
    expect(view.getUint32(8, true)).toBe(2);
  });

  it('creates separate tables for entries with different numKeys', () => {
    const datapool = new DatapoolChunk();
    const serializer = new GkvAliasChunkSerializer();
    const result = serializer.serialize(
      [
        makeUsecase([1], [10], 1), // numKeys = 1
        makeUsecase([1, 2], [10, 20], 2), // numKeys = 2
      ],
      datapool,
    );
    const view = new DataView(
      result.buffer,
      result.byteOffset,
      result.byteLength,
    );
    // numKeyTables should be 2
    expect(view.getUint32(0, true)).toBe(2);
  });
});
