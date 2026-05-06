/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {AwspFileOrchestrator} from '../../../../../src/application/file-operations/upload-file/services/awsp-file-orchestrator.js';
import {ConfigurationData} from '../../../../../src/application/file-operations/shared/awsp-serializers/v1/configuration/configuration.js';
import type {FileReaderPort} from '../../../../../src/application/ports/file-system/file-reader.port.js';
import type {PathRef} from '../../../../../src/application/file-operations/shared/utils/file-ref.js';

describe('AwspFileOrchestrator', () => {
  describe('parseAWSP', () => {
    it('should hydrate configuration to ConfigurationData class instance', async () => {
      // Mock file system
      const mockFs: FileReaderPort = {
        exists: jest.fn().mockResolvedValue(true),
        readAll: jest.fn(),
        unzip: jest.fn().mockResolvedValue(undefined),
        joinPath: jest.fn((dir, file) => `${dir}/${file}`),
        dirname: jest.fn(path => path.split('/').slice(0, -1).join('/')),
        basename: jest.fn(path => path.split('/').pop() || ''),
        deleteDirectory: jest.fn(),
      };

      // Mock configuration.json content
      const configJson = {
        $version: 1,
        $metadata: {
          lastModified: '2026-05-08T10:00:00Z',
          generator: 'test-generator',
        },
        configuration: {
          portStrategy: 'INPUT_ODD_OUTPUT_EVEN',
          defaultProcessorDomain: 'ADSP',
          rtcConfiguration: {
            processors: [],
          },
          alsaLibConfiguration: {
            includeTlvHeader: false,
            fileType: 'Bin',
            groups: [],
          },
        },
      };

      // Mock definitions.json content
      const definitionsJson = {
        keyDefinitions: [],
        tagDefinitions: [],
      };

      (mockFs.readAll as jest.Mock).mockImplementation(async (ref: PathRef) => {
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
      expect(config.portStrategy).toBe('INPUT_ODD_OUTPUT_EVEN');
      expect(config.defaultProcessorDomain).toBe('ADSP');
    });
  });
});
