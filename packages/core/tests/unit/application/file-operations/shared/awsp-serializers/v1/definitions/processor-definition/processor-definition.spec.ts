/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {ProcessorDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/processor-definition/processor-definition.js';

describe('ProcessorDefinition serialization', () => {
  describe('fromJSON', () => {
    it('should parse valid JSON data', () => {
      const json = {
        id: 1,
        name: 'TestProcessor',
      };

      const processor = ProcessorDefinition.fromJSON(json);

      expect(processor).toBeInstanceOf(ProcessorDefinition);
      expect(processor.id).toBe(1);
      expect(processor.name).toBe('TestProcessor');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const processor = new ProcessorDefinition();
      processor.id = 1;
      processor.name = 'TestProcessor';

      const json = processor.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestProcessor');
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const original = {
        id: 1,
        name: 'TestProcessor',
      };

      const processor = ProcessorDefinition.fromJSON(original);
      const serialized = processor.toJSON();

      expect(serialized).toEqual(original);
    });
  });
});
