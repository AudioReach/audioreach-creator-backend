/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {TagDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/tag-definition/tag-definition.schema.js';

describe('TagDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse valid tag definition with all required fields', () => {
      const input = {
        id: 1,
        name: 'Tag1',
      };

      const result = TagDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'Tag1',
      });
    });

    it('should parse tag definition with all optional fields', () => {
      const input = {
        id: 1,
        name: 'Tag1',
        description: 'Test tag description',
        supportedKeys: [
          {id: 1, name: 'Key1', enumValue: 'ENUM1'},
          {id: 2, name: 'Key2'},
        ],
        isVoice: true,
        enumName: 'TAG_ENUM',
        enumValue: 'TAG_VALUE_1',
      };

      const result = TagDefinitionSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.supportedKeys).toHaveLength(2);
      expect(result.supportedKeys?.[0].name).toBe('Key1');
    });

    it('should parse tag definition with empty supportedKeys array', () => {
      const input = {
        id: 1,
        name: 'Tag1',
        supportedKeys: [],
      };

      const result = TagDefinitionSchema.parse(input);

      expect(result.supportedKeys).toEqual([]);
    });

    it('should parse tag definition without optional fields', () => {
      const input = {
        id: 999,
        name: 'TestTag',
      };

      const result = TagDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestTag');
      expect(result.description).toBeUndefined();
      expect(result.supportedKeys).toBeUndefined();
      expect(result.isVoice).toBeUndefined();
    });
  });

  describe('invalid data', () => {
    it('should reject tag definition with missing id', () => {
      const input = {
        name: 'Tag1',
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with missing name', () => {
      const input = {
        id: 1,
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'Tag1',
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with negative id', () => {
      const input = {
        id: -1,
        name: 'Tag1',
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with zero id', () => {
      const input = {
        id: 0,
        name: 'Tag1',
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with empty name', () => {
      const input = {
        id: 1,
        name: '',
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with non-string name', () => {
      const input = {
        id: 1,
        name: 123,
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with invalid supportedKeys', () => {
      const input = {
        id: 1,
        name: 'Tag1',
        supportedKeys: [{id: 'invalid', name: 'Key1'}],
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with non-boolean isVoice', () => {
      const input = {
        id: 1,
        name: 'Tag1',
        isVoice: 'true',
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject tag definition with non-string description', () => {
      const input = {
        id: 1,
        name: 'Tag1',
        description: 123,
      };

      expect(() => TagDefinitionSchema.parse(input)).toThrow();
    });
  });
});
