/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  Metadata,
  BufferSize,
  ProcessorConfig,
  RtcConfiguration,
  AlsaGroup,
  AlsaLibConfiguration,
  ConfigurationData,
  Configuration,
} from '../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/configuration/configuration.js';

describe('Configuration Classes - Nested Object Hydration', () => {
  describe('ProcessorConfig', () => {
    const testData = {
      name: 'ADSP',
      id: 2,
      bufferSize: {
        pidSize: 8192,
        rtcSize: 2097152,
        isEnabled: true,
      },
    };

    it('should create proper class instances for nested objects', () => {
      const instance = ProcessorConfig.fromJSON(testData);

      expect(instance).toBeInstanceOf(ProcessorConfig);
      expect(typeof instance.toJSON).toBe('function');

      expect(instance.bufferSize).toBeInstanceOf(BufferSize);
      expect(typeof instance.bufferSize.toJSON).toBe('function');
    });

    it('should support round-trip serialization', () => {
      const instance = ProcessorConfig.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = ProcessorConfig.fromJSON(serialized);

      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.bufferSize).toBeInstanceOf(BufferSize);
      expect(typeof deserialized.bufferSize.toJSON).toBe('function');
    });
  });

  describe('RtcConfiguration', () => {
    const testData = {
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
        {
          name: 'CDSP',
          id: 3,
          bufferSize: {
            pidSize: 4096,
            rtcSize: 1048576,
            isEnabled: false,
          },
        },
      ],
    };

    it('should create proper class instances for nested objects', () => {
      const instance = RtcConfiguration.fromJSON(testData);

      expect(instance).toBeInstanceOf(RtcConfiguration);
      expect(typeof instance.toJSON).toBe('function');

      expect(Array.isArray(instance.processors)).toBe(true);
      expect(instance.processors).toHaveLength(2);
      expect(instance.processors[0]).toBeInstanceOf(ProcessorConfig);
      expect(typeof instance.processors[0].toJSON).toBe('function');
      expect(instance.processors[0].bufferSize).toBeInstanceOf(BufferSize);
    });

    it('should support round-trip serialization', () => {
      const instance = RtcConfiguration.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = RtcConfiguration.fromJSON(serialized);

      expect(deserialized.processors[0]).toBeInstanceOf(ProcessorConfig);
      expect(deserialized.processors[0].bufferSize).toBeInstanceOf(BufferSize);
    });
  });

  describe('AlsaLibConfiguration', () => {
    const testData = {
      includeTlvHeader: true,
      fileType: 'Bin',
      groups: [
        {
          id: 1,
          name: 'Group 1',
          propertyIds: [1, 4],
        },
        {
          id: 2,
          name: 'Group 2',
          propertyIds: [2, 5, 8],
        },
      ],
    };

    it('should create proper class instances for nested objects', () => {
      const instance = AlsaLibConfiguration.fromJSON(testData);

      expect(instance).toBeInstanceOf(AlsaLibConfiguration);
      expect(typeof instance.toJSON).toBe('function');

      expect(Array.isArray(instance.groups)).toBe(true);
      expect(instance.groups).toHaveLength(2);
      expect(instance.groups[0]).toBeInstanceOf(AlsaGroup);
      expect(typeof instance.groups[0].toJSON).toBe('function');
    });

    it('should support round-trip serialization', () => {
      const instance = AlsaLibConfiguration.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AlsaLibConfiguration.fromJSON(serialized);

      expect(deserialized.groups[0]).toBeInstanceOf(AlsaGroup);
      expect(typeof deserialized.groups[0].toJSON).toBe('function');
    });
  });

  describe('ConfigurationData', () => {
    const testData = {
      portStrategy: 'INPUT_ODD_OUTPUT_EVEN',
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
    };

    it('should create proper class instances for nested objects', () => {
      const instance = ConfigurationData.fromJSON(testData);

      expect(instance).toBeInstanceOf(ConfigurationData);
      expect(typeof instance.toJSON).toBe('function');

      expect(instance.rtcConfiguration).toBeInstanceOf(RtcConfiguration);
      expect(typeof instance.rtcConfiguration.toJSON).toBe('function');
      expect(instance.rtcConfiguration.processors[0]).toBeInstanceOf(
        ProcessorConfig,
      );

      expect(instance.alsaLibConfiguration).toBeInstanceOf(
        AlsaLibConfiguration,
      );
      expect(typeof instance.alsaLibConfiguration.toJSON).toBe('function');
      expect(instance.alsaLibConfiguration.groups[0]).toBeInstanceOf(AlsaGroup);
    });

    it('should support round-trip serialization', () => {
      const instance = ConfigurationData.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = ConfigurationData.fromJSON(serialized);

      expect(deserialized.rtcConfiguration).toBeInstanceOf(RtcConfiguration);
      expect(deserialized.alsaLibConfiguration).toBeInstanceOf(
        AlsaLibConfiguration,
      );
    });
  });

  describe('Configuration', () => {
    const testData = {
      $version: 1,
      $metadata: {
        lastModified: '2026-02-03T04:06:17Z',
        generator: 'QwspConverter-1.0.0',
      },
      configuration: {
        portStrategy: 'INPUT_ODD_OUTPUT_EVEN',
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

    it('should create proper class instances for nested objects', () => {
      const instance = Configuration.fromJSON(testData);

      expect(instance).toBeInstanceOf(Configuration);
      expect(typeof instance.toJSON).toBe('function');

      expect(instance.metadata).toBeInstanceOf(Metadata);
      expect(typeof instance.metadata.toJSON).toBe('function');

      expect(instance.configuration).toBeInstanceOf(ConfigurationData);
      expect(typeof instance.configuration.toJSON).toBe('function');
      expect(instance.configuration.rtcConfiguration).toBeInstanceOf(
        RtcConfiguration,
      );
      expect(instance.configuration.alsaLibConfiguration).toBeInstanceOf(
        AlsaLibConfiguration,
      );
    });

    it('should support round-trip serialization', () => {
      const instance = Configuration.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = Configuration.fromJSON(serialized);

      expect(deserialized.metadata).toBeInstanceOf(Metadata);
      expect(deserialized.configuration).toBeInstanceOf(ConfigurationData);
      expect(deserialized.configuration.rtcConfiguration).toBeInstanceOf(
        RtcConfiguration,
      );
    });
  });
});
