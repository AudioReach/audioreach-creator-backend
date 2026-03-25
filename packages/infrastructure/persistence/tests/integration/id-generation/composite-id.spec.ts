/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  makeCompositeId,
  FILE_ID_MODULUS,
  MAX_FILE_ID,
  MAX_SEQ,
} from '../../../src/id-generation/composite-id.js';

describe('makeCompositeId', () => {
  describe('encoding formula', () => {
    it('encodes seq=1, fileId=1 as FILE_ID_MODULUS + 1', () => {
      expect(makeCompositeId(1, 1)).toBe(FILE_ID_MODULUS + 1);
    });

    it('encodes seq=2, fileId=1 as 2 * FILE_ID_MODULUS + 1', () => {
      expect(makeCompositeId(1, 2)).toBe(2 * FILE_ID_MODULUS + 1);
    });

    it('encodes seq=1, fileId=MAX_FILE_ID correctly', () => {
      expect(makeCompositeId(MAX_FILE_ID, 1)).toBe(
        FILE_ID_MODULUS + MAX_FILE_ID,
      );
    });

    it('result at MAX_SEQ and fileId=1 is a safe integer', () => {
      const id = makeCompositeId(1, MAX_SEQ);
      expect(Number.isSafeInteger(id)).toBe(true);
    });
  });

  describe('file isolation', () => {
    it('same seq, different fileId → different IDs', () => {
      expect(makeCompositeId(1, 1)).not.toBe(makeCompositeId(2, 1));
    });

    it('same fileId, different seq → different IDs', () => {
      expect(makeCompositeId(1, 1)).not.toBe(makeCompositeId(1, 2));
    });

    it('IDs for different files never collide across the full seq range', () => {
      // fileId is encoded in the lower bits — two files with adjacent fileIds
      // and adjacent seqs must still produce distinct IDs
      const id_f1_s1 = makeCompositeId(1, 1);
      const id_f2_s1 = makeCompositeId(2, 1);
      const id_f1_s2 = makeCompositeId(1, 2);
      const ids = new Set([id_f1_s1, id_f2_s1, id_f1_s2]);
      expect(ids.size).toBe(3);
    });
  });

  describe('range guards', () => {
    it('throws RangeError for fileId = 0', () => {
      expect(() => makeCompositeId(0, 1)).toThrow(RangeError);
    });

    it('throws RangeError for fileId < 0', () => {
      expect(() => makeCompositeId(-1, 1)).toThrow(RangeError);
    });

    it('throws RangeError for fileId > MAX_FILE_ID', () => {
      expect(() => makeCompositeId(MAX_FILE_ID + 1, 1)).toThrow(RangeError);
    });

    it('throws RangeError for seq = 0', () => {
      expect(() => makeCompositeId(1, 0)).toThrow(RangeError);
    });

    it('throws RangeError for seq < 0', () => {
      expect(() => makeCompositeId(1, -1)).toThrow(RangeError);
    });

    it('throws RangeError for seq > MAX_SEQ', () => {
      expect(() => makeCompositeId(1, MAX_SEQ + 1)).toThrow(RangeError);
    });

    it('throws RangeError for non-integer fileId', () => {
      expect(() => makeCompositeId(1.5, 1)).toThrow(RangeError);
    });

    it('throws RangeError for non-integer seq', () => {
      expect(() => makeCompositeId(1, 1.5)).toThrow(RangeError);
    });
  });
});
