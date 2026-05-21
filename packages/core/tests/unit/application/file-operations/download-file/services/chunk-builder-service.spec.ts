/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {ChunkBuilderService} from '../../../../../../src/application/file-operations/download-file/services/chunk-builder-service.js';
import type {ProjectHeaderMetadata} from '../../../../../../src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../src/application/file-operations/shared/constants/chunk-types.js';

describe('ChunkBuilderService', () => {
  describe('buildHeaderChunk', () => {
    it('should build HeaderChunk from metadata', () => {
      const service = new ChunkBuilderService();
      const metadata: ProjectHeaderMetadata = {
        version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
        codecInfos: [
          {codecId: 1, majorVersion: 2, minorVersion: 0},
          {codecId: 2, majorVersion: 1, minorVersion: 5},
        ],
        modifiedDate: 1234567890,
        oemInfo: 'Qualcomm Technologies, Inc.',
      };

      const chunk = service.buildHeaderChunk(metadata);

      expect(chunk.chunkType).toBe(PARSED_CHUNK_TYPES.HEADER);
      expect(chunk.headerVersion).toBe(1);
      expect(chunk.version).toEqual(metadata.version);
      expect(chunk.codecInfos).toEqual(metadata.codecInfos);
      expect(chunk.modifiedDate).toBe(metadata.modifiedDate);
      expect(chunk.oemInfo).toBe(metadata.oemInfo);
    });

    it('should handle empty codec list', () => {
      const service = new ChunkBuilderService();
      const metadata: ProjectHeaderMetadata = {
        version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: '',
      };

      const chunk = service.buildHeaderChunk(metadata);

      expect(chunk.codecInfos).toEqual([]);
      expect(chunk.oemInfo).toBe('');
    });
  });
});
