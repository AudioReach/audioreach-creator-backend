/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';
import {NodeType} from '../../../../../../src/domain/entities/usecase-data/node/node.js';
import {Subsystem} from '../../../../../../src/domain/entities/usecase-data/subsystem/subsystem.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {rebuildMoveSubsystemImpact} from '../../../../../../src/application/usecase-designer/subsystem/move/move-subsystem-impact.js';

describe('rebuildMoveSubsystemImpact', () => {
  it('rebuilds a data-link route and reports the new subsystem port', async () => {
    const link = new DataLink({
      systemId: 50,
      sourceNodeSystemId: 1,
      destinationNodeSystemId: 2,
      sourcePortSystemId: 101,
      destinationPortSystemId: 201,
      linkType: LINK_TYPE.IntraUsecase,
      sourceSubgraphSystemId: 11,
      destSubgraphSystemId: 22,
      fileSystemId: 7,
    });
    const addedPorts: unknown[] = [];
    const replacedSegments: unknown[] = [];
    const subsystem = new Subsystem({
      systemId: 10,
      fileSystemId: 7,
      parentId: undefined,
      name: 'S1',
      subsystemId: 1,
      filteredKeySystemIds: [],
      dataPorts: [],
      controlPorts: [],
    });
    const result = await rebuildMoveSubsystemImpact(
      7,
      [
        {systemId: 1, parentId: null, type: NodeType.Module},
        {systemId: 2, parentId: null, type: NodeType.Module},
        {systemId: 10, parentId: null, type: NodeType.Subsystem},
      ],
      [{systemId: 1, parentSystemId: 10}],
      [],
      {
        subsystemRepository: {
          findSubsystemForPatch: jest.fn().mockResolvedValue(subsystem),
          addDataPort: jest.fn().mockImplementation(port => {
            addedPorts.push(port);
          }),
          addControlPort: jest.fn(),
          removeDataPort: jest.fn(),
          removeControlPort: jest.fn(),
        } as never,
        dataLinkRepository: {
          findAllWithSegments: jest.fn().mockResolvedValue([link]),
          replaceSubsystemDataLinkSegments: jest
            .fn()
            .mockImplementation((_id, segments) => {
              replacedSegments.push(segments);
            }),
        } as never,
        controlLinkRepository: {
          findAllWithSegments: jest.fn().mockResolvedValue([] as ControlLink[]),
          replaceSubsystemControlLinkSegments: jest.fn(),
        } as never,
        idGeneration: {
          getNextId: jest
            .fn()
            .mockResolvedValueOnce(1000)
            .mockResolvedValueOnce(1001),
        } as never,
      },
    );

    expect(result.addedDataLinks).toEqual([link]);
    expect(result.removedDataLinks).toEqual([]);
    expect(result.subsystemPortChanges[0]?.systemId).toBe(10);
    expect(result.subsystemPortChanges[0]?.addedDataPorts).toHaveLength(1);
    expect(addedPorts).toHaveLength(1);
    expect(replacedSegments).toHaveLength(1);
    expect(
      (replacedSegments[0] as Array<{sourceNodeSystemId: number}>)[0],
    ).toMatchObject({
      sourceNodeSystemId: 1,
    });
  });
});
