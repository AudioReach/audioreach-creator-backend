/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {AwspDataPortsInfoSchema} from '../../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/module-definition/spf/data-ports-info.schema.js';

describe('AwspDataPortsInfoSchema', () => {
  describe('valid data', () => {
    it('should parse valid data ports info with required fields', () => {
      const input = {
        maxPortCount: 2,
      };

      const result = AwspDataPortsInfoSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.maxPortCount).toBe(2);
    });

    it('should parse data ports info with ports array', () => {
      const input = {
        maxPortCount: 2,
        ports: [{id: 1, name: 'Port1'}],
      };

      const result = AwspDataPortsInfoSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.maxPortCount).toBe(2);
      expect(result.ports).toHaveLength(1);
    });

    it('should parse data ports info with empty ports array', () => {
      const input = {
        maxPortCount: 0,
        ports: [],
      };

      const result = AwspDataPortsInfoSchema.parse(input);

      expect(result).toEqual(input);
      expect(result.maxPortCount).toBe(0);
      expect(result.ports).toHaveLength(0);
    });
  });

  describe('invalid data', () => {
    it('should reject data with missing maxPortCount', () => {
      const input = {};

      expect(() => AwspDataPortsInfoSchema.parse(input)).toThrow();
    });

    it('should reject data with invalid maxPortCount type', () => {
      const input = {
        maxPortCount: 'not-a-number',
      };

      expect(() => AwspDataPortsInfoSchema.parse(input)).toThrow();
    });

    it('should reject data with invalid ports type', () => {
      const input = {
        maxPortCount: 2,
        ports: 'not-an-array',
      };

      expect(() => AwspDataPortsInfoSchema.parse(input)).toThrow();
    });
  });
});
