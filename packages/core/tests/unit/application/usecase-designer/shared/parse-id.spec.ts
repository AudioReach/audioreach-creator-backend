/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {parseId} from '../../../../../src/application/usecase-designer/shared/parse-id.js';

describe('parseId', () => {
  it.each([
    ['42', 42],
    [' 42 ', 42],
    ['0x2a', 42],
    ['0X2A', 42],
  ])('parses a complete positive ID %s', (value, expected) => {
    expect(parseId(value, 'id')).toBe(expected);
  });

  it.each(['', '0', '-1', '1.2', '1abc', '0x1g', '9007199254740992'])(
    'rejects invalid ID %s',
    value => {
      expect(() => parseId(value, 'id')).toThrow();
    },
  );
});
