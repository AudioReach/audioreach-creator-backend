/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  ProcessorConfig,
  RtcConfig,
  AlsaGroup,
  AlsaLibConfig,
  ConfigurationData,
  Configuration,
} from '../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/configuration/configuration.js';

describe('Configuration Classes - Nested Object Hydration', () => {
  describe('ProcessorConfig', () => {
    const testData = {
      name: 'ADSP',
      id: 2,
      pidSize: 8192,
      rtcSize: 2097152,
      isEnabled: true,
    };

    it('should create proper class instances', () => {
      const instance = ProcessorConfig.fromJSON(testData);

      expect(instance).toBeInstanceOf(ProcessorConfig);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.pidSize).toBe(8192);
      expect(instance.rtcSize).toBe(2097152);
      expect(instance.isEnabled).toBe(true);
    });

    it('should support round-trip serialization', () => {
      const instance = ProcessorConfig.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = ProcessorConfig.fromJSON(serialized);

      expect(deserialized).toBeInstanceOf(ProcessorConfig);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.id).toBe(instance.id);
    });
  });

  describe('RtcConfig', () => {
    const testData = {
      processors: [
        {name: 'ADSP', id: 2, pidSize: 8192, rtcSize: 2097152, isEnabled: true},
        {
          name: 'CDSP',
          id: 3,
          pidSize: 4096,
          rtcSize: 1048576,
          isEnabled: false,
        },
      ],
    };

    it('should create proper class instances for nested objects', () => {
      const instance = RtcConfig.fromJSON(testData);

      expect(instance).toBeInstanceOf(RtcConfig);
      expect(typeof instance.toJSON).toBe('function');
      expect(Array.isArray(instance.processors)).toBe(true);
      expect(instance.processors).toHaveLength(2);
      expect(instance.processors[0]).toBeInstanceOf(ProcessorConfig);
    });

    it('should support round-trip serialization', () => {
      const instance = RtcConfig.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = RtcConfig.fromJSON(serialized);

      expect(deserialized.processors[0]).toBeInstanceOf(ProcessorConfig);
    });
  });

  describe('AlsaLibConfig', () => {
    const testData = {
      includeTlvHeader: true,
      fileType: 'BIN',
      groups: [
        {id: 1, name: 'Group 1', properties: [{id: 1}, {id: 4}]},
        {id: 2, name: 'Group 2', properties: [{id: 2}, {id: 5}, {id: 8}]},
      ],
    };

    it('should create proper class instances for nested objects', () => {
      const instance = AlsaLibConfig.fromJSON(testData);

      expect(instance).toBeInstanceOf(AlsaLibConfig);
      expect(typeof instance.toJSON).toBe('function');
      expect(Array.isArray(instance.groups)).toBe(true);
      expect(instance.groups).toHaveLength(2);
      expect(instance.groups[0]).toBeInstanceOf(AlsaGroup);
      expect(instance.groups[0].properties).toEqual([{id: 1}, {id: 4}]);
    });

    it('should support round-trip serialization', () => {
      const instance = AlsaLibConfig.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AlsaLibConfig.fromJSON(serialized);

      expect(deserialized.groups[0]).toBeInstanceOf(AlsaGroup);
    });
  });

  describe('ConfigurationData', () => {
    const testData = {
      portStrategy: 'INPUT_EVEN_OUTPUT_ODD',
      defaultProcessorDomain: 2,
      rtc: {
        processors: [
          {
            name: 'ADSP',
            id: 2,
            pidSize: 8192,
            rtcSize: 2097152,
            isEnabled: true,
          },
        ],
      },
      alsaLib: {
        includeTlvHeader: true,
        fileType: 'BIN',
        groups: [{id: 1, name: 'Group 1', properties: [{id: 1}, {id: 4}]}],
      },
    };

    it('should create proper class instances for nested objects', () => {
      const instance = ConfigurationData.fromJSON(testData);

      expect(instance).toBeInstanceOf(ConfigurationData);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.rtc).toBeInstanceOf(RtcConfig);
      expect(instance.rtc.processors[0]).toBeInstanceOf(ProcessorConfig);
      expect(instance.alsaLib).toBeInstanceOf(AlsaLibConfig);
      expect(instance.alsaLib.groups[0]).toBeInstanceOf(AlsaGroup);
    });

    it('should support round-trip serialization', () => {
      const instance = ConfigurationData.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = ConfigurationData.fromJSON(serialized);

      expect(deserialized.rtc).toBeInstanceOf(RtcConfig);
      expect(deserialized.alsaLib).toBeInstanceOf(AlsaLibConfig);
    });
  });

  describe('Configuration', () => {
    const testData = {
      portStrategy: {strategy: 'INPUT_EVEN_OUTPUT_ODD'},
      defaultProcessorDomain: {id: '0x2'},
      rtc: {
        processors: [
          {
            name: 'ADSP',
            id: '0x2',
            pidSize: 8192,
            rtcSize: 2097152,
            isEnabled: true,
          },
        ],
      },
      alsaLib: {
        includeTlvHeader: true,
        fileType: 'BIN',
        groups: [{id: 1, name: 'Group 1', properties: [{id: 1}, {id: 4}]}],
      },
    };

    it('should create proper class instances for nested objects', () => {
      const instance = Configuration.fromJSON(testData);

      expect(instance).toBeInstanceOf(Configuration);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.configuration).toBeInstanceOf(ConfigurationData);
      expect(instance.configuration.rtc).toBeInstanceOf(RtcConfig);
      expect(instance.configuration.alsaLib).toBeInstanceOf(AlsaLibConfig);
    });

    it('should support round-trip serialization via ConfigurationData', () => {
      const instance = Configuration.fromJSON(testData);
      const serialized = instance.toJSON();
      // toJSON() emits normalized shape; ConfigurationData.fromJSON accepts it for round-trip
      const deserialized = ConfigurationData.fromJSON(
        (serialized as {configuration: unknown}).configuration,
      );

      expect(deserialized).toBeInstanceOf(ConfigurationData);
      expect(deserialized.rtc).toBeInstanceOf(RtcConfig);
    });
  });
});
