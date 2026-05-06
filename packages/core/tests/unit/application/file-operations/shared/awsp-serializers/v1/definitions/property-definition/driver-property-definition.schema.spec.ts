/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {DriverPropertyDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/property-definition/driver-property-definition.schema.js';

describe('DriverPropertyDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse valid driver property definition with all required fields', () => {
      const input = {
        id: 1,
        name: 'TestDriverProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
      };

      const result = DriverPropertyDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'TestDriverProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
      });
    });

    it('should parse driver property definition with all optional fields', () => {
      const input = {
        id: 1,
        name: 'TestDriverProperty',
        description: 'Test driver property description',
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

      const result = DriverPropertyDefinitionSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.elements).toHaveLength(2);
      expect(result.maxSize).toBe(100);
    });

    it('should parse driver property definition with empty elements array', () => {
      const input = {
        id: 1,
        name: 'TestDriverProperty',
        elements: [],
      };

      const result = DriverPropertyDefinitionSchema.parse(input);

      expect(result.elements).toEqual([]);
    });

    it('should parse driver property definition without optional fields', () => {
      const input = {
        id: 999,
        name: 'TestDriverProperty',
        elements: [
          {
            elementType: 'CONFIG',
            name: 'element1',
          },
        ],
      };

      const result = DriverPropertyDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestDriverProperty');
      expect(result.description).toBeUndefined();
      expect(result.maxSize).toBeUndefined();
    });
  });

  describe('invalid data', () => {
    it('should reject driver property definition with missing id', () => {
      const input = {
        name: 'TestDriverProperty',
        elements: [],
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with missing name', () => {
      const input = {
        id: 1,
        elements: [],
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with missing elements', () => {
      const input = {
        id: 1,
        name: 'TestDriverProperty',
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'TestDriverProperty',
        elements: [],
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with negative id', () => {
      const input = {
        id: -1,
        name: 'TestDriverProperty',
        elements: [],
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with zero id', () => {
      const input = {
        id: 0,
        name: 'TestDriverProperty',
        elements: [],
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with empty name', () => {
      const input = {
        id: 1,
        name: '',
        elements: [],
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with non-array elements', () => {
      const input = {
        id: 1,
        name: 'TestDriverProperty',
        elements: 'not-an-array',
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject driver property definition with negative maxSize', () => {
      const input = {
        id: 1,
        name: 'TestDriverProperty',
        maxSize: -1,
        elements: [],
      };

      expect(() => DriverPropertyDefinitionSchema.parse(input)).toThrow();
    });
  });
});
