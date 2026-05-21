/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {HeaderChunkBuilder} from '../../../../../../../src/application/file-operations/download-file/services/chunk-builders/header-chunk-builder.js';
import type {ProjectHeaderMetadata} from '../../../../../../../src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';

describe('HeaderChunkBuilder', () => {
  describe('buildChunk', () => {
    it('should build HeaderChunk with all fields', () => {
      const metadata: ProjectHeaderMetadata = {
        version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
        codecInfos: [
          {codecId: 1, majorVersion: 2, minorVersion: 0},
          {codecId: 2, majorVersion: 1, minorVersion: 5},
        ],
        modifiedDate: 1234567890,
        oemInfo: 'Qualcomm Technologies, Inc.',
      };

      const chunk = HeaderChunkBuilder.buildChunk({headerMetadata: metadata});

      expect(chunk.chunkType).toBe(PARSED_CHUNK_TYPES.HEADER);
      expect(chunk.headerVersion).toBe(1);
      expect(chunk.version).toEqual(metadata.version);
      expect(chunk.codecInfos).toHaveLength(2);
      expect(chunk.codecInfos[0]).toEqual({
        codecId: 1,
        majorVersion: 2,
        minorVersion: 0,
      });
      expect(chunk.modifiedDate).toBe(1234567890);
      expect(chunk.oemInfo).toBe('Qualcomm Technologies, Inc.');
    });

    it('should handle empty codec list', () => {
      const metadata: ProjectHeaderMetadata = {
        version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: '',
      };

      const chunk = HeaderChunkBuilder.buildChunk({headerMetadata: metadata});

      expect(chunk.codecInfos).toEqual([]);
      expect(chunk.oemInfo).toBe('');
    });

    it('should throw error if metadata is missing', () => {
      expect(() => {
        HeaderChunkBuilder.buildChunk({headerMetadata: null as any});
      }).toThrow('Header metadata is required');
    });

    it('should throw error if version is missing', () => {
      const metadata = {
        version: null,
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: '',
      } as any;

      expect(() => {
        HeaderChunkBuilder.buildChunk({headerMetadata: metadata});
      }).toThrow('ACDB version information is required');
    });

    it('should use default empty array for undefined codecInfos', () => {
      const metadata = {
        version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
        codecInfos: undefined,
        modifiedDate: 0,
        oemInfo: 'Test',
      } as any;

      const chunk = HeaderChunkBuilder.buildChunk({headerMetadata: metadata});

      expect(chunk.codecInfos).toEqual([]);
    });

    it('should use empty string for undefined oemInfo', () => {
      const metadata = {
        version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
        codecInfos: [],
        modifiedDate: 0,
        oemInfo: undefined,
      } as any;

      const chunk = HeaderChunkBuilder.buildChunk({headerMetadata: metadata});

      expect(chunk.oemInfo).toBe('');
    });
  });
});
