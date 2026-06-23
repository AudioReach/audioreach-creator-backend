/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {AwspFileOrchestrator} from '../../../../../src/application/file-operations/upload-file/services/awsp-file-orchestrator.js';
import {ConfigurationData} from '../../../../../src/application/file-operations/shared/awsp-serializers/v1/configuration/configuration.js';
import {BinaryUtils} from '../../../../../src/shared/utilities/binary-utils.js';
import type {FileSystemPort} from '../../../../../src/application/ports/file-system/file-system.port.js';
import type {PathRef} from '../../../../../src/application/file-operations/shared/utils/file-ref.js';

/** Build a minimal valid AWSP binary envelope for testing. */
function buildTestAwspEnvelope(zipData: Uint8Array): Uint8Array {
  const header = {
    version: {major: 9, minor: 0},
    acdbFilePath: '',
    eacFilePath: '',
    workspaceFileInfo: {type: 'JSON', isZipped: true, isEncrypted: false},
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const total =
    BinaryUtils.SIZEOF_UINT32 +
    BinaryUtils.SIZEOF_UINT32 +
    headerBytes.byteLength +
    BinaryUtils.SIZEOF_UINT32 +
    zipData.byteLength;
  const result = new Uint8Array(total);
  const view = new DataView(result.buffer);
  let offset = 0;
  result.set(new TextEncoder().encode('AWSP'), offset);
  offset += BinaryUtils.SIZEOF_UINT32;
  BinaryUtils.writeUint32(view, offset, headerBytes.byteLength);
  offset += BinaryUtils.SIZEOF_UINT32;
  result.set(headerBytes, offset);
  offset += headerBytes.byteLength;
  BinaryUtils.writeUint32(view, offset, zipData.byteLength);
  offset += BinaryUtils.SIZEOF_UINT32;
  result.set(zipData, offset);
  return result;
}

describe('AwspFileOrchestrator', () => {
  describe('parseAWSP', () => {
    it('should hydrate configuration to ConfigurationData class instance', async () => {
      // Mock configuration.json content
      const configJson = {
        portStrategy: {strategy: 'INPUT_EVEN_OUTPUT_ODD'},
        defaultProcessorDomain: {id: '0x2'},
        rtc: {
          processors: [],
        },
        alsaLib: {
          includeTlvHeader: false,
          fileType: 'BIN',
          groups: [],
        },
      };

      // Mock definitions.json content
      const definitionsJson = {
        keyDefinitions: [],
        tagDefinitions: [],
      };

      // Build a minimal valid AWSP binary envelope wrapping an empty ZIP
      // (the mock will serve the inner JSON files via readAll on extracted paths)
      const emptyZip = new Uint8Array([
        0x50,
        0x4b,
        0x05,
        0x06, // End-of-central-directory signature
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
      ]);
      const awspEnvelope = buildTestAwspEnvelope(emptyZip);

      // Mock file system
      const mockFs: FileSystemPort = {
        exists: jest.fn().mockResolvedValue(true),
        readAll: jest.fn(),
        unzip: jest.fn().mockResolvedValue(undefined),
        unzipBuffer: jest.fn().mockResolvedValue(undefined),
        joinPath: jest.fn((dir, file) => `${dir}/${file}`),
        dirname: jest.fn(path => path.split('/').slice(0, -1).join('/')),
        basename: jest.fn(path => path.split('/').pop() || ''),
        deleteDirectory: jest.fn(),
        zipToBuffer: jest.fn(),
        parseBlock: jest.fn(),
      };

      (mockFs.readAll as jest.Mock).mockImplementation(async (ref: PathRef) => {
        if (ref.uri.endsWith('.awsp')) {
          return awspEnvelope;
        }
        if (ref.uri.includes('configuration.json')) {
          return new TextEncoder().encode(JSON.stringify(configJson));
        }
        if (ref.uri.includes('definitions.json')) {
          return new TextEncoder().encode(JSON.stringify(definitionsJson));
        }
        return new Uint8Array();
      });

      const orchestrator = new AwspFileOrchestrator(mockFs);
      const result = await orchestrator.parseAWSP({
        kind: 'path',
        name: 'test.awsp',
        uri: '/test/test.awsp',
        mimeType: 'application/octet-stream',
      });

      const config = result.getConfiguration();

      // Verify it's a class instance with methods
      expect(config).toBeInstanceOf(ConfigurationData);
      expect(typeof config.toJSON).toBe('function');

      // Verify data is correct
      expect(config.portStrategy).toBe('INPUT_EVEN_OUTPUT_ODD');
      expect(config.defaultProcessorDomain).toBe(2);

      // Verify unzipBuffer was called (not the old unzip)
      expect(mockFs.unzipBuffer).toHaveBeenCalledTimes(1);
    });
  });
});
