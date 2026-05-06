/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspKeyDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/key-definition/key-definition.js';
import {AwspValueDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/key-definition/value-definition.js';

describe('AwspKeyDefinition', () => {
  const testData = {
    id: 1,
    name: 'TestKey',
    values: [
      {
        id: 1,
        name: 'Value1',
        dataType: 'UINT32',
        displayType: 'DECIMAL',
      },
      {
        id: 2,
        name: 'Value2',
        dataType: 'STRING',
        displayType: 'TEXT',
      },
    ],
    description: 'Test description',
    isVoice: false,
    isDynamic: true,
  };

  describe('fromJSON', () => {
    it('should create proper class instances for nested objects', () => {
      const instance = AwspKeyDefinition.fromJSON(testData);

      expect(instance).toBeInstanceOf(AwspKeyDefinition);
      expect(typeof instance.toJSON).toBe('function');

      expect(Array.isArray(instance.values)).toBe(true);
      expect(instance.values).toHaveLength(2);
      expect(instance.values[0]).toBeInstanceOf(AwspValueDefinition);
      expect(typeof instance.values[0].toJSON).toBe('function');
      expect(instance.values[1]).toBeInstanceOf(AwspValueDefinition);
      expect(typeof instance.values[1].toJSON).toBe('function');
    });

    it('should parse valid JSON data with nested values', () => {
      const json = {
        id: 1,
        name: 'TestKey',
        values: [
          {id: 1, name: 'Value1'},
          {id: 2, name: 'Value2'},
        ],
      };

      const key = AwspKeyDefinition.fromJSON(json);

      expect(key).toBeInstanceOf(AwspKeyDefinition);
      expect(key.id).toBe(1);
      expect(key.name).toBe('TestKey');
      expect(key.values).toHaveLength(2);
      expect(key.values[0].name).toBe('Value1');
    });

    it('should handle optional fields', () => {
      const json = {
        id: 1,
        name: 'TestKey',
        values: [],
        isVoice: true,
        isDynamic: false,
      };

      const key = AwspKeyDefinition.fromJSON(json);

      expect(key.isVoice).toBe(true);
      expect(key.isDynamic).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON with nested values', () => {
      const key = new AwspKeyDefinition();
      key.id = 1;
      key.name = 'TestKey';
      key.values = [];

      const json = key.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestKey');
      expect(Array.isArray(json.values)).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('should support round-trip serialization', () => {
      const instance = AwspKeyDefinition.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspKeyDefinition.fromJSON(serialized);

      expect(deserialized.id).toBe(instance.id);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.values).toHaveLength(instance.values.length);

      expect(deserialized.values[0]).toBeInstanceOf(AwspValueDefinition);
      expect(typeof deserialized.values[0].toJSON).toBe('function');
    });

    it('should preserve data through parse and serialize', () => {
      const original = {
        id: 1,
        name: 'TestKey',
        values: [{id: 1, name: 'Value1'}],
        description: 'Test description',
        isVoice: true,
      };

      const key = AwspKeyDefinition.fromJSON(original);
      const serialized = key.toJSON();

      expect(serialized.id).toBe(original.id);
      expect(serialized.name).toBe(original.name);
      expect(serialized.description).toBe(original.description);
      expect(serialized.isVoice).toBe(original.isVoice);
    });
  });
});
