/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {AwspFileSerializer} from '../../../../../../src/application/file-operations/download-file/services/awsp-file-serializer.js';
import type {DownloadEntities} from '../../../../../../src/application/ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {FileSystemPort} from '../../../../../../src/application/ports/file-system/file-system.port.js';
import {FILE_NAMES} from '../../../../../../src/application/file-operations/shared/constants/definition-block-names.js';

describe('AwspFileSerializer', () => {
  describe('serialize', () => {
    it('should create ZIP with 3 empty JSON files', async () => {
      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            // Verify 3 files are passed
            expect(files.size).toBe(3);
            expect(files.has(FILE_NAMES.DEFINITIONS_JSON)).toBe(true);
            expect(files.has(FILE_NAMES.CONFIGURATION_JSON)).toBe(true);
            expect(files.has(FILE_NAMES.UI_METADATA_JSON)).toBe(true);

            // Verify all files contain empty JSON
            expect(files.get(FILE_NAMES.DEFINITIONS_JSON)).toBe('{}');
            expect(files.get(FILE_NAMES.CONFIGURATION_JSON)).toBe('{}');
            expect(files.get(FILE_NAMES.UI_METADATA_JSON)).toBe('{}');

            // Return mock ZIP buffer
            return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP file signature
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      const result = await serializer.serialize(entities);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(mockFileSystem.zipToBuffer).toHaveBeenCalledTimes(1);
    });

    it('should return valid ZIP buffer', async () => {
      const mockZipBuffer = new Uint8Array([
        0x50,
        0x4b,
        0x03,
        0x04, // ZIP signature
        0x00,
        0x00,
        0x00,
        0x00,
      ]);

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(async () => mockZipBuffer),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      const result = await serializer.serialize(entities);

      expect(result).toBeInstanceOf(Uint8Array);
      // Result is an AWSP binary envelope (starts with 'AWSP' magic)
      expect(result[0]).toBe(0x41); // 'A'
      expect(result[1]).toBe(0x57); // 'W'
      expect(result[2]).toBe(0x53); // 'S'
      expect(result[3]).toBe(0x50); // 'P'
      // The ZIP data is embedded inside the envelope
      expect(result.length).toBeGreaterThan(mockZipBuffer.length);
    });

    it('should throw error if ZIP creation fails', async () => {
      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(async () => {
          throw new Error('ZIP creation failed');
        }),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);

      await expect(serializer.serialize(entities)).rejects.toThrow(
        'Failed to serialize .awsp file',
      );
    });

    it('should pass correct file names to zipToBuffer', async () => {
      let capturedFiles: Map<string, string | Uint8Array> | undefined;

      const mockFileSystem: FileSystemPort = {
        zipToBuffer: jest.fn(
          async (files: Map<string, string | Uint8Array>) => {
            capturedFiles = files;
            return new Uint8Array([0x50, 0x4b]);
          },
        ),
      } as unknown as FileSystemPort;

      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AwspFileSerializer(mockFileSystem);
      await serializer.serialize(entities);

      expect(capturedFiles).toBeDefined();
      expect(Array.from(capturedFiles!.keys())).toEqual([
        'definitions.json',
        'configuration.json',
        'ui-metadata.json',
      ]);
    });
  });
});
