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
    supportedProcessorIds: [1, 2, 3],
    supportedContainerTypes: [1, 2],
    inputPortsInfo: {
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
    outputPortsInfo: {
      maxPortCount: 1,
      ports: [
        {
          id: 3,
          name: 'OutputPort1',
        },
      ],
    },
    controlPortsInfo: {
      staticPorts: [
        {
          id: 10,
          name: 'ControlPort1',
          supportedIntents: [
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
    customModuleInfo: {
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
      expect(instance.inputPortsInfo).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof instance.inputPortsInfo!.toJSON).toBe('function');
      expect(instance.inputPortsInfo!.ports).toHaveLength(2);

      // Verify outputPortsInfo
      expect(instance.outputPortsInfo).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof instance.outputPortsInfo!.toJSON).toBe('function');
      expect(instance.outputPortsInfo!.ports).toHaveLength(1);

      // Verify controlPortsInfo
      expect(instance.controlPortsInfo).toBeInstanceOf(AwspControlPortsInfo);
      expect(typeof instance.controlPortsInfo!.toJSON).toBe('function');
      expect(instance.controlPortsInfo!.staticPorts).toHaveLength(1);
      expect(instance.controlPortsInfo!.dynamicIntents).toHaveLength(1);

      // Verify customModuleInfo
      expect(instance.customModuleInfo).toBeInstanceOf(AwspCustomModuleInfo);
      expect(typeof instance.customModuleInfo!.toJSON).toBe('function');
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
      expect(deserialized.inputPortsInfo).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof deserialized.inputPortsInfo!.toJSON).toBe('function');
      expect(deserialized.outputPortsInfo).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof deserialized.outputPortsInfo!.toJSON).toBe('function');
      expect(deserialized.controlPortsInfo).toBeInstanceOf(
        AwspControlPortsInfo,
      );
      expect(typeof deserialized.controlPortsInfo!.toJSON).toBe('function');
      expect(deserialized.customModuleInfo).toBeInstanceOf(
        AwspCustomModuleInfo,
      );
      expect(typeof deserialized.customModuleInfo!.toJSON).toBe('function');
    });

    it('should handle missing optional nested objects', () => {
      const dataWithoutOptionals = {
        id: 1,
        name: 'MinimalModule',
        supportedProcessorIds: [1],
        supportedContainerTypes: [1],
      };

      const instance = AwspSpfModuleDefinition.fromJSON(dataWithoutOptionals);

      expect(instance).toBeInstanceOf(AwspSpfModuleDefinition);
      expect(instance.inputPortsInfo).toBeUndefined();
      expect(instance.outputPortsInfo).toBeUndefined();
      expect(instance.controlPortsInfo).toBeUndefined();
      expect(instance.customModuleInfo).toBeUndefined();
    });

    it('should handle partial optional nested objects', () => {
      const dataWithSomeOptionals = {
        id: 1,
        name: 'PartialModule',
        supportedProcessorIds: [1],
        supportedContainerTypes: [1],
        inputPortsInfo: {
          maxPortCount: 1,
          ports: [
            {
              id: 1,
              name: 'InputPort1',
            },
          ],
        },
        controlPortsInfo: {
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
      expect(instance.inputPortsInfo).toBeInstanceOf(AwspDataPortsInfo);
      expect(typeof instance.inputPortsInfo!.toJSON).toBe('function');
      expect(instance.outputPortsInfo).toBeUndefined();
      expect(instance.controlPortsInfo).toBeInstanceOf(AwspControlPortsInfo);
      expect(typeof instance.controlPortsInfo!.toJSON).toBe('function');
      expect(instance.customModuleInfo).toBeUndefined();
    });
  });
});
