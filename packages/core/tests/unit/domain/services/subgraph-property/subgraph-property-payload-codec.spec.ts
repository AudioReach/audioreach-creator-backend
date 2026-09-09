/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {encodeVsidPayload} from '../../../../../src/domain/services/subgraph-property/subgraph-property-payload-codec.js';

describe('encodeVsidPayload', () => {
  it('encodes a little-endian UInt32 and 8-byte aligns the payload', () => {
    expect([...encodeVsidPayload(0x12345678)]).toEqual([
      0x78, 0x56, 0x34, 0x12, 0, 0, 0, 0,
    ]);
  });
});
