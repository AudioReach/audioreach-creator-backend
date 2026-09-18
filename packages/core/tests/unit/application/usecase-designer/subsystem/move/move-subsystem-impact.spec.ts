/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/link-type.js';
import {PORT_IO_TYPE} from '../../../../../../src/domain/entities/common/enums/port-io-type.js';
import {NodeType} from '../../../../../../src/domain/entities/usecase-data/node/node.js';
import {Subsystem} from '../../../../../../src/domain/entities/usecase-data/subsystem/subsystem.js';
import {DataPort} from '../../../../../../src/domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../../../src/domain/entities/usecase-data/node/entities/control-port.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {SubsystemControlLink} from '../../../../../../src/domain/entities/usecase-data/links/subsystem-control-link.js';
import {SubsystemDataLink} from '../../../../../../src/domain/entities/usecase-data/links/subsystem-data-link.js';
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
          findSubsystemDataRouteContext: jest.fn().mockResolvedValue({
            subsystemDataLinks: [],
            nodeTypeBySystemId: new Map(),
          }),
          deleteSubsystemDataLinks: jest.fn(),
          replaceSubsystemDataLinkSegments: jest
            .fn()
            .mockImplementation((_id, segments) => {
              replacedSegments.push(segments);
            }),
          replaceUnresolvedSubsystemDataLinkSegments: jest.fn(),
        } as never,
        controlLinkRepository: {
          findAllWithSegments: jest.fn().mockResolvedValue([] as ControlLink[]),
          findSubsystemControlRouteContext: jest.fn().mockResolvedValue({
            subsystemControlLinks: [],
            nodeTypeBySystemId: new Map(),
          }),
          deleteSubsystemControlLinks: jest.fn(),
          replaceSubsystemControlLinkSegments: jest.fn(),
          replaceUnresolvedSubsystemControlLinkSegments: jest.fn(),
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

  it('rebuilds affected unresolved data and control chains without touching unrelated chains', async () => {
    const unresolvedData = [
      new SubsystemDataLink({
        systemId: 101,
        sourceNodeSystemId: 1,
        destinationNodeSystemId: 10,
        sourcePortSystemId: 1,
        destinationPortSystemId: 2,
        dataLinkSystemId: null,
        fileSystemId: 7,
      }),
      new SubsystemDataLink({
        systemId: 102,
        sourceNodeSystemId: 10,
        destinationNodeSystemId: 20,
        sourcePortSystemId: 3,
        destinationPortSystemId: 4,
        dataLinkSystemId: null,
        fileSystemId: 7,
      }),
      new SubsystemDataLink({
        systemId: 103,
        sourceNodeSystemId: 20,
        destinationNodeSystemId: 40,
        sourcePortSystemId: 5,
        destinationPortSystemId: 6,
        dataLinkSystemId: null,
        fileSystemId: 7,
      }),
      new SubsystemDataLink({
        systemId: 201,
        sourceNodeSystemId: 2,
        destinationNodeSystemId: 3,
        sourcePortSystemId: 7,
        destinationPortSystemId: 8,
        dataLinkSystemId: null,
        fileSystemId: 7,
      }),
    ];
    const unresolvedControl = [
      new SubsystemControlLink(301, 1, 10, 1, 2, null, 7, 0),
      new SubsystemControlLink(302, 10, 20, 3, 4, null, 7, 0),
      new SubsystemControlLink(303, 20, 40, 5, 6, null, 7, 0),
      new SubsystemControlLink(401, 2, 3, 7, 8, null, 7, 0),
    ];
    const replaceDataLinks = jest.fn();
    const replaceControlLinks = jest.fn();

    await rebuildMoveSubsystemImpact(
      7,
      [
        {systemId: 1, parentId: 10, type: NodeType.Module},
        {systemId: 10, parentId: 20, type: NodeType.Subsystem},
        {systemId: 20, parentId: null, type: NodeType.Subsystem},
        {systemId: 2, parentId: 30, type: NodeType.Module},
        {systemId: 3, parentId: 30, type: NodeType.Module},
        {systemId: 30, parentId: null, type: NodeType.Subsystem},
        {systemId: 40, parentId: null, type: NodeType.Subsystem},
      ],
      [],
      [{systemId: 10, parentSystemId: 40}],
      {
        subsystemRepository: {
          findSubsystemForPatch: jest.fn().mockResolvedValue(
            new Subsystem({
              systemId: 10,
              fileSystemId: 7,
              parentId: 20,
              name: 'S1',
              subsystemId: 1,
              filteredKeySystemIds: [],
              dataPorts: [
                new DataPort({
                  systemId: 3,
                  naturalId: 1,
                  portIoType: PORT_IO_TYPE.OutputInput,
                  isStatic: false,
                  name: 'S1 data',
                }),
                new DataPort({
                  systemId: 5,
                  naturalId: 2,
                  portIoType: PORT_IO_TYPE.OutputInput,
                  isStatic: false,
                  name: 'S2 data',
                }),
              ],
              controlPorts: [
                new ControlPort({
                  systemId: 3,
                  naturalId: 1,
                  isStatic: false,
                  nodeSystemId: 10,
                  name: 'S1 control',
                  intentSystemIds: [],
                }),
                new ControlPort({
                  systemId: 5,
                  naturalId: 2,
                  isStatic: false,
                  nodeSystemId: 20,
                  name: 'S2 control',
                  intentSystemIds: [],
                }),
              ],
            }),
          ),
          addDataPort: jest.fn(),
          addControlPort: jest.fn(),
          removeDataPort: jest.fn(),
          removeControlPort: jest.fn(),
        } as never,
        dataLinkRepository: {
          findAllWithSegments: jest.fn().mockResolvedValue([]),
          findSubsystemDataRouteContext: jest.fn().mockResolvedValue({
            subsystemDataLinks: unresolvedData,
            nodeTypeBySystemId: new Map([
              [1, NodeType.Module],
              [10, NodeType.Subsystem],
              [20, NodeType.Subsystem],
              [40, NodeType.Subsystem],
              [2, NodeType.Module],
              [3, NodeType.Module],
            ]),
          }),
          deleteSubsystemDataLinks: jest.fn(),
          replaceUnresolvedSubsystemDataLinkSegments: replaceDataLinks,
          replaceSubsystemDataLinkSegments: jest.fn(),
        } as never,
        controlLinkRepository: {
          findAllWithSegments: jest.fn().mockResolvedValue([] as ControlLink[]),
          findSubsystemControlRouteContext: jest.fn().mockResolvedValue({
            subsystemControlLinks: unresolvedControl,
            nodeTypeBySystemId: new Map([
              [1, NodeType.Module],
              [10, NodeType.Subsystem],
              [20, NodeType.Subsystem],
              [40, NodeType.Subsystem],
              [2, NodeType.Module],
              [3, NodeType.Module],
            ]),
          }),
          deleteSubsystemControlLinks: jest.fn(),
          replaceUnresolvedSubsystemControlLinkSegments: replaceControlLinks,
          replaceSubsystemControlLinkSegments: jest.fn(),
        } as never,
        idGeneration: {getNextId: jest.fn()} as never,
      },
    );

    expect(replaceDataLinks).toHaveBeenCalledWith(
      [101, 102, 103],
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeSystemId: 1,
          destinationNodeSystemId: 10,
        }),
        expect.objectContaining({
          sourceNodeSystemId: 10,
          destinationNodeSystemId: 40,
        }),
      ]),
      7,
    );
    expect(replaceControlLinks).toHaveBeenCalledWith(
      [301, 302, 303],
      expect.arrayContaining([
        expect.objectContaining({
          peerNodeASystemId: 1,
          peerNodeBSystemId: 10,
        }),
        expect.objectContaining({
          peerNodeASystemId: 10,
          peerNodeBSystemId: 40,
        }),
      ]),
      7,
    );
  });
});
