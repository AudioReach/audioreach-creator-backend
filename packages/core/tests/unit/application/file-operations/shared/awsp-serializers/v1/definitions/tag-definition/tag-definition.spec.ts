/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspTagDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/tag-definition/tag-definition.js';
import {AwspTagKeyDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/tag-definition/tag-key-definition.js';

describe('TagDefinition', () => {
  const testData = {
    id: 1,
    name: 'TestTag',
    description: 'Test description',
    keys: [
      {
        id: 1,
        name: 'TestKey',
        dataType: 'UINT32',
        displayType: 'DECIMAL',
      },
      {
        id: 2,
        name: 'TestKey2',
        dataType: 'STRING',
        displayType: 'TEXT',
      },
    ],
    isVoice: true,
    enumName: 'TEST_ENUM',
    enumMember: '0x1',
  };

  describe('fromJSON', () => {
    it('should create proper class instances for nested objects', () => {
      const instance = AwspTagDefinition.fromJSON(testData);

      // Verify root instance
      expect(instance).toBeInstanceOf(AwspTagDefinition);
      expect(typeof instance.toJSON).toBe('function');

      // Verify nested array contains class instances
      expect(Array.isArray(instance.keys)).toBe(true);
      expect(instance.keys).toHaveLength(2);
      expect(instance.keys![0]).toBeInstanceOf(AwspTagKeyDefinition);
      expect(typeof instance.keys![0].toJSON).toBe('function');
      expect(instance.keys![1]).toBeInstanceOf(AwspTagKeyDefinition);
      expect(typeof instance.keys![1].toJSON).toBe('function');
    });

    it('should parse valid JSON data', () => {
      const json = {
        id: 1,
        name: 'TestTag',
        description: 'Test description',
      };

      const tag = AwspTagDefinition.fromJSON(json);

      expect(tag).toBeInstanceOf(AwspTagDefinition);
      expect(tag.id).toBe(1);
      expect(tag.name).toBe('TestTag');
      expect(tag.description).toBe('Test description');
    });

    it('should handle optional fields', () => {
      const json = {
        id: 1,
        name: 'TestTag',
      };

      const tag = AwspTagDefinition.fromJSON(json);

      expect(tag.id).toBe(1);
      expect(tag.name).toBe('TestTag');
      expect(tag.description).toBeUndefined();
    });

    it('should handle optional nested fields correctly', () => {
      const dataWithoutOptional = {
        id: 1,
        name: 'TestTag',
      };

      const withoutOpt = AwspTagDefinition.fromJSON(dataWithoutOptional);

      expect(withoutOpt).toBeInstanceOf(AwspTagDefinition);
      expect(withoutOpt.keys).toBeUndefined();
      expect(withoutOpt.description).toBeUndefined();
    });

    it('should throw on invalid data', () => {
      const invalidJson = {
        id: -1,
        name: 'TestTag',
      };

      expect(() => AwspTagDefinition.fromJSON(invalidJson)).toThrow();
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const tag = new AwspTagDefinition();
      tag.id = 1;
      tag.name = 'TestTag';
      tag.description = 'Test';

      const json = tag.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestTag');
      expect(json.description).toBe('Test');
    });

    it('should omit undefined optional fields', () => {
      const tag = new AwspTagDefinition();
      tag.id = 1;
      tag.name = 'TestTag';

      const json = tag.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestTag');
      expect(json.description).toBeUndefined();
    });
  });

  describe('round-trip', () => {
    it('should support round-trip serialization', () => {
      const instance = AwspTagDefinition.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspTagDefinition.fromJSON(serialized);

      // Verify structure matches
      expect(deserialized.id).toBe(instance.id);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.keys).toHaveLength(instance.keys!.length);

      // Verify nested objects are still class instances
      expect(deserialized.keys![0]).toBeInstanceOf(AwspTagKeyDefinition);
      expect(typeof deserialized.keys![0].toJSON).toBe('function');
    });

    it('should preserve data through parse and serialize', () => {
      const original = {
        id: 1,
        name: 'TestTag',
        description: 'Test',
        isVoice: true,
        enumName: 'TEST_ENUM',
        enumMember: 'TEST_VALUE',
      };

      const tag = AwspTagDefinition.fromJSON(original);
      const serialized = tag.toJSON();

      expect(serialized).toEqual(original);
    });
  });
});
