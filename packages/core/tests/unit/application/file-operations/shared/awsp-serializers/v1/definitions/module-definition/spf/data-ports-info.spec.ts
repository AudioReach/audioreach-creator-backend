/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspDataPortsInfo} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/data-ports-info.js';
import {AwspPort} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/port.js';

describe('AwspDataPortsInfo - Nested Object Hydration', () => {
  const testData = {
    maxPortCount: 4,
    ports: [
      {
        id: 1,
        name: 'Port1',
      },
      {
        id: 2,
        name: 'Port2',
      },
      {
        id: 3,
        name: 'Port3',
      },
    ],
  };

  describe('fromJSON', () => {
    it('should create proper class instances for nested objects', () => {
      const instance = AwspDataPortsInfo.fromJSON(testData);

      // Verify root instance
      expect(instance).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof instance.toJSON).toBe('function');

      // Verify nested array contains class instances
      expect(Array.isArray(instance.ports)).toBe(true);
      expect(instance.ports).toHaveLength(3);
      expect(instance.ports[0]).toBeInstanceOf(AwspPort);
      expect(typeof instance.ports[0].toJSON).toBe('function');
      expect(instance.ports[1]).toBeInstanceOf(AwspPort);
      expect(typeof instance.ports[1].toJSON).toBe('function');
      expect(instance.ports[2]).toBeInstanceOf(AwspPort);
      expect(typeof instance.ports[2].toJSON).toBe('function');
    });

    it('should support round-trip serialization', () => {
      const instance = AwspDataPortsInfo.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspDataPortsInfo.fromJSON(serialized);

      // Verify structure matches
      expect(deserialized.maxPortCount).toBe(instance.maxPortCount);
      expect(deserialized.ports).toHaveLength(instance.ports.length);

      // Verify nested objects are still class instances
      expect(deserialized.ports[0]).toBeInstanceOf(AwspPort);
      expect(typeof deserialized.ports[0].toJSON).toBe('function');
      expect(deserialized.ports[0].id).toBe(instance.ports[0].id);
      expect(deserialized.ports[0].name).toBe(instance.ports[0].name);
    });

    it('should handle empty ports array', () => {
      const dataWithEmptyPorts = {
        maxPortCount: 0,
        ports: [],
      };

      const instance = AwspDataPortsInfo.fromJSON(dataWithEmptyPorts);

      expect(instance).toBeInstanceOf(AwspDataPortsInfo);
      expect(instance.ports).toHaveLength(0);
      expect(Array.isArray(instance.ports)).toBe(true);
    });
  });
});
