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
    findSubsystemControlRouteContext: jest.fn().mockResolvedValue({
      subsystemControlLinks: options?.routeSegments ?? [],
      nodeTypeBySystemId: new Map([
        [MODULE_A, NodeType.Module],
        [MODULE_B, NodeType.Module],
        [SUBSYSTEM_A, NodeType.Subsystem],
        [SUBSYSTEM_B, NodeType.Subsystem],
      ]),
    }),
    deleteAggregate: jest.fn().mockResolvedValue(undefined),
    deleteSubsystemControlLinks: jest.fn().mockResolvedValue(undefined),
  };
  const subsystemRepository = {
    clearControlPortIntents: jest.fn().mockResolvedValue(undefined),
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

  it('retains a resolved sibling and its intents when it still reaches a module', async () => {
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
    expect(
      controlLinkRepository.deleteSubsystemControlLinks,
    ).toHaveBeenCalledWith([101], FILE_ID);
    expect(subsystemRepository.clearControlPortIntents).toHaveBeenCalledWith(
      [],
      FILE_ID,
    );
    expect(result.controlLinks).toEqual([
      {systemId: '10', subsystemLinks: [{systemId: '101'}]},
    ]);
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
    ).toHaveBeenCalledWith([201], FILE_ID);
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
    ).toHaveBeenCalledWith([301, 302], FILE_ID);
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
