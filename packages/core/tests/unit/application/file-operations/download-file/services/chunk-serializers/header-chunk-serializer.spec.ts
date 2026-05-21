/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {HeaderChunkSerializer} from '../../../../../../../src/application/file-operations/download-file/services/chunk-serializers/header-chunk-serializer.js';
import {HeaderChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/header-chunk.js';
import {BinaryUtils} from '../../../../../../../src/shared/utilities/binary-utils.js';

describe('HeaderChunkSerializer', () => {
  describe('serialize', () => {
    it('should serialize HeaderChunk to binary', () => {
      const chunk = new HeaderChunk();
      chunk.headerVersion = 1;
      chunk.version = {major: 2, minor: 3, revision: 4, cplInfo: 5};
      chunk.codecInfos = [
        {codecId: 1, majorVersion: 2, minorVersion: 0},
        {codecId: 2, majorVersion: 1, minorVersion: 5},
      ];
      chunk.modifiedDate = 1234567890;
      chunk.oemInfo = 'Qualcomm Technologies, Inc.';

      const serializer = new HeaderChunkSerializer();
      const binary = serializer.serialize(chunk);

      expect(binary).toBeInstanceOf(Uint8Array);
      expect(binary.length).toBeGreaterThan(0);

      // Verify header version
      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );
      expect(BinaryUtils.readUint32(view, 0)).toBe(1);
    });

    it('should serialize chunk with empty codec list', () => {
      const chunk = new HeaderChunk();
      chunk.headerVersion = 1;
      chunk.version = {major: 1, minor: 0, revision: 0, cplInfo: 0};
      chunk.codecInfos = [];
      chunk.modifiedDate = 0;
      chunk.oemInfo = '';

      const serializer = new HeaderChunkSerializer();
      const binary = serializer.serialize(chunk);

      expect(binary).toBeInstanceOf(Uint8Array);

      // Verify codec count is 0
      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );
      const codecCount = BinaryUtils.readUint32(view, 8); // After header version (4) + version info (4)
      expect(codecCount).toBe(0);
    });

    it('should calculate correct size for chunk with one codec', () => {
      const chunk = new HeaderChunk();
      chunk.headerVersion = 1;
      chunk.version = {major: 2, minor: 3, revision: 4, cplInfo: 5};
      chunk.codecInfos = [{codecId: 1, majorVersion: 2, minorVersion: 0}];
      chunk.modifiedDate = 1234567890;
      chunk.oemInfo = 'Test';

      const serializer = new HeaderChunkSerializer();
      const binary = serializer.serialize(chunk);

      // Expected size:
      // - headerVersion: 4
      // - version: 4
      // - codec count: 4
      // - 1 codec: 12
      // - modified date: 4
      // - OEM info size: 4
      // - OEM info: 4 ('Test')
      // Total: 36 bytes
      expect(binary.length).toBe(36);
    });

    it('should serialize version info correctly', () => {
      const chunk = new HeaderChunk();
      chunk.headerVersion = 1;
      chunk.version = {major: 2, minor: 3, revision: 4, cplInfo: 5};
      chunk.codecInfos = [];
      chunk.modifiedDate = 0;
      chunk.oemInfo = '';

      const serializer = new HeaderChunkSerializer();
      const binary = serializer.serialize(chunk);

      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );

      // Read version info (after header version at offset 4)
      expect(BinaryUtils.readUint8(view, 4)).toBe(2); // major
      expect(BinaryUtils.readUint8(view, 5)).toBe(3); // minor
      expect(BinaryUtils.readUint8(view, 6)).toBe(4); // revision
      expect(BinaryUtils.readUint8(view, 7)).toBe(5); // cplInfo
    });

    it('should serialize codec info correctly', () => {
      const chunk = new HeaderChunk();
      chunk.headerVersion = 1;
      chunk.version = {major: 1, minor: 0, revision: 0, cplInfo: 0};
      chunk.codecInfos = [{codecId: 123, majorVersion: 4, minorVersion: 5}];
      chunk.modifiedDate = 0;
      chunk.oemInfo = '';

      const serializer = new HeaderChunkSerializer();
      const binary = serializer.serialize(chunk);

      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );

      // Codec info starts at offset 12 (header version 4 + version 4 + codec count 4)
      expect(BinaryUtils.readUint32(view, 12)).toBe(123); // codecId
      expect(BinaryUtils.readUint32(view, 16)).toBe(4); // majorVersion
      expect(BinaryUtils.readUint32(view, 20)).toBe(5); // minorVersion
    });

    it('should serialize OEM info correctly', () => {
      const chunk = new HeaderChunk();
      chunk.headerVersion = 1;
      chunk.version = {major: 1, minor: 0, revision: 0, cplInfo: 0};
      chunk.codecInfos = [];
      chunk.modifiedDate = 0;
      chunk.oemInfo = 'TestOEM';

      const serializer = new HeaderChunkSerializer();
      const binary = serializer.serialize(chunk);

      const view = new DataView(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength,
      );

      // OEM info size is at offset 16 (header 4 + version 4 + codec count 4 + modified date 4)
      const oemInfoSize = BinaryUtils.readUint32(view, 16);
      expect(oemInfoSize).toBe(7); // 'TestOEM' length

      // OEM info data starts at offset 20
      const oemInfoBytes = binary.slice(20, 20 + oemInfoSize);
      const oemInfo = new TextDecoder('ascii').decode(oemInfoBytes);
      expect(oemInfo).toBe('TestOEM');
    });

    it('should handle multi-byte characters in OEM info', () => {
      const chunk = new HeaderChunk();
      chunk.headerVersion = 1;
      chunk.version = {major: 1, minor: 0, revision: 0, cplInfo: 0};
      chunk.codecInfos = [];
      chunk.modifiedDate = 0;
      chunk.oemInfo = 'Test™'; // Contains multi-byte character

      const serializer = new HeaderChunkSerializer();
      const binary = serializer.serialize(chunk);

      // Should not throw and should produce valid binary
      expect(binary).toBeInstanceOf(Uint8Array);
      expect(binary.length).toBeGreaterThan(0);
    });
  });
});
