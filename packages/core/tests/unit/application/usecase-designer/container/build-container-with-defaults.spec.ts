/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {buildContainerWithDefaults} from '../../../../../src/application/usecase-designer/container/build-container-with-defaults.js';
import {CONTAINER_PROP_ID_STACK_SIZE} from '../../../../../src/application/file-operations/shared/constants/spf-ids.js';

describe('buildContainerWithDefaults', () => {
  it('serializes non-stack container property defaults', () => {
    const container = buildContainerWithDefaults(
      {
        systemId: 1,
        containerId: 2,
        containerTypeSystemId: 3,
        fileSystemId: 4,
      },
      [
        {
          systemId: 10,
          naturalId: CONTAINER_PROP_ID_STACK_SIZE,
          elementsStructure: JSON.stringify([
            {
              elementType: 'ConfigElement',
              dataType: 'UInt32',
              defaultValue: '0',
            },
          ]),
        },
        {
          systemId: 11,
          naturalId: 99,
          elementsStructure: JSON.stringify([
            {
              elementType: 'ConfigElement',
              dataType: 'UInt32',
              defaultValue: '42',
            },
          ]),
        },
      ],
    );

    const payload = container.properties.get(11)?.getPayloadCopy();
    expect(payload).not.toBeNull();
    if (payload === null || payload === undefined) return;
    expect(new DataView(payload.buffer).getUint32(0, true)).toBe(42);
  });
});
