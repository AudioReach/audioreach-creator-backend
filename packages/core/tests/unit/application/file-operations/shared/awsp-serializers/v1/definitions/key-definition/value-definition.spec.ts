/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspValueDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/key-definition/value-definition.js';

describe('AwspValueDefinition serialization', () => {
  describe('fromJSON', () => {
    it('should parse valid JSON data', () => {
      const json = {
        id: 1,
        name: 'TestValue',
        description: 'Test description',
      };

      const value = AwspValueDefinition.fromJSON(json);

      expect(value).toBeInstanceOf(AwspValueDefinition);
      expect(value.id).toBe(1);
      expect(value.name).toBe('TestValue');
      expect(value.description).toBe('Test description');
    });

    it('should handle optional fields', () => {
      const json = {
        id: 1,
        name: 'TestValue',
      };

      const value = AwspValueDefinition.fromJSON(json);

      expect(value.id).toBe(1);
      expect(value.name).toBe('TestValue');
      expect(value.description).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const value = new AwspValueDefinition();
      value.id = 1;
      value.name = 'TestValue';
      value.description = 'Test';

      const json = value.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestValue');
      expect(json.description).toBe('Test');
    });

    it('should include all optional fields when present', () => {
      const value = new AwspValueDefinition();
      value.id = 1;
      value.name = 'TestValue';
      value.enumValue = 'ENUM_VAL';
      value.specialValue = 'SPECIAL';

      const json = value.toJSON();

      expect(json.enumValue).toBe('ENUM_VAL');
      expect(json.specialValue).toBe('SPECIAL');
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const original = {
        id: 1,
        name: 'TestValue',
        description: 'Test',
        enumValue: 'ENUM_VAL',
        specialValue: 'SPECIAL',
      };

      const value = AwspValueDefinition.fromJSON(original);
      const serialized = value.toJSON();

      expect(serialized).toEqual(original);
    });
  });
});
