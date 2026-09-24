/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {LINK_DELETION_MODE, NodeType} from '@arc/core';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import {ControlLinkDeletionService} from '../../../../../../src/application/usecase-designer/control-links/delete/control-link-deletion.service.js';

const FILE_ID = 7;
const MODULE_A = 1;
const MODULE_B = 2;
const SUBSYSTEM_A = 20;
const SUBSYSTEM_B = 30;

const segment = (
  systemId: number,
  peerNodeASystemId: number,
  peerNodeBSystemId: number,
  controlLinkSystemId: number | null = null,
) => ({
  systemId,
  peerNodeASystemId,
  peerNodeBSystemId,
  nodeAPortSystemId: systemId * 10,
  nodeBPortSystemId: systemId * 10 + 1,
  controlLinkSystemId,
  fileSystemId: FILE_ID,
  version: 1,
});

function createFixture(options?: {
  controlLinks?: Array<{
    systemId: number;
    subsystemControlLinks: ReturnType<typeof segment>[];
  }>;
  reachableUnresolved?: ReturnType<typeof segment>[];
  routeSegments?: ReturnType<typeof segment>[];
}) {
  const controlLinkRepository = {
    findLinksConnectedToModule: jest
      .fn()
      .mockResolvedValue(options?.controlLinks ?? []),
    findUnresolvedSubsystemLinksFromModule: jest
      .fn()
      .mockResolvedValue(options?.reachableUnresolved ?? []),
    findAllLinks: jest.fn().mockResolvedValue({
      controlLinks: options?.controlLinks ?? [],
      standaloneSubsystemControlLinks: options?.routeSegments ?? [],
    }),
    deleteAggregate: jest.fn().mockResolvedValue(undefined),
    deleteCanonical: jest.fn().mockResolvedValue(undefined),
    deleteSubsystemControlLinks: jest.fn().mockResolvedValue(undefined),
    detachSubsystemControlLinks: jest.fn().mockResolvedValue(undefined),
  };
  const subsystemRepository = {
    clearControlPortIntents: jest.fn().mockResolvedValue(undefined),
    getAllNodesWithParents: jest.fn().mockResolvedValue([
      {systemId: MODULE_A, parentSystemId: null, type: NodeType.Module},
      {systemId: MODULE_B, parentSystemId: null, type: NodeType.Module},
      {systemId: SUBSYSTEM_A, parentSystemId: null, type: NodeType.Subsystem},
      {systemId: SUBSYSTEM_B, parentSystemId: null, type: NodeType.Subsystem},
    ]),
  };
  const uow = {
    getControlLinkRepository: () => controlLinkRepository,
    getSubsystemRepository: () => subsystemRepository,
  } as unknown as UnitOfWork;

  return {
    service: new ControlLinkDeletionService(uow),
    controlLinkRepository,
    subsystemRepository,
  };
}

describe('ControlLinkDeletionService', () => {
  it('deletes a canonical control link by system ID and clears detached intents', async () => {
    const resolvedSegments = [
      segment(101, MODULE_A, SUBSYSTEM_A, 10),
      segment(102, SUBSYSTEM_A, MODULE_B, 10),
    ];
    const {service, controlLinkRepository, subsystemRepository} = createFixture(
      {
        controlLinks: [{systemId: 10, subsystemControlLinks: resolvedSegments}],
      },
    );

    const result = await service.deleteBySystemId(10, FILE_ID);

    expect(result).toEqual({
      deleted: {
        controlLinks: [{systemId: '10'}],
        subsystemControlLinks: [{systemId: '101'}, {systemId: '102'}],
      },
      updated: {
        subsystems: [
          {
            systemId: '20',
            intentsClearedControlPorts: [
              {systemId: '1011'},
              {systemId: '1020'},
            ],
          },
        ],
      },
    });
    expect(controlLinkRepository.deleteAggregate).toHaveBeenCalledWith(
      10,
      FILE_ID,
    );
    expect(subsystemRepository.clearControlPortIntents).toHaveBeenCalledWith(
      [
        {subsystemSystemId: SUBSYSTEM_A, controlPortSystemId: 1011},
        {subsystemSystemId: SUBSYSTEM_A, controlPortSystemId: 1020},
      ],
      FILE_ID,
    );
  });

  it('deletes a resolved segment by system ID and detaches its siblings', async () => {
    const resolvedSegments = [
      segment(101, MODULE_A, SUBSYSTEM_A, 10),
      segment(102, SUBSYSTEM_A, MODULE_B, 10),
    ];
    const {service, controlLinkRepository, subsystemRepository} = createFixture(
      {
        controlLinks: [{systemId: 10, subsystemControlLinks: resolvedSegments}],
      },
    );

    const result = await service.deleteBySystemId(101, FILE_ID);

    expect(result).toEqual({
      deleted: {
        controlLinks: [{systemId: '10'}],
        subsystemControlLinks: [{systemId: '101'}],
      },
      updated: {subsystems: []},
    });
    expect(
      controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith([resolvedSegments[0]], FILE_ID);
    expect(controlLinkRepository.deleteCanonical).toHaveBeenCalledWith(
      10,
      FILE_ID,
    );
    expect(
      controlLinkRepository.detachSubsystemControlLinks,
    ).toHaveBeenCalledWith([resolvedSegments[1]], FILE_ID);
    expect(subsystemRepository.clearControlPortIntents).toHaveBeenCalledWith(
      [],
      FILE_ID,
    );
  });

  it('deletes an unresolved segment by system ID without a canonical delete', async () => {
    const unresolved = segment(201, MODULE_A, SUBSYSTEM_A);
    const {service, controlLinkRepository, subsystemRepository} = createFixture(
      {
        routeSegments: [unresolved],
      },
    );

    const result = await service.deleteBySystemId(201, FILE_ID);

    expect(result).toEqual({
      deleted: {
        controlLinks: [],
        subsystemControlLinks: [{systemId: '201'}],
      },
      updated: {
        subsystems: [
          {
            systemId: '20',
            intentsClearedControlPorts: [{systemId: '2011'}],
          },
        ],
      },
    });
    expect(
      controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith([unresolved], FILE_ID);
    expect(controlLinkRepository.deleteCanonical).not.toHaveBeenCalled();
    expect(subsystemRepository.clearControlPortIntents).toHaveBeenCalledWith(
      [{subsystemSystemId: SUBSYSTEM_A, controlPortSystemId: 2011}],
      FILE_ID,
    );
  });

  it('deletes a resolved route as an aggregate in full mode', async () => {
    const resolvedSegments = [
      segment(101, MODULE_A, SUBSYSTEM_A, 10),
      segment(102, SUBSYSTEM_A, MODULE_B, 10),
    ];
    const {service, controlLinkRepository} = createFixture({
      controlLinks: [{systemId: 10, subsystemControlLinks: resolvedSegments}],
      routeSegments: resolvedSegments,
    });

    const result = await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.Full,
    );

    expect(controlLinkRepository.deleteAggregate).toHaveBeenCalledWith(
      10,
      FILE_ID,
    );
    expect(result.controlLinks).toEqual([
      {
        systemId: '10',
        subsystemLinks: [{systemId: '101'}, {systemId: '102'}],
      },
    ]);
  });

  it('deletes the canonical link and detaches resolved siblings in segmentOnly mode', async () => {
    const resolvedSegments = [
      segment(101, MODULE_A, SUBSYSTEM_A, 10),
      segment(102, SUBSYSTEM_A, MODULE_B, 10),
    ];
    const {service, controlLinkRepository, subsystemRepository} = createFixture(
      {
        controlLinks: [{systemId: 10, subsystemControlLinks: resolvedSegments}],
        routeSegments: resolvedSegments,
      },
    );

    const result = await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(controlLinkRepository.deleteAggregate).not.toHaveBeenCalled();
    expect(controlLinkRepository.deleteCanonical).toHaveBeenCalledWith(
      10,
      FILE_ID,
    );
    expect(
      controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith([resolvedSegments[0]], FILE_ID);
    expect(
      controlLinkRepository.detachSubsystemControlLinks,
    ).toHaveBeenCalledWith([resolvedSegments[1]], FILE_ID);
    expect(subsystemRepository.clearControlPortIntents).toHaveBeenCalledWith(
      [],
      FILE_ID,
    );
    expect(result.controlLinks).toEqual([
      {systemId: '10', subsystemLinks: [{systemId: '101'}]},
    ]);
  });

  it('deletes the canonical link when its only segment is removed in segmentOnly mode', async () => {
    const resolvedSegment = segment(103, MODULE_A, MODULE_B, 10);
    const {service, controlLinkRepository} = createFixture({
      controlLinks: [{systemId: 10, subsystemControlLinks: [resolvedSegment]}],
      routeSegments: [resolvedSegment],
    });

    await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(controlLinkRepository.deleteCanonical).toHaveBeenCalledWith(
      10,
      FILE_ID,
    );
    expect(
      controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith([resolvedSegment], FILE_ID);
    expect(
      controlLinkRepository.detachSubsystemControlLinks,
    ).toHaveBeenCalledWith([], FILE_ID);
  });

  it('deletes only the module-incident segment of a complete unresolved chain in segmentOnly mode', async () => {
    const unresolved = [
      segment(201, MODULE_A, SUBSYSTEM_A),
      segment(202, SUBSYSTEM_A, MODULE_B),
    ];
    const {service, controlLinkRepository} = createFixture({
      reachableUnresolved: unresolved,
      routeSegments: unresolved,
    });

    const result = await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(
      controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith([unresolved[0]], FILE_ID);
    expect(result.unresolvedSubsystemControlLinks).toEqual([{systemId: '201'}]);
  });

  it('deletes every segment in an incomplete unresolved chain regardless of mode', async () => {
    const unresolved = [
      segment(301, MODULE_A, SUBSYSTEM_A),
      segment(302, SUBSYSTEM_A, SUBSYSTEM_B),
    ];
    const {service, controlLinkRepository} = createFixture({
      reachableUnresolved: unresolved,
      routeSegments: unresolved,
    });

    await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(
      controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith(unresolved, FILE_ID);
  });

  it('clears intents when the retained sibling no longer reaches a module', async () => {
    const resolvedSegments = [
      segment(401, MODULE_A, SUBSYSTEM_A, 10),
      segment(402, SUBSYSTEM_A, SUBSYSTEM_B, 10),
    ];
    const {service, subsystemRepository} = createFixture({
      controlLinks: [{systemId: 10, subsystemControlLinks: resolvedSegments}],
      routeSegments: resolvedSegments,
    });

    await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(subsystemRepository.clearControlPortIntents).toHaveBeenCalledWith(
      [
        {subsystemSystemId: SUBSYSTEM_A, controlPortSystemId: 4011},
        {subsystemSystemId: SUBSYSTEM_A, controlPortSystemId: 4020},
        {subsystemSystemId: SUBSYSTEM_B, controlPortSystemId: 4021},
      ],
      FILE_ID,
    );
  });
});
