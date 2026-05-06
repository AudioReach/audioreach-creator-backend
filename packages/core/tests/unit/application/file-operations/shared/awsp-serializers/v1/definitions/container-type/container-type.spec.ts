/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {ContainerType} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/container-type/container-type.js';

describe('ContainerType serialization', () => {
  describe('fromJSON', () => {
    it('should parse valid JSON data', () => {
      const json = {
        id: 1,
        name: 'TestContainer',
      };

      const container = ContainerType.fromJSON(json);

      expect(container).toBeInstanceOf(ContainerType);
      expect(container.id).toBe(1);
      expect(container.name).toBe('TestContainer');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const container = new ContainerType();
      container.id = 1;
      container.name = 'TestContainer';

      const json = container.toJSON();

      expect(json.id).toBe(1);
      expect(json.name).toBe('TestContainer');
    });
  });

  describe('round-trip', () => {
    it('should preserve data through parse and serialize', () => {
      const original = {
        id: 1,
        name: 'TestContainer',
      };

      const container = ContainerType.fromJSON(original);
      const serialized = container.toJSON();

      expect(serialized).toEqual(original);
    });
  });
});
