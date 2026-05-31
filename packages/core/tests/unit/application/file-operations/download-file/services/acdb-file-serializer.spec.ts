/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {AcdbFileSerializer} from '../../../../../../src/application/file-operations/download-file/services/acdb-file-serializer.js';
import type {DownloadEntities} from '../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {WorkerPoolPort} from '../../../../../../src/application/ports/worker/worker-pool.port.js';
import {BinaryUtils} from '../../../../../../src/shared/utilities/binary-utils.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../../../src/application/file-operations/shared/constants/chunk-types.js';

describe('AcdbFileSerializer', () => {
  describe('serialize', () => {
    it('should serialize entities to complete ACDB file', async () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
          codecInfos: [{codecId: 1, majorVersion: 2, minorVersion: 0}],
          modifiedDate: 1234567890,
          oemInfo: 'Qualcomm Technologies, Inc.',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = await serializer.serialize(entities);

      expect(binary).toBeInstanceOf(Uint8Array);
      expect(binary.length).toBeGreaterThan(12); // At least file header

      // Verify file header
      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );
      const fileId = BinaryUtils.readUint32(view, 0);
      expect(fileId).toBe(BinaryUtils.stringToUint32('ACDB'));

      const fileType = BinaryUtils.readUint32(view, 4);
      expect(fileType).toBe(0); // Placeholder

      const fileLength = BinaryUtils.readUint32(view, 8);
      expect(fileLength).toBe(binary.length - 12); // File length excludes 12-byte file header
    });

    it('should include HEADER chunk wrapper', async () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = await serializer.serialize(entities);

      // Verify HEADER chunk ID at offset 12 (after file header)
      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );
      const chunkId = BinaryUtils.readUint32(view, 12);
      expect(chunkId).toBe(
        BinaryUtils.stringToUint32(ACDB_RAW_CHUNK_TYPES.HEADER),
      );

      // Verify chunk length at offset 16
      const chunkLength = BinaryUtils.readUint32(view, 16);
      expect(chunkLength).toBeGreaterThan(0);
    });

    it('should throw error if serialization fails', async () => {
      const entities = {
        headerMetadata: null,
      } as any;

      const serializer = new AcdbFileSerializer();

      await expect(serializer.serialize(entities)).rejects.toThrow(
        'Failed to serialize ACDB file',
      );
    });

    it('should produce correct file structure', async () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: 'Test',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = await serializer.serialize(entities);

      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );

      // File header (12 bytes)
      expect(BinaryUtils.readUint32(view, 0)).toBe(
        BinaryUtils.stringToUint32('ACDB'),
      ); // File ID
      expect(BinaryUtils.readUint32(view, 4)).toBe(0); // File type
      expect(BinaryUtils.readUint32(view, 8)).toBe(binary.length - 12); // File length excludes 12-byte file header

      // HEADER chunk wrapper (8 bytes)
      expect(BinaryUtils.readUint32(view, 12)).toBe(
        BinaryUtils.stringToUint32('HEAD'),
      ); // Chunk ID
      const chunkLength = BinaryUtils.readUint32(view, 16); // Chunk length
      expect(chunkLength).toBeGreaterThan(0);

      // Total size should be: file header (12) + HEADER chunk (8 + data) + DATAPOOL chunk (8 + 0)
      // The actual size includes both HEADER and DATAPOOL chunks
      expect(binary.length).toBeGreaterThanOrEqual(12 + 8 + chunkLength);
    });

    it('should handle complex header metadata', async () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
          codecInfos: [
            {codecId: 1, majorVersion: 2, minorVersion: 0},
            {codecId: 2, majorVersion: 1, minorVersion: 5},
            {codecId: 3, majorVersion: 3, minorVersion: 1},
          ],
          modifiedDate: 1234567890,
          oemInfo: 'Qualcomm Technologies, Inc.',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = await serializer.serialize(entities);

      // Should not throw and should produce valid binary
      expect(binary).toBeInstanceOf(Uint8Array);
      expect(binary.length).toBeGreaterThan(0);

      // Verify file ID
      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );
      expect(BinaryUtils.readUint32(view, 0)).toBe(
        BinaryUtils.stringToUint32('ACDB'),
      );
    });

    it('should produce binary with correct total size', async () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [{codecId: 1, majorVersion: 1, minorVersion: 0}],
          modifiedDate: 0,
          oemInfo: 'OEM',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = await serializer.serialize(entities);

      // File includes: file header (12) + HEADER chunk (8 + data) + DATAPOOL chunk (8 + 0)
      // The exact size depends on header serialization details
      expect(binary.length).toBeGreaterThan(55);
    });
  });

  describe('Parallelization', () => {
    it('should build usecase chunk using parallel workers when data length > 1', async () => {
      const mockWorkerPool: WorkerPoolPort = {
        isThreadingSupported: jest.fn().mockReturnValue(true),
        executeParallel: jest.fn().mockResolvedValue([
          {
            success: true,
            data: {
              gkvGroups: [],
            },
          },
          {
            success: true,
            data: {
              gkvGroups: [],
            },
          },
        ]),
        executeTask: jest.fn(),
        dispose: jest.fn(),
      };

      const serializer = new AcdbFileSerializer(mockWorkerPool);
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {
            major: 2,
            minor: 3,
            revision: 4,
            cplInfo: 5,
          },
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: 'test',
        },
        usecaseData: [
          {
            systemId: 1,
            keyIds: [1],
            valueIds: [1],
            subgraphIds: [1],
            subgraphPairs: [],
            subgraphs: [
              {
                subgraphId: 1,
                properties: [],
                modules: [],
                dataLinks: [],
                controlLinks: [],
                voiceTags: [],
              },
            ],
          },
          {
            systemId: 2,
            keyIds: [2],
            valueIds: [2],
            subgraphIds: [2],
            subgraphPairs: [],
            subgraphs: [
              {
                subgraphId: 2,
                properties: [],
                modules: [],
                dataLinks: [],
                controlLinks: [],
                voiceTags: [],
              },
            ],
          },
        ],
      };

      const result = await serializer.serialize(entities);

      expect(mockWorkerPool.executeParallel).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            handlerKey: 'BUILD_USECASE_DATA_CHUNK',
            input: expect.objectContaining({
              usecaseData: expect.arrayContaining([entities.usecaseData![0]]),
            }),
          }),
          expect.objectContaining({
            handlerKey: 'BUILD_USECASE_DATA_CHUNK',
            input: expect.objectContaining({
              usecaseData: expect.arrayContaining([entities.usecaseData![1]]),
            }),
          }),
        ]),
      );
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should fall back to sequential when worker pool is undefined', async () => {
      const serializer = new AcdbFileSerializer(undefined);
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {
            major: 2,
            minor: 3,
            revision: 4,
            cplInfo: 5,
          },
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: 'test',
        },
        usecaseData: [
          {
            systemId: 1,
            keyIds: [1],
            valueIds: [1],
            subgraphIds: [1],
            subgraphPairs: [],
            subgraphs: [
              {
                subgraphId: 1,
                properties: [],
                modules: [],
                dataLinks: [],
                controlLinks: [],
                voiceTags: [],
              },
            ],
          },
        ],
      };

      const result = await serializer.serialize(entities);

      expect(result).toBeInstanceOf(Uint8Array);
    });
  });
});
