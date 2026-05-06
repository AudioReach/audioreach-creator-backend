/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {BaseElementSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/base-element.schema.js';

describe('BaseElementSchema', () => {
  describe('valid data', () => {
    it('should parse valid element with all required fields', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
      };

      const result = BaseElementSchema.parse(input);

      expect(result).toEqual({
        elementType: 'CONFIG',
        name: 'testElement',
      });
    });

    it('should parse element with all optional fields', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        description: 'Test element description',
        channel: 1,
        groupSet: 2,
        alignment: 4,
        rtmPlotType: 'LINE',
        group: 'TestGroup',
        subGroup: 'TestSubGroup',
        copySrc: 'source_element',
      };

      const result = BaseElementSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.channel).toBe(1);
      expect(result.groupSet).toBe(2);
      expect(result.alignment).toBe(4);
    });

    it('should parse element with numeric optional fields set to 0', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        channel: 0,
        groupSet: 0,
        alignment: 0,
      };

      const result = BaseElementSchema.parse(input);

      expect(result.channel).toBe(0);
      expect(result.groupSet).toBe(0);
      expect(result.alignment).toBe(0);
    });

    it('should parse element without optional fields', () => {
      const input = {
        elementType: 'STRUCT',
        name: 'testElement',
      };

      const result = BaseElementSchema.parse(input);

      expect(result.elementType).toBe('STRUCT');
      expect(result.name).toBe('testElement');
      expect(result.description).toBeUndefined();
      expect(result.channel).toBeUndefined();
      expect(result.groupSet).toBeUndefined();
      expect(result.alignment).toBeUndefined();
      expect(result.rtmPlotType).toBeUndefined();
      expect(result.group).toBeUndefined();
      expect(result.subGroup).toBeUndefined();
      expect(result.copySrc).toBeUndefined();
    });

    it('should allow additional properties due to passthrough', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        customField: 'customValue',
        anotherField: 123,
      };

      const result = BaseElementSchema.parse(input);

      expect(result.elementType).toBe('CONFIG');
      expect(result.name).toBe('testElement');
      expect((result as any).customField).toBe('customValue');
      expect((result as any).anotherField).toBe(123);
    });

    it('should parse element with different elementType values', () => {
      const types = ['CONFIG', 'STRUCT', 'ARRAY', 'CUSTOM'];

      for (const type of types) {
        const input = {
          elementType: type,
          name: 'testElement',
        };

        const result = BaseElementSchema.parse(input);

        expect(result.elementType).toBe(type);
      }
    });
  });

  describe('invalid data', () => {
    it('should reject element with missing elementType', () => {
      const input = {
        name: 'testElement',
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with missing name', () => {
      const input = {
        elementType: 'CONFIG',
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-string elementType', () => {
      const input = {
        elementType: 123,
        name: 'testElement',
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-string name', () => {
      const input = {
        elementType: 'CONFIG',
        name: 123,
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-string description', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        description: 123,
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-number channel', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        channel: 'invalid',
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-number groupSet', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        groupSet: 'invalid',
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-number alignment', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        alignment: 'invalid',
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-string rtmPlotType', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        rtmPlotType: 123,
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-string group', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        group: 123,
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-string subGroup', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        subGroup: 123,
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });

    it('should reject element with non-string copySrc', () => {
      const input = {
        elementType: 'CONFIG',
        name: 'testElement',
        copySrc: 123,
      };

      expect(() => BaseElementSchema.parse(input)).toThrow();
    });
  });
});
