/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {AwspControlPortsInfoSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/control-ports-info.schema.js';

describe('AwspControlPortsInfoSchema', () => {
  describe('valid data', () => {
    it('should parse valid control ports info with no fields', () => {
      const input = {};

      const result = AwspControlPortsInfoSchema.parse(input);

      expect(result).toEqual(input);
    });

    it('should parse control ports info with staticPorts', () => {
      const input = {
        staticPorts: [{id: 1, name: 'Port1', supportedIntents: []}],
      };

      const result = AwspControlPortsInfoSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.staticPorts).toHaveLength(1);
    });

    it('should parse control ports info with dynamicIntents', () => {
      const input = {
        dynamicIntents: [{id: 1, name: 'Intent1'}],
      };

      const result = AwspControlPortsInfoSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.dynamicIntents).toHaveLength(1);
    });

    it('should parse control ports info with all fields', () => {
      const input = {
        staticPorts: [{id: 1, name: 'Port1', supportedIntents: []}],
        dynamicIntents: [{id: 1, name: 'Intent1'}],
      };

      const result = AwspControlPortsInfoSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.staticPorts).toHaveLength(1);
      expect(result.dynamicIntents).toHaveLength(1);
    });
  });

  describe('invalid data', () => {
    it('should reject data with invalid staticPorts type', () => {
      const input = {
        staticPorts: 'not-an-array',
      };

      expect(() => AwspControlPortsInfoSchema.parse(input)).toThrow();
    });

    it('should reject data with invalid dynamicIntents type', () => {
      const input = {
        dynamicIntents: 'not-an-array',
      };

      expect(() => AwspControlPortsInfoSchema.parse(input)).toThrow();
    });
  });
});
