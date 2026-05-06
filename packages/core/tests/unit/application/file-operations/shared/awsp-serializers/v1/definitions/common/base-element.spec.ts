/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspConfigElement} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/config-element.js';

describe('BaseElement', () => {
  const testData = {
    elementType: 'ConfigElement',
    name: 'TestElement',
    dataType: 'UINT32',
    defaultValue: '0',
  };

  describe('fromJSON', () => {
    it('should create proper class instance with base fields', () => {
      const instance = AwspConfigElement.fromJSON(testData);

      expect(instance).toBeInstanceOf(AwspConfigElement);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.elementType).toBe('ConfigElement');
      expect(instance.name).toBe('TestElement');
    });
  });

  describe('toJSON', () => {
    it('should serialize base element fields', () => {
      const instance = AwspConfigElement.fromJSON(testData);
      const json = instance.toJSON();

      expect(json.elementType).toBe('ConfigElement');
      expect(json.name).toBe('TestElement');
    });
  });

  describe('round-trip', () => {
    it('should preserve base element data through parse and serialize', () => {
      const instance = AwspConfigElement.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspConfigElement.fromJSON(serialized);

      expect(deserialized.elementType).toBe(instance.elementType);
      expect(deserialized.name).toBe(instance.name);
    });
  });
});
