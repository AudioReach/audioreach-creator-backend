/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AcdbFileSerializer} from '../../../../../../src/application/file-operations/download-file/services/acdb-file-serializer.js';
import type {DownloadEntities} from '../../../../../../src/application/ports/persistence/repositories/bulk-read/bulk-read.repository.js';
import {BinaryUtils} from '../../../../../../src/shared/utilities/binary-utils.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../../../../../src/application/file-operations/shared/constants/chunk-types.js';

describe('AcdbFileSerializer', () => {
  describe('serialize', () => {
    it('should serialize entities to complete ACDB file', () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 2, minor: 3, revision: 4, cplInfo: 5},
          codecInfos: [{codecId: 1, majorVersion: 2, minorVersion: 0}],
          modifiedDate: 1234567890,
          oemInfo: 'Qualcomm Technologies, Inc.',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = serializer.serialize(entities);

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

    it('should include HEADER chunk wrapper', () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: '',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = serializer.serialize(entities);

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

    it('should throw error if serialization fails', () => {
      const entities = {
        headerMetadata: null,
      } as any;

      const serializer = new AcdbFileSerializer();

      expect(() => serializer.serialize(entities)).toThrow(
        'Failed to serialize ACDB file',
      );
    });

    it('should produce correct file structure', () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [],
          modifiedDate: 0,
          oemInfo: 'Test',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = serializer.serialize(entities);

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

      // Total size should be: file header (12) + chunk header (8) + chunk data
      expect(binary.length).toBe(12 + 8 + chunkLength);
    });

    it('should handle complex header metadata', () => {
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
      const binary = serializer.serialize(entities);

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

    it('should produce binary with correct total size', () => {
      const entities: DownloadEntities = {
        headerMetadata: {
          version: {major: 1, minor: 0, revision: 0, cplInfo: 0},
          codecInfos: [{codecId: 1, majorVersion: 1, minorVersion: 0}],
          modifiedDate: 0,
          oemInfo: 'OEM',
        },
      };

      const serializer = new AcdbFileSerializer();
      const binary = serializer.serialize(entities);

      // Calculate expected size:
      // File header: 12 bytes
      // Chunk wrapper: 8 bytes
      // Header chunk data:
      //   - headerVersion: 4
      //   - version: 4
      //   - codec count: 4
      //   - 1 codec: 12
      //   - modified date: 4
      //   - OEM info size: 4
      //   - OEM info: 3 ('OEM')
      // Total: 12 + 8 + 35 = 55 bytes
      expect(binary.length).toBe(55);
    });
  });
});
