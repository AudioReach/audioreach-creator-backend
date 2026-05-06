/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {TagKeyDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/tag-definition/tag-key-definition.schema.js';

describe('TagKeyDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse valid tag key definition with all required fields', () => {
      const input = {
        id: 1,
        name: 'TagKey1',
      };

      const result = TagKeyDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'TagKey1',
      });
    });

    it('should parse tag key definition with optional enumValue', () => {
      const input = {
        id: 1,
        name: 'TagKey1',
        enumValue: 'ENUM_VALUE_1',
      };

      const result = TagKeyDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'TagKey1',
        enumValue: 'ENUM_VALUE_1',
      });
    });

    it('should parse tag key definition without enumValue', () => {
      const input = {
        id: 999,
        name: 'TestTagKey',
      };

      const result = TagKeyDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestTagKey');
      expect(result.enumValue).toBeUndefined();
    });
  });

  describe('invalid data', () => {
    it('should reject tag key definition with missing id', () => {
      const input = {
        name: 'TagKey1',
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag key definition with missing name', () => {
      const input = {
        id: 1,
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag key definition with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'TagKey1',
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag key definition with negative id', () => {
      const input = {
        id: -1,
        name: 'TagKey1',
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag key definition with zero id', () => {
      const input = {
        id: 0,
        name: 'TagKey1',
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag key definition with empty name', () => {
      const input = {
        id: 1,
        name: '',
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag key definition with non-string name', () => {
      const input = {
        id: 1,
        name: 123,
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag key definition with non-string enumValue', () => {
      const input = {
        id: 1,
        name: 'TagKey1',
        enumValue: 123,
      };

      expect(() => TagKeyDefinitionSchema.parse(input)).toThrow();
    });
  });
});
