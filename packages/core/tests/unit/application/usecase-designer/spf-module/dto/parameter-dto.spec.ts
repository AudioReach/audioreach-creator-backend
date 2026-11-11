/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {PropertySummaryDtoSchema} from '../../../../../../src/application/usecase-designer/spf-module/dto/parameter-dto.js';

describe('PropertySummaryDtoSchema', () => {
  it('requires and preserves the property system ID', () => {
    const parsed = PropertySummaryDtoSchema.safeParse({
      systemId: '123',
      elements: [],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({systemId: '123', elements: []});
    }
  });

  it('rejects a property write body without systemId', () => {
    expect(PropertySummaryDtoSchema.safeParse({elements: []}).success).toBe(
      false,
    );
  });
});
