/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {SpfPropertyDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/property-definition/spf-property-definition.schema.js';

describe('SpfPropertyDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse valid SPF property definition with all required fields', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      };

      const result = SpfPropertyDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'TestSpfProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      });
    });

    it('should parse SPF property definition with all optional fields', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        description: 'Test SPF property description',
        maxSize: 100,
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
            description: 'Element description',
          },
        ],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
        isVoice: true,
      };

      const result = SpfPropertyDefinitionSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.isVoice).toBe(true);
      expect(result.maxSize).toBe(100);
    });

    it('should parse SPF property definition with isVoice false', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
        isVoice: false,
      };

      const result = SpfPropertyDefinitionSchema.parse(input);

      expect(result.isVoice).toBe(false);
    });

    it('should parse SPF property definition without optional fields', () => {
      const input = {
        id: 999,
        name: 'TestSpfProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      };

      const result = SpfPropertyDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestSpfProperty');
      expect(result.categoryId).toBe(100);
      expect(result.categoryName).toBe('TestCategory');
      expect(result.apmModuleInstanceId).toBe(200);
      expect(result.description).toBeUndefined();
      expect(result.maxSize).toBeUndefined();
      expect(result.isVoice).toBeUndefined();
    });
  });

  describe('invalid data', () => {
    it('should reject SPF property definition with missing categoryId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with missing categoryName', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with missing apmModuleInstanceId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: 'TestCategory',
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with non-integer categoryId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 1.5,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with negative categoryId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: -1,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with zero categoryId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 0,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with empty categoryName', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: '',
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with non-string categoryName', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: 123,
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with non-integer apmModuleInstanceId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 1.5,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with negative apmModuleInstanceId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: -1,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with zero apmModuleInstanceId', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 0,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with non-boolean isVoice', () => {
      const input = {
        id: 1,
        name: 'TestSpfProperty',
        elements: [],
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
        isVoice: 'true',
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject SPF property definition with missing base fields', () => {
      const input = {
        categoryId: 100,
        categoryName: 'TestCategory',
        apmModuleInstanceId: 200,
      };

      expect(() => SpfPropertyDefinitionSchema.parse(input)).toThrow();
    });
  });
});
