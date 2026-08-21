/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {PORT_IO_TYPE} from '../../../../../../src/domain/entities/common/enums/port-io-type.js';
import {buildControlTraversalEntities} from '../../../../../../src/application/usecase-designer/control-links/create/build-control-traversal-entities.js';

describe('buildControlTraversalEntities', () => {
  it('allocates one non-static control port per traversed boundary node', async () => {
    let nextId = 100;
    const result = await buildControlTraversalEntities(
      [
        {
          sourceNodeSystemId: 1,
          destinationNodeSystemId: 10,
          sourceBoundaryPortType: null,
          destBoundaryPortType: PORT_IO_TYPE.OutputInput,
          position: 0,
        },
        {
          sourceNodeSystemId: 10,
          destinationNodeSystemId: 20,
          sourceBoundaryPortType: PORT_IO_TYPE.OutputInput,
          destBoundaryPortType: PORT_IO_TYPE.InputOutput,
          position: 1,
        },
        {
          sourceNodeSystemId: 20,
          destinationNodeSystemId: 2,
          sourceBoundaryPortType: PORT_IO_TYPE.InputOutput,
          destBoundaryPortType: null,
          position: 2,
        },
      ],
      11,
      12,
      13,
      'NORMAL',
      1,
      {getNextId: async () => ++nextId},
    );

    expect(result.controlPorts).toEqual([
      expect.objectContaining({
        systemId: 101,
        naturalId: 1,
        name: '',
        isStatic: false,
        nodeSystemId: 10,
        intentIds: [],
      }),
      expect.objectContaining({
        systemId: 102,
        naturalId: 1,
        name: '',
        isStatic: false,
        nodeSystemId: 20,
        intentIds: [],
      }),
    ]);
    expect(
      result.subsystemControlLinks.map(link => [
        link.peerNodeASystemId,
        link.peerNodeBSystemId,
        link.nodeAPortSystemId,
        link.nodeBPortSystemId,
      ]),
    ).toEqual([
      [1, 10, 11, 101],
      [10, 20, 101, 102],
      [20, 2, 102, 12],
    ]);
  });
});
