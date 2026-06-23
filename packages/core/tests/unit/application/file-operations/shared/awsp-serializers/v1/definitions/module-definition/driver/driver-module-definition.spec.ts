/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {DriverModuleDefinition} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/driver/driver-module-definition.js';
import {AwspParamDefinition} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/common/param-definition.js';

describe('DriverModuleDefinition', () => {
  const testData = {
    id: 1,
    name: 'TestDriverModule',
    parameters: [
      {
        id: 1,
        name: 'Param1',
        toolPolicies: ['Calibration'],
        pidType: 'None',
        elements: [],
      },
    ],
    displayName: 'Test Driver Module',
    description: 'Test description',
    stubbed: true,
  };

  describe('fromJSON', () => {
    it('should create proper class instance', () => {
      const instance = DriverModuleDefinition.fromJSON(testData);

      expect(instance).toBeInstanceOf(DriverModuleDefinition);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.id).toBe(1);
      expect(instance.name).toBe('TestDriverModule');
      expect(instance.displayName).toBe('Test Driver Module');
      expect(instance.stubbed).toBe(true);
    });

    it('should hydrate parameters array', () => {
      const instance = DriverModuleDefinition.fromJSON(testData);

      expect(Array.isArray(instance.parameters)).toBe(true);
      expect(instance.parameters).toHaveLength(1);
      expect(instance.parameters[0]).toBeInstanceOf(AwspParamDefinition);
      expect(typeof instance.parameters[0].toJSON).toBe('function');
    });

    it('should handle optional fields', () => {
      const minimalData = {
        id: 1,
        name: 'TestDriverModule',
        parameters: [],
      };

      const instance = DriverModuleDefinition.fromJSON(minimalData);

      expect(instance.id).toBe(1);
      expect(instance.name).toBe('TestDriverModule');
      expect(instance.stubbed).toBeUndefined();
      expect(instance.displayName).toBeUndefined();
      expect(instance.description).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const instance = DriverModuleDefinition.fromJSON(testData);
      const json = instance.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestDriverModule');
      expect(json.displayName).toBe('Test Driver Module');
      expect(json.stubbed).toBe(true);
      expect(Array.isArray(json.parameters)).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const instance = DriverModuleDefinition.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = DriverModuleDefinition.fromJSON(serialized);

      expect(deserialized.id).toBe(instance.id);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.displayName).toBe(instance.displayName);
      expect(deserialized.description).toBe(instance.description);
      expect(deserialized.stubbed).toBe(instance.stubbed);
      expect(deserialized.parameters).toHaveLength(instance.parameters.length);
      expect(deserialized.parameters[0]).toBeInstanceOf(AwspParamDefinition);
    });
  });
});
