/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {SpfPropertyDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/property-definition/spf-property-definition.js';

describe('SpfPropertyDefinition', () => {
  const testData = {
    id: 1,
    name: 'TestSpfProperty',
    elements: [],
    description: 'Test description',
    maxSize: 100,
    categoryId: 1,
    categoryName: 'TestCategory',
    apmModuleInstanceId: 1,
  };

  describe('fromJSON', () => {
    it('should create proper class instance', () => {
      const instance = SpfPropertyDefinition.fromJSON(testData);

      expect(instance).toBeInstanceOf(SpfPropertyDefinition);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.id).toBe(1);
      expect(instance.name).toBe('TestSpfProperty');
      expect(instance.description).toBe('Test description');
      expect(instance.maxSize).toBe(100);
    });

    it('should handle elements array', () => {
      const instance = SpfPropertyDefinition.fromJSON(testData);

      expect(Array.isArray(instance.elements)).toBe(true);
      expect(instance.elements).toHaveLength(0);
    });

    it('should handle optional fields', () => {
      const minimalData = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 1,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 1,
      };

      const instance = SpfPropertyDefinition.fromJSON(minimalData);

      expect(instance.id).toBe(1);
      expect(instance.name).toBe('TestSpfProperty');
      expect(instance.description).toBeUndefined();
      expect(instance.maxSize).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const instance = SpfPropertyDefinition.fromJSON(testData);
      const json = instance.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestSpfProperty');
      expect(json.description).toBe('Test description');
      expect(json.maxSize).toBe(100);
      expect(Array.isArray(json.elements)).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const instance = SpfPropertyDefinition.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = SpfPropertyDefinition.fromJSON(serialized);

      expect(deserialized.id).toBe(instance.id);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.description).toBe(instance.description);
      expect(deserialized.maxSize).toBe(instance.maxSize);
      expect(deserialized.elements).toHaveLength(instance.elements.length);
    });
  });
});
