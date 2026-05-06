/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  MetadataSchema,
  BufferSizeSchema,
  ProcessorConfigSchema,
  RtcConfigurationSchema,
  AlsaGroupSchema,
  AlsaLibConfigurationSchema,
  ConfigurationDataSchema,
  ConfigurationSchema,
} from '../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/configuration/configuration.schema.js';

describe('Configuration Schemas', () => {
  describe('MetadataSchema', () => {
    it('should parse valid metadata', () => {
      const validData = {
        lastModified: '2026-02-03T04:06:17Z',
        generator: 'QwspConverter-1.0.0',
      };
      const result = MetadataSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should reject invalid metadata', () => {
      const invalidData = {
        lastModified: 123,
        generator: 'QwspConverter-1.0.0',
      };
      expect(() => MetadataSchema.parse(invalidData)).toThrow();
    });
  });

  describe('BufferSizeSchema', () => {
    it('should parse valid buffer size', () => {
      const validData = {
        pidSize: 8192,
        rtcSize: 2097152,
        isEnabled: true,
      };
      const result = BufferSizeSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should reject invalid buffer size', () => {
      const invalidData = {
        pidSize: '8192',
        rtcSize: 2097152,
        isEnabled: true,
      };
      expect(() => BufferSizeSchema.parse(invalidData)).toThrow();
    });
  });

  describe('ConfigurationSchema', () => {
    it('should parse complete valid configuration', () => {
      const validData = {
        $version: 1,
        $metadata: {
          lastModified: '2026-02-03T04:06:17Z',
          generator: 'QwspConverter-1.0.0',
        },
        configuration: {
          portStrategy: 'SEQUENTIAL',
          defaultProcessorDomain: 'ADSP',
          rtcConfiguration: {
            processors: [
              {
                name: 'ADSP',
                id: 2,
                bufferSize: {
                  pidSize: 8192,
                  rtcSize: 2097152,
                  isEnabled: true,
                },
              },
            ],
          },
          alsaLibConfiguration: {
            includeTlvHeader: true,
            fileType: 'Bin',
            groups: [
              {
                id: 1,
                name: 'Group 1',
                propertyIds: [1, 4],
              },
            ],
          },
        },
      };
      const result = ConfigurationSchema.parse(validData);
      expect(result.$version).toBe(1);
      expect(result.$metadata.generator).toBe('QwspConverter-1.0.0');
      expect(result.configuration.portStrategy).toBe('SEQUENTIAL');
    });

    it('should reject configuration with invalid enum values', () => {
      const invalidData = {
        version: 1,
        metadata: {
          lastModified: '2026-02-03T04:06:17Z',
          generator: 'QwspConverter-1.0.0',
        },
        configuration: {
          portStrategy: 'INVALID_STRATEGY',
          defaultProcessorDomain: 'ADSP',
          rtcConfiguration: {processors: []},
          alsaLibConfiguration: {
            includeTlvHeader: true,
            fileType: 'Bin',
            groups: [],
          },
        },
      };
      expect(() => ConfigurationSchema.parse(invalidData)).toThrow();
    });
  });
});
