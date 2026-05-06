/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {BasePropertyDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/property-definition/base-property-definition.schema.js';

describe('BasePropertyDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse valid property definition with all required fields', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
      };

      const result = BasePropertyDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'TestProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
      });
    });

    it('should parse property definition with all optional fields', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        description: 'Test property description',
        maxSize: 100,
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
            description: 'Element description',
          },
          {
            elementType: 'STRUCT',
            name: 'element2',
          },
        ],
      };

      const result = BasePropertyDefinitionSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.elements).toHaveLength(2);
      expect(result.maxSize).toBe(100);
    });

    it('should parse property definition with empty elements array', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        elements: [],
      };

      const result = BasePropertyDefinitionSchema.parse(input);

      expect(result.elements).toEqual([]);
    });

    it('should parse property definition with maxSize of 0', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        maxSize: 0,
        elements: [],
      };

      const result = BasePropertyDefinitionSchema.parse(input);

      expect(result.maxSize).toBe(0);
    });

    it('should parse property definition without optional fields', () => {
      const input = {
        id: 999,
        name: 'TestProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
      };

      const result = BasePropertyDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestProperty');
      expect(result.description).toBeUndefined();
      expect(result.maxSize).toBeUndefined();
    });
  });

  describe('invalid data', () => {
    it('should reject property definition with missing id', () => {
      const input = {
        name: 'TestProperty',
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with missing name', () => {
      const input = {
        id: 1,
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with missing elements', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'TestProperty',
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with negative id', () => {
      const input = {
        id: -1,
        name: 'TestProperty',
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with zero id', () => {
      const input = {
        id: 0,
        name: 'TestProperty',
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with empty name', () => {
      const input = {
        id: 1,
        name: '',
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with non-string name', () => {
      const input = {
        id: 1,
        name: 123,
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with non-array elements', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        elements: 'not-an-array',
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with invalid element in array', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        elements: [
          {
            elementType: 'CONFIG',
            // missing required 'name' field
          },
        ],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with negative maxSize', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        maxSize: -1,
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with non-integer maxSize', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        maxSize: 1.5,
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject property definition with non-string description', () => {
      const input = {
        id: 1,
        name: 'TestProperty',
        description: 123,
        elements: [],
      };

      expect(() => BasePropertyDefinitionSchema.parse(input)).toThrow();
    });
  });
});
