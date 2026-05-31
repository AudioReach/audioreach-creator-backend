/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {BinaryUtils} from '../../../../src/shared/utilities/binary-utils.js';

describe('BinaryUtils - Array Extensions', () => {
  describe('writeUint32Array', () => {
    it('should write array of uint32 values', () => {
      const buffer = new ArrayBuffer(12);
      const view = new DataView(buffer);
      const values = [100, 200, 300];

      BinaryUtils.writeUint32Array(view, 0, values);

      expect(BinaryUtils.readUint32(view, 0)).toBe(100);
      expect(BinaryUtils.readUint32(view, 4)).toBe(200);
      expect(BinaryUtils.readUint32(view, 8)).toBe(300);
    });

    it('should write empty array', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);

      BinaryUtils.writeUint32Array(view, 0, []);

      // No values written, buffer should remain unchanged
      expect(BinaryUtils.readUint32(view, 0)).toBe(0);
    });

    it('should write at specified offset', () => {
      const buffer = new ArrayBuffer(20);
      const view = new DataView(buffer);
      const values = [111, 222];

      BinaryUtils.writeUint32Array(view, 8, values);

      expect(BinaryUtils.readUint32(view, 0)).toBe(0); // Before offset
      expect(BinaryUtils.readUint32(view, 8)).toBe(111);
      expect(BinaryUtils.readUint32(view, 12)).toBe(222);
    });
  });

  describe('calculateUint32ArraySize', () => {
    it('should calculate size for array', () => {
      expect(BinaryUtils.calculateUint32ArraySize([1, 2, 3])).toBe(12);
      expect(BinaryUtils.calculateUint32ArraySize([1])).toBe(4);
      expect(BinaryUtils.calculateUint32ArraySize([])).toBe(0);
    });
  });
});
