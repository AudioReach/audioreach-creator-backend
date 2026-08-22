/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {ValueDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/key-definition/value-definition.schema.js';

describe('ValueDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse value definition with id of zero (0x00000000)', () => {
      const input = {
        id: '0x00000000',
        name: 'Disabled',
      };

      const result = ValueDefinitionSchema.parse(input);

      expect(result).toEqual({id: 0, name: 'Disabled'});
    });

    it('should parse valid value definition with all required fields', () => {
      const input = {
        id: 1,
        name: 'Value1',
      };

      const result = ValueDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'Value1',
      });
    });

    it('should parse value definition with all optional fields', () => {
      const input = {
        id: 1,
        name: 'Value1',
        description: 'Test value description',
        enumMember: 'ENUM_VALUE_1',
        specialityValue: 42,
      };

      const result = ValueDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'Value1',
        description: 'Test value description',
        enumMember: 'ENUM_VALUE_1',
        specialValue: '42',
      });
    });

    it('should parse value definition without optional fields', () => {
      const input = {
        id: 999,
        name: 'TestValue',
      };

      const result = ValueDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestValue');
      expect(result.description).toBeUndefined();
      expect(result.enumMember).toBeUndefined();
      expect(result.specialValue).toBeUndefined();
    });
  });

  describe('invalid data', () => {
    it('should reject value definition with missing id', () => {
      const input = {
        name: 'Value1',
      };

      expect(() => ValueDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject value definition with missing name', () => {
      const input = {
        id: 1,
      };

      expect(() => ValueDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject value definition with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'Value1',
      };

      expect(() => ValueDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject value definition with empty name', () => {
      const input = {
        id: 1,
        name: '',
      };

      expect(() => ValueDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject value definition with non-string name', () => {
      const input = {
        id: 1,
        name: 123,
      };

      expect(() => ValueDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject value definition with non-string description', () => {
      const input = {
        id: 1,
        name: 'Value1',
        description: 123,
      };

      expect(() => ValueDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject value definition with non-string enumMember', () => {
      const input = {
        id: 1,
        name: 'Value1',
        enumMember: 123,
      };

      expect(() => ValueDefinitionSchema.parse(input)).toThrow();
    });

    it('should accept numeric specialityValue (C# uint) and coerce to string', () => {
      const input = {
        id: 1,
        name: 'Value1',
        specialityValue: 123,
      };

      const result = ValueDefinitionSchema.parse(input);
      expect(result.specialValue).toBe('123');
    });
  });
});
