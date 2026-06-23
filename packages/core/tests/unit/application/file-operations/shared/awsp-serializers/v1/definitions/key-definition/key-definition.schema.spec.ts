/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {KeyDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/key-definition/key-definition.schema.js';

describe('KeyDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse valid key definition with required fields', () => {
      const input = {
        id: 1,
        name: 'Key1',
        values: [{id: 1, name: 'Value1'}],
      };

      const result = KeyDefinitionSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.values).toHaveLength(1);
    });

    it('should parse key definition with all optional fields', () => {
      const input = {
        id: 1,
        name: 'Key1',
        values: [
          {id: 1, name: 'Value1', enumValue: 'ENUM1'},
          {id: 2, name: 'Value2'},
        ],
        description: 'Test key description',
        isVoice: true,
        isDynamic: false,
        specialty: 'SampleRate',
        enumMember: 'KEY_ENUM_1',
        enumName: 'KeyEnum',
        isGraphKey: true,
        graphKeyEnumMember: 'GRAPH_KEY_1',
        isCalKey: false,
        calKeyEnumMember: 'CAL_KEY_1',
      };

      const result = KeyDefinitionSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.values).toHaveLength(2);
    });

    it('should parse key definition with empty values array', () => {
      const input = {
        id: 1,
        name: 'Key1',
        values: [],
      };

      const result = KeyDefinitionSchema.parse(input);

      expect(result.values).toEqual([]);
    });

    it('should parse key definition without optional fields', () => {
      const input = {
        id: 999,
        name: 'TestKey',
        values: [{id: 1, name: 'Value1'}],
      };

      const result = KeyDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestKey');
      expect(result.description).toBeUndefined();
      expect(result.isVoice).toBeUndefined();
    });
  });

  describe('invalid data', () => {
    it('should reject key definition with missing id', () => {
      const input = {
        name: 'Key1',
        values: [{id: 1, name: 'Value1'}],
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with missing name', () => {
      const input = {
        id: 1,
        values: [{id: 1, name: 'Value1'}],
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with missing values', () => {
      const input = {
        id: 1,
        name: 'Key1',
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'Key1',
        values: [{id: 1, name: 'Value1'}],
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with negative id', () => {
      const input = {
        id: -1,
        name: 'Key1',
        values: [{id: 1, name: 'Value1'}],
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with zero id', () => {
      const input = {
        id: 0,
        name: 'Key1',
        values: [{id: 1, name: 'Value1'}],
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with empty name', () => {
      const input = {
        id: 1,
        name: '',
        values: [{id: 1, name: 'Value1'}],
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with non-array values', () => {
      const input = {
        id: 1,
        name: 'Key1',
        values: 'not-an-array',
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with invalid value in values array', () => {
      const input = {
        id: 1,
        name: 'Key1',
        values: [{id: 'invalid', name: 'Value1'}],
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with non-boolean isVoice', () => {
      const input = {
        id: 1,
        name: 'Key1',
        values: [{id: 1, name: 'Value1'}],
        isVoice: 'true',
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject key definition with non-string description', () => {
      const input = {
        id: 1,
        name: 'Key1',
        values: [{id: 1, name: 'Value1'}],
        description: 123,
      };

      expect(() => KeyDefinitionSchema.parse(input)).toThrow();
    });
  });
});
