/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {ProcessorDefinitionSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/processor-definition/processor-definition.schema.js';

describe('ProcessorDefinitionSchema', () => {
  describe('valid data', () => {
    it('should parse valid processor definition with all required fields', () => {
      const input = {
        id: 1,
        name: 'Processor1',
      };

      const result = ProcessorDefinitionSchema.parse(input);

      expect(result).toEqual({
        id: 1,
        name: 'Processor1',
      });
    });

    it('should parse processor definition with positive integer id', () => {
      const input = {
        id: 999,
        name: 'TestProcessor',
      };

      const result = ProcessorDefinitionSchema.parse(input);

      expect(result.id).toBe(999);
      expect(result.name).toBe('TestProcessor');
    });
  });

  describe('invalid data', () => {
    it('should reject processor definition with missing id', () => {
      const input = {
        name: 'Processor1',
      };

      expect(() => ProcessorDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject processor definition with missing name', () => {
      const input = {
        id: 1,
      };

      expect(() => ProcessorDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject processor definition with non-integer id', () => {
      const input = {
        id: 1.5,
        name: 'Processor1',
      };

      expect(() => ProcessorDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject processor definition with negative id', () => {
      const input = {
        id: -1,
        name: 'Processor1',
      };

      expect(() => ProcessorDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject processor definition with zero id', () => {
      const input = {
        id: 0,
        name: 'Processor1',
      };

      expect(() => ProcessorDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject processor definition with empty name', () => {
      const input = {
        id: 1,
        name: '',
      };

      expect(() => ProcessorDefinitionSchema.parse(input)).toThrow();
    });

    it('should reject processor definition with non-string name', () => {
      const input = {
        id: 1,
        name: 123,
      };

      expect(() => ProcessorDefinitionSchema.parse(input)).toThrow();
    });
  });
});
