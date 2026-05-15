/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {AwspTagKeyDefinition} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/tag-definition/tag-key-definition.js';

describe('AwspTagKeyDefinition serialization', () => {
  describe('fromJSON', () => {
    it('should parse valid JSON data', () => {
      const json = {
        id: 1,
        name: 'TestKey',
      };

      const key = AwspTagKeyDefinition.fromJSON(json);

      expect(key).toBeInstanceOf(AwspTagKeyDefinition);
      expect(key.id).toBe(1);
      expect(key.name).toBe('TestKey');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const key = new AwspTagKeyDefinition();
      key.id = 1;
      key.name = 'TestKey';

      const json = key.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestKey');
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const original = {
        id: 1,
        name: 'TestKey',
      };

      const key = AwspTagKeyDefinition.fromJSON(original);
      const serialized = key.toJSON();

      expect(serialized).toEqual(original);
    });
  });
});
