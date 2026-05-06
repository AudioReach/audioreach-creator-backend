/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspConfigElementArray} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/config-element-array.js';

describe('BaseArrayElement', () => {
  const testData = {
    elementType: 'ConfigElementArray',
    name: 'TestArrayElement',
    arrayLength: 10,
    arrayLenFormulaStr: '10',
    copySrcInfoList: [],
    keyConfigElement: {
      elementType: 'ConfigElement',
      name: 'KeyElement',
      dataType: 'UINT32',
      defaultValue: '0',
    },
  };

  describe('fromJSON', () => {
    it('should create proper class instance with base array fields', () => {
      const instance = AwspConfigElementArray.fromJSON(testData);

      expect(instance).toBeInstanceOf(AwspConfigElementArray);
      expect(typeof instance.toJSON).toBe('function');
      expect(instance.elementType).toBe('ConfigElementArray');
      expect(instance.name).toBe('TestArrayElement');
      expect(instance.arrayLength).toBe(10);
    });
  });

  describe('toJSON', () => {
    it('should serialize base array element fields', () => {
      const instance = AwspConfigElementArray.fromJSON(testData);
      const json = instance.toJSON();

      expect(json.elementType).toBe('ConfigElementArray');
      expect(json.name).toBe('TestArrayElement');
      expect(json.arrayLength).toBe(10);
    });
  });

  describe('round-trip', () => {
    it('should preserve base array element data through parse and serialize', () => {
      const instance = AwspConfigElementArray.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspConfigElementArray.fromJSON(serialized);

      expect(deserialized.elementType).toBe(instance.elementType);
      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.arrayLength).toBe(instance.arrayLength);
    });
  });
});
