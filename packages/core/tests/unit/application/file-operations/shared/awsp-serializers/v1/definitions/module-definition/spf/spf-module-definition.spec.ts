/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspSpfModuleDefinition} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.js';
import {AwspDataPortsInfo} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/data-ports-info.js';
import {AwspControlPortsInfo} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/control-ports-info.js';
import {AwspCustomModuleInfo} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/custom-module-info.js';

describe('AwspSpfModuleDefinition - Nested Object Hydration', () => {
  const testDataWithAllOptionals = {
    id: 1,
    name: 'TestModule',
    processors: [1, 2, 3],
    containerTypes: [1, 2],
    inputPort: {
      maxPortCount: 2,
      ports: [
        {
          id: 1,
          name: 'InputPort1',
        },
        {
          id: 2,
          name: 'InputPort2',
        },
      ],
    },
    outputPort: {
      maxPortCount: 1,
      ports: [
        {
          id: 3,
          name: 'OutputPort1',
        },
      ],
    },
    controlPort: {
      staticPorts: [
        {
          id: 10,
          name: 'ControlPort1',
          intents: [
            {
              id: 100,
              name: 'Intent1',
              maxports: 2,
            },
          ],
        },
      ],
      dynamicIntents: [
        {
          id: 200,
          name: 'DynamicIntent1',
          maxports: 4,
        },
      ],
    },
    customModule: {
      majorTypeID: 1,
      interfaceTypeID: 2,
      interfaceVersionID: 3,
      fileName: 'test_module.so',
      entryPointTag: 'test_entry',
    },
    stackSize: 8192,
    isOffloadable: true,
    builtIn: false,
  };

  describe('fromJSON', () => {
    it('should create proper class instances for all nested objects', () => {
      const instance = AwspSpfModuleDefinition.fromJSON(
        testDataWithAllOptionals,
      );

      // Verify root instance
      expect(instance).toBeInstanceOf(AwspSpfModuleDefinition);
      expect(typeof instance.toJSON).toBe('function');

      // Verify inputPortsInfo
      expect(instance.inputPort).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof instance.inputPort!.toJSON).toBe('function');
      expect(instance.inputPort!.ports).toHaveLength(2);

      // Verify outputPortsInfo
      expect(instance.outputPort).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof instance.outputPort!.toJSON).toBe('function');
      expect(instance.outputPort!.ports).toHaveLength(1);

      // Verify controlPortsInfo
      expect(instance.controlPort).toBeInstanceOf(AwspControlPortsInfo);
      expect(typeof instance.controlPort!.toJSON).toBe('function');
      expect(instance.controlPort!.staticPorts).toHaveLength(1);
      expect(instance.controlPort!.dynamicIntents).toHaveLength(1);

      // Verify customModule
      expect(instance.customModule).toBeInstanceOf(AwspCustomModuleInfo);
      expect(typeof instance.customModule!.toJSON).toBe('function');
    });

    it('should support round-trip serialization', () => {
      const instance = AwspSpfModuleDefinition.fromJSON(
        testDataWithAllOptionals,
      );
      const serialized = instance.toJSON();
      const deserialized = AwspSpfModuleDefinition.fromJSON(serialized);

      // Verify structure matches
      expect(deserialized.id).toBe(instance.id);
      expect(deserialized.name).toBe(instance.name);

      // Verify nested objects are still class instances
      expect(deserialized.inputPort).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof deserialized.inputPort!.toJSON).toBe('function');
      expect(deserialized.outputPort).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof deserialized.outputPort!.toJSON).toBe('function');
      expect(deserialized.controlPort).toBeInstanceOf(AwspControlPortsInfo);
      expect(typeof deserialized.controlPort!.toJSON).toBe('function');
      expect(deserialized.customModule).toBeInstanceOf(AwspCustomModuleInfo);
      expect(typeof deserialized.customModule!.toJSON).toBe('function');
    });

    it('should handle missing optional nested objects', () => {
      const dataWithoutOptionals = {
        id: 1,
        name: 'MinimalModule',
        processors: [1],
        containerTypes: [1],
      };

      const instance = AwspSpfModuleDefinition.fromJSON(dataWithoutOptionals);

      expect(instance).toBeInstanceOf(AwspSpfModuleDefinition);
      expect(instance.inputPort).toBeUndefined();
      expect(instance.outputPort).toBeUndefined();
      expect(instance.controlPort).toBeUndefined();
      expect(instance.customModule).toBeUndefined();
    });

    it('should handle partial optional nested objects', () => {
      const dataWithSomeOptionals = {
        id: 1,
        name: 'PartialModule',
        processors: [1],
        containerTypes: [1],
        inputPort: {
          maxPortCount: 1,
          ports: [
            {
              id: 1,
              name: 'InputPort1',
            },
          ],
        },
        controlPort: {
          dynamicIntents: [
            {
              id: 200,
              name: 'DynamicIntent1',
              maxports: 4,
            },
          ],
        },
      };

      const instance = AwspSpfModuleDefinition.fromJSON(dataWithSomeOptionals);

      expect(instance).toBeInstanceOf(AwspSpfModuleDefinition);
      expect(instance.inputPort).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof instance.inputPort!.toJSON).toBe('function');
      expect(instance.outputPort).toBeUndefined();
      expect(instance.controlPort).toBeInstanceOf(AwspControlPortsInfo);
      expect(typeof instance.controlPort!.toJSON).toBe('function');
      expect(instance.customModule).toBeUndefined();
    });
  });
});
