/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspSpfModuleDefinition} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.js';
import {AwspParamDefinition} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/common/param-definition.js';

describe('BaseModuleDefinition', () => {
  const testData = {
    id: 1,
    name: 'TestModule',
    paramDefinitions: [
      {
        id: 1,
        name: 'Param1',
        toolPolicies: ['Calibration'],
        pidType: 'None',
        elements: [],
      },
    ],
    displayName: 'Test Module',
    description: 'Test description',
    supportedProcessorIds: [1, 2],
    supportedContainerTypes: [1],
  };

  describe('fromJSON', () => {
    it('should create proper class instance with base fields', () => {
      const instance = AwspSpfModuleDefinition.fromJSON(testData);

      expect(instance).toBeInstanceOf(AwspSpfModuleDefinition);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.id).toBe(1);
      expect(instance.name).toBe('TestModule');
      expect(instance.displayName).toBe('Test Module');
      expect(instance.description).toBe('Test description');
    });

    it('should hydrate paramDefinitions array', () => {
      const instance = AwspSpfModuleDefinition.fromJSON(testData);

      expect(Array.isArray(instance.paramDefinitions)).toBe(true);
      expect(instance.paramDefinitions).toHaveLength(1);
      expect(instance.paramDefinitions[0]).toBeInstanceOf(AwspParamDefinition);
      expect(typeof instance.paramDefinitions[0].toJSON).toBe('function');
    });

    it('should handle optional base fields', () => {
      const minimalData = {
        id: 1,
        name: 'TestModule',
        paramDefinitions: [],
        supportedProcessorIds: [],
        supportedContainerTypes: [],
      };

      const instance = AwspSpfModuleDefinition.fromJSON(minimalData);

      expect(instance.id).toBe(1);
      expect(instance.name).toBe('TestModule');
      expect(instance.displayName).toBeUndefined();
      expect(instance.description).toBeUndefined();
      expect(instance.replacedBy).toBeUndefined();
      expect(instance.deprecated).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize base module fields', () => {
      const instance = AwspSpfModuleDefinition.fromJSON(testData);
      const json = instance.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestModule');
      expect(json.displayName).toBe('Test Module');
      expect(json.description).toBe('Test description');
      expect(Array.isArray(json.paramDefinitions)).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('should preserve base module data through parse and serialize', () => {
      const instance = AwspSpfModuleDefinition.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspSpfModuleDefinition.fromJSON(serialized);

      expect(deserialized.id).toBe(instance.id);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.displayName).toBe(instance.displayName);
      expect(deserialized.description).toBe(instance.description);
      expect(deserialized.paramDefinitions).toHaveLength(
        instance.paramDefinitions.length,
      );
      expect(deserialized.paramDefinitions[0]).toBeInstanceOf(
        AwspParamDefinition,
      );
    });
  });
});
