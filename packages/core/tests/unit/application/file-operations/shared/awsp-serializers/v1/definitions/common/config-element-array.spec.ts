/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspConfigElementArray} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/config-element-array.js';
import {AwspConfigElement} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/config-element.js';

describe('AwspConfigElementArray - Nested Object Hydration', () => {
  const testData = {
    id: 1,
    name: 'TestArray',
    elementType: 'ElementArray',
    dataType: 'UINT32',
    minSize: 1,
    maxSize: 10,
    defaultSize: 5,
    keyConfigElement: {
      id: 2,
      name: 'TestElement',
      elementType: 'ConfigElement',
      dataType: 'UINT32',
      defaultValue: '0',
      displayType: 'DECIMAL',
    },
    displayType: 'DECIMAL',
    policy: 'EDITABLE',
    isReadOnly: false,
  };

  describe('fromJSON', () => {
    it('should create proper class instances for nested objects', () => {
      const instance = AwspConfigElementArray.fromJSON(testData);

      expect(instance).toBeInstanceOf(AwspConfigElementArray);
      expect(typeof instance.toJSON).toBe('function');

      expect(instance.keyConfigElement).toBeInstanceOf(AwspConfigElement);
      expect(typeof instance.keyConfigElement.toJSON).toBe('function');
    });

    it('should support round-trip serialization', () => {
      const instance = AwspConfigElementArray.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspConfigElementArray.fromJSON(serialized);

      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.keyConfigElement).toBeInstanceOf(AwspConfigElement);
      expect(typeof deserialized.keyConfigElement.toJSON).toBe('function');
    });
  });
});
