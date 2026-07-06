/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AcdbFileSerializer} from '../../../../../src/application/file-operations/download-file/services/acdb-file-serializer.js';
import type {DownloadEntities} from '../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

function containsChunkId(acdbFile: Uint8Array, chunkId: string): boolean {
  const view = new DataView(
    acdbFile.buffer,
    acdbFile.byteOffset,
    acdbFile.byteLength,
  );
  let pos = 12; // skip file header: [4 magic][4 type][4 fileLen]
  while (pos + 8 <= acdbFile.byteLength) {
    const id = String.fromCharCode(
      acdbFile[pos],
      acdbFile[pos + 1],
      acdbFile[pos + 2],
      acdbFile[pos + 3],
    );
    const len = view.getUint32(pos + 4, true);
    if (id === chunkId) return true;
    pos += 8 + len;
  }
  return false;
}

describe('GKV Alias Download Integration', () => {
  it('should emit GALS chunk when usecase data has aliasId', async () => {
    const entities: DownloadEntities = {
      headerMetadata: {
        version: {major: 2, minor: 0, revision: 0, cplInfo: 0},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: '',
      },
      usecaseData: [
        {
          systemId: 1,
          keyIds: [1, 2],
          valueIds: [10, 20],
          subgraphIds: [],
          subgraphPairs: [],
          aliasId: 42,
          alias: 'VoiceCall',
        },
      ],
    };

    const serializer = new AcdbFileSerializer();
    const result = await serializer.serialize(entities);

    expect(containsChunkId(result, 'GALS')).toBe(true);
  });

  it('should NOT emit GALS chunk when no usecase has aliasId', async () => {
    const entities: DownloadEntities = {
      headerMetadata: {
        version: {major: 2, minor: 0, revision: 0, cplInfo: 0},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: '',
      },
      usecaseData: [
        {
          systemId: 1,
          keyIds: [1],
          valueIds: [5],
          subgraphIds: [],
          subgraphPairs: [],
        },
      ],
    };

    const serializer = new AcdbFileSerializer();
    const result = await serializer.serialize(entities);

    expect(containsChunkId(result, 'GALS')).toBe(false);
  });
});
