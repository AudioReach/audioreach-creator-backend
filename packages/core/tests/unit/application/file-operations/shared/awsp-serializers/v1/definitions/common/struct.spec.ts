/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspStruct} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/struct.js';

describe('AwspStruct', () => {
  const testData = {
    elementType: 'Struct',
    name: 'TestStruct',
    structureType: 'TestStructureType',
    children: [],
    description: 'Test description',
  };

  describe('fromJSON', () => {
    it('should create proper class instance', () => {
      const instance = AwspStruct.fromJSON(testData);

      expect(instance).toBeInstanceOf(AwspStruct);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.elementType).toBe('Struct');
      expect(instance.name).toBe('TestStruct');
      expect(instance.structureType).toBe('TestStructureType');
      expect(instance.description).toBe('Test description');
    });

    it('should handle children array', () => {
      const instance = AwspStruct.fromJSON(testData);

      expect(Array.isArray(instance.children)).toBe(true);
      expect(instance.children).toHaveLength(0);
    });

    it('should handle optional fields', () => {
      const minimalData = {
        elementType: 'Struct',
        name: 'TestStruct',
        structureType: 'TestStructureType',
        children: [],
      };

      const instance = AwspStruct.fromJSON(minimalData);

      expect(instance.elementType).toBe('Struct');
      expect(instance.name).toBe('TestStruct');
      expect(instance.description).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const instance = AwspStruct.fromJSON(testData);
      const json = instance.toJSON();

      expect(json.elementType).toBe('Struct');
      expect(json.name).toBe('TestStruct');
      expect(json.structureType).toBe('TestStructureType');
      expect(json.description).toBe('Test description');
      expect(Array.isArray(json.children)).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const instance = AwspStruct.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspStruct.fromJSON(serialized);

      expect(deserialized.elementType).toBe(instance.elementType);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.structureType).toBe(instance.structureType);
      expect(deserialized.description).toBe(instance.description);
      expect(deserialized.children).toHaveLength(instance.children.length);
    });
  });
});
