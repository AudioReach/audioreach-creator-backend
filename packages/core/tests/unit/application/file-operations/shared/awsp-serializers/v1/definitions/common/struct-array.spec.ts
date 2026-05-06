/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspStructArray} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/struct-array.js';
import {AwspStruct} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/struct.js';

describe('AwspStructArray - Nested Object Hydration', () => {
  const testData = {
    name: 'TestStructArray',
    elementType: 'STRUCT_ARRAY',
    arrayLength: 5,
    arrayLenFormulaStr: '5',
    copySrcInfoList: [],
    keyStructureDefinition: {
      name: 'TestStruct',
      elementType: 'STRUCT',
      structureType: 'SIMPLE',
      children: [],
    },
  };

  describe('fromJSON', () => {
    it('should create proper class instances for nested objects', () => {
      const instance = AwspStructArray.fromJSON(testData);

      expect(instance).toBeInstanceOf(AwspStructArray);
      expect(typeof instance.toJSON).toBe('function');

      expect(instance.keyStructureDefinition).toBeInstanceOf(AwspStruct);
      expect(typeof instance.keyStructureDefinition.toJSON).toBe('function');
    });

    it('should support round-trip serialization', () => {
      const instance = AwspStructArray.fromJSON(testData);
      const serialized = instance.toJSON();
      const deserialized = AwspStructArray.fromJSON(serialized);

      expect(deserialized.name).toBe(instance.name);
      expect(deserialized.keyStructureDefinition).toBeInstanceOf(AwspStruct);
      expect(typeof deserialized.keyStructureDefinition.toJSON).toBe(
        'function',
      );
    });
  });
});
