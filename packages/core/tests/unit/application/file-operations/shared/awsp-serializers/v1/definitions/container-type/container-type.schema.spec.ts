/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {ContainerTypeSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/container-type/container-type.schema.js';

describe('ContainerTypeSchema', () => {
  describe('valid data', () => {
    it('should parse valid container type with all required fields', () => {
      const input = {
        id: 1,
        name: 'Container1',
      };

      const result = ContainerTypeSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'Container1',
      });
    });

    it('should parse container type with positive integer id', () => {
      const input = {
        id: 999,
        name: 'TestContainer',
      };

      const result = ContainerTypeSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestContainer');
    });
  });

  describe('invalid data', () => {
    it('should reject container type with missing id', () => {
      const input = {
        name: 'Container1',
      };

      expect(() => ContainerTypeSchema.parse(input)).toThrow();
    });

    it('should reject container type with missing name', () => {
      const input = {
        id: 1,
      };

      expect(() => ContainerTypeSchema.parse(input)).toThrow();
    });

    it('should reject container type with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'Container1',
      };

      expect(() => ContainerTypeSchema.parse(input)).toThrow();
    });

    it('should reject container type with negative id', () => {
      const input = {
        id: -1,
        name: 'Container1',
      };

      expect(() => ContainerTypeSchema.parse(input)).toThrow();
    });

    it('should reject container type with zero id', () => {
      const input = {
        id: 0,
        name: 'Container1',
      };

      expect(() => ContainerTypeSchema.parse(input)).toThrow();
    });

    it('should reject container type with empty name', () => {
      const input = {
        id: 1,
        name: '',
      };

      expect(() => ContainerTypeSchema.parse(input)).toThrow();
    });

    it('should reject container type with non-string name', () => {
      const input = {
        id: 1,
        name: 123,
      };

      expect(() => ContainerTypeSchema.parse(input)).toThrow();
    });
  });
});
