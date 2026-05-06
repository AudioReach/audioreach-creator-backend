/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspControlPortsInfo} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/control-ports-info.js';
import {AwspStaticControlPort} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/static-control-port.js';
import {AwspIntent} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/intent.js';

describe('AwspControlPortsInfo - Nested Object Hydration', () => {
  const testDataWithBothFields = {
    staticPorts: [
      {
        id: 1,
        name: 'StaticPort1',
        supportedIntents: [
          {
            id: 10,
            name: 'Intent1',
            maxports: 2,
          },
          {
            id: 11,
            name: 'Intent2',
            maxports: 4,
          },
        ],
      },
      {
        id: 2,
        name: 'StaticPort2',
        supportedIntents: [
          {
            id: 12,
            name: 'Intent3',
            maxports: 1,
          },
        ],
      },
    ],
    dynamicIntents: [
      {
        id: 20,
        name: 'DynamicIntent1',
        maxports: 8,
      },
      {
        id: 21,
        name: 'DynamicIntent2',
        maxports: 16,
      },
    ],
  };

  describe('fromJSON', () => {
    it('should create proper class instances for nested objects with both fields', () => {
      const instance = AwspControlPortsInfo.fromJSON(testDataWithBothFields);

      // Verify root instance
      expect(instance).toBeInstanceOf(AwspControlPortsInfo);
      expect(typeof instance.toJSON).toBe('function');

      // Verify staticPorts array contains class instances
      expect(Array.isArray(instance.staticPorts)).toBe(true);
      expect(instance.staticPorts).toHaveLength(2);
      expect(instance.staticPorts![0]).toBeInstanceOf(AwspStaticControlPort);
      expect(typeof instance.staticPorts![0].toJSON).toBe('function');
      expect(instance.staticPorts![1]).toBeInstanceOf(AwspStaticControlPort);
      expect(typeof instance.staticPorts![1].toJSON).toBe('function');

      // Verify dynamicIntents array contains class instances
      expect(Array.isArray(instance.dynamicIntents)).toBe(true);
      expect(instance.dynamicIntents).toHaveLength(2);
      expect(instance.dynamicIntents![0]).toBeInstanceOf(AwspIntent);
      expect(typeof instance.dynamicIntents![0].toJSON).toBe('function');
      expect(instance.dynamicIntents![1]).toBeInstanceOf(AwspIntent);
      expect(typeof instance.dynamicIntents![1].toJSON).toBe('function');
    });

    it('should support round-trip serialization', () => {
      const instance = AwspControlPortsInfo.fromJSON(testDataWithBothFields);
      const serialized = instance.toJSON();
      const deserialized = AwspControlPortsInfo.fromJSON(serialized);

      // Verify structure matches
      expect(deserialized.staticPorts).toHaveLength(
        instance.staticPorts!.length,
      );
      expect(deserialized.dynamicIntents).toHaveLength(
        instance.dynamicIntents!.length,
      );

      // Verify nested objects are still class instances
      expect(deserialized.staticPorts![0]).toBeInstanceOf(
        AwspStaticControlPort,
      );
      expect(typeof deserialized.staticPorts![0].toJSON).toBe('function');
      expect(deserialized.dynamicIntents![0]).toBeInstanceOf(AwspIntent);
      expect(typeof deserialized.dynamicIntents![0].toJSON).toBe('function');
    });

    it('should handle optional staticPorts field correctly', () => {
      const dataWithoutStaticPorts = {
        dynamicIntents: [
          {
            id: 20,
            name: 'DynamicIntent1',
            maxports: 8,
          },
        ],
      };

      const instance = AwspControlPortsInfo.fromJSON(dataWithoutStaticPorts);

      expect(instance).toBeInstanceOf(AwspControlPortsInfo);
      expect(instance.staticPorts).toBeUndefined();
      expect(instance.dynamicIntents).toHaveLength(1);
      expect(instance.dynamicIntents![0]).toBeInstanceOf(AwspIntent);
    });

    it('should handle optional dynamicIntents field correctly', () => {
      const dataWithoutDynamicIntents = {
        staticPorts: [
          {
            id: 1,
            name: 'StaticPort1',
            supportedIntents: [
              {
                id: 10,
                name: 'Intent1',
                maxports: 2,
              },
            ],
          },
        ],
      };

      const instance = AwspControlPortsInfo.fromJSON(dataWithoutDynamicIntents);

      expect(instance).toBeInstanceOf(AwspControlPortsInfo);
      expect(instance.staticPorts).toHaveLength(1);
      expect(instance.staticPorts![0]).toBeInstanceOf(AwspStaticControlPort);
      expect(instance.dynamicIntents).toBeUndefined();
    });

    it('should handle both optional fields being undefined', () => {
      const dataWithoutOptionals = {};

      const instance = AwspControlPortsInfo.fromJSON(dataWithoutOptionals);

      expect(instance).toBeInstanceOf(AwspControlPortsInfo);
      expect(instance.staticPorts).toBeUndefined();
      expect(instance.dynamicIntents).toBeUndefined();
    });
  });
});
