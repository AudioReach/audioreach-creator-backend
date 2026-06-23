/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {HexIdSchema} from '../../../../../../../../../src/application/file-operations/shared/awsp-serializers/v1/definitions/common/hex-id.schema.js';

describe('HexIdSchema', () => {
  describe('valid inputs', () => {
    it('should accept zero as a bare number', () => {
      expect(HexIdSchema.parse(0)).toBe(0);
    });

    it('should coerce "0x00000000" to 0', () => {
      expect(HexIdSchema.parse('0x00000000')).toBe(0);
    });

    it('should coerce a positive hex string to its numeric value', () => {
      expect(HexIdSchema.parse('0x00001F40')).toBe(8000);
    });

    it('should accept a positive bare number', () => {
      expect(HexIdSchema.parse(42)).toBe(42);
    });
  });

  describe('invalid inputs', () => {
    it('should reject a negative number', () => {
      expect(() => HexIdSchema.parse(-1)).toThrow();
    });

    it('should reject a float', () => {
      expect(() => HexIdSchema.parse(1.5)).toThrow();
    });

    it('should reject a non-hex string', () => {
      expect(() => HexIdSchema.parse('not-a-hex')).toThrow();
    });

    it('should reject null', () => {
      expect(() => HexIdSchema.parse(null)).toThrow();
    });
  });
});
