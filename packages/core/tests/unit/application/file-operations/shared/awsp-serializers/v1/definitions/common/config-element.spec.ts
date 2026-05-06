/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspConfigElement} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/config-element.js';
import {z} from 'zod';

describe('AwspConfigElement', () => {
  describe('fromJSON', () => {
    it('should validate and hydrate a complete config element', () => {
      const data = {
        elementType: 'ConfigElement',
        name: 'test-element',
        description: 'Test description',
        dataType: 'int32',
        defaultValue: '0',
        displayType: 'slider',
        policy: 'read-write',
        isReadOnly: false,
        displayName: 'Test Element',
        unitStr: 'dB',
        qFormat: 'Q15',
        precision: 2,
        linkedByForFormula: ['element1', 'element2'],
        defaultDataDepends: ['dep1'],
      };

      const result = AwspConfigElement.fromJSON(data);

      expect(result).toBeInstanceOf(AwspConfigElement);
      expect(result.elementType).toBe('ConfigElement');
      expect(result.name).toBe('test-element');
      expect(result.dataType).toBe('int32');
      expect(result.defaultValue).toBe('0');
      expect(result.displayType).toBe('slider');
      expect(result.policy).toBe('read-write');
      expect(result.isReadOnly).toBe(false);
      expect(result.displayName).toBe('Test Element');
      expect(result.unitStr).toBe('dB');
      expect(result.qFormat).toBe('Q15');
      expect(result.precision).toBe(2);
      expect(result.linkedByForFormula).toEqual(['element1', 'element2']);
      expect(result.defaultDataDepends).toEqual(['dep1']);
    });

    it('should throw ZodError when dataType is missing', () => {
      const data = {
        elementType: 'ConfigElement',
        name: 'test-element',
        description: 'Test description',
        defaultValue: '0',
      };

      expect(() => AwspConfigElement.fromJSON(data)).toThrow(z.ZodError);
    });

    it('should throw ZodError when defaultValue is missing', () => {
      const data = {
        elementType: 'ConfigElement',
        name: 'test-element',
        description: 'Test description',
        dataType: 'int32',
      };

      expect(() => AwspConfigElement.fromJSON(data)).toThrow(z.ZodError);
    });

    it('should accept optional fields as undefined', () => {
      const data = {
        elementType: 'ConfigElement',
        name: 'test-element',
        description: 'Test description',
        dataType: 'int32',
        defaultValue: '0',
      };

      const result = AwspConfigElement.fromJSON(data);

      expect(result).toBeInstanceOf(AwspConfigElement);
      expect(result.displayType).toBeUndefined();
      expect(result.policy).toBeUndefined();
      expect(result.isReadOnly).toBeUndefined();
    });
  });
});
