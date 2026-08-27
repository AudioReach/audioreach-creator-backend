/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {LINK_DELETION_MODE, NodeType} from '@arc/core';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import {DataLinkDeletionService} from '../../../../../../src/application/usecase-designer/data-links/delete/data-link-deletion.service.js';

const FILE_ID = 7;
const MODULE_A = 1;
const MODULE_B = 2;
const SUBSYSTEM_A = 20;
const SUBSYSTEM_B = 30;

const segment = (
  systemId: number,
  sourceNodeSystemId: number,
  destinationNodeSystemId: number,
  dataLinkSystemId: number | null = null,
) => ({
  systemId,
  sourceNodeSystemId,
  destinationNodeSystemId,
  sourcePortSystemId: systemId * 10,
  destinationPortSystemId: systemId * 10 + 1,
  dataLinkSystemId,
  fileSystemId: FILE_ID,
});

function createFixture(options?: {
  dataLinks?: Array<{
    systemId: number;
    subsystemDataLinks: ReturnType<typeof segment>[];
  }>;
  reachableUnresolved?: ReturnType<typeof segment>[];
  routeSegments?: ReturnType<typeof segment>[];
}) {
  const dataLinkRepository = {
    findLinksConnectedToModule: jest
      .fn()
      .mockResolvedValue(options?.dataLinks ?? []),
    findUnresolvedSubsystemLinksFromModule: jest
      .fn()
      .mockResolvedValue(options?.reachableUnresolved ?? []),
    findSubsystemDataRouteContext: jest.fn().mockResolvedValue({
      subsystemDataLinks: options?.routeSegments ?? [],
      nodeTypeBySystemId: new Map([
        [MODULE_A, NodeType.Module],
        [MODULE_B, NodeType.Module],
        [SUBSYSTEM_A, NodeType.Subsystem],
        [SUBSYSTEM_B, NodeType.Subsystem],
      ]),
    }),
    deleteAggregate: jest.fn().mockResolvedValue(undefined),
    deleteSubsystemDataLinks: jest.fn().mockResolvedValue(undefined),
  };
  const uow = {
    getDataLinkRepository: () => dataLinkRepository,
  } as unknown as UnitOfWork;

  return {service: new DataLinkDeletionService(uow), dataLinkRepository};
}

describe('DataLinkDeletionService', () => {
  it('deletes a resolved route as an aggregate in full mode', async () => {
    const resolvedSegments = [
      segment(101, MODULE_A, SUBSYSTEM_A, 10),
      segment(102, SUBSYSTEM_A, MODULE_B, 10),
    ];
    const {service, dataLinkRepository} = createFixture({
      dataLinks: [{systemId: 10, subsystemDataLinks: resolvedSegments}],
    });

    const result = await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.Full,
    );

    expect(dataLinkRepository.deleteAggregate).toHaveBeenCalledWith(
      10,
      FILE_ID,
    );
    expect(dataLinkRepository.deleteSubsystemDataLinks).toHaveBeenCalledWith(
      [],
      FILE_ID,
    );
    expect(result.dataLinks).toEqual([
      {
        systemId: '10',
        subsystemLinks: [{systemId: '101'}, {systemId: '102'}],
      },
    ]);
  });

  it('deletes only module-incident resolved segments in segmentOnly mode', async () => {
    const resolvedSegments = [
      segment(101, MODULE_A, SUBSYSTEM_A, 10),
      segment(102, SUBSYSTEM_A, MODULE_B, 10),
    ];
    const {service, dataLinkRepository} = createFixture({
      dataLinks: [{systemId: 10, subsystemDataLinks: resolvedSegments}],
    });

    const result = await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(dataLinkRepository.deleteAggregate).not.toHaveBeenCalled();
    expect(dataLinkRepository.deleteSubsystemDataLinks).toHaveBeenCalledWith(
      [101],
      FILE_ID,
    );
    expect(result.dataLinks).toEqual([
      {systemId: '10', subsystemLinks: [{systemId: '101'}]},
    ]);
  });

  it('deletes an unresolved fallback chain in full even in segmentOnly mode', async () => {
    const unresolved = [
      segment(201, MODULE_A, SUBSYSTEM_A),
      segment(202, SUBSYSTEM_A, SUBSYSTEM_B),
    ];
    const {service, dataLinkRepository} = createFixture({
      reachableUnresolved: unresolved,
      routeSegments: unresolved,
    });

    await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(dataLinkRepository.deleteSubsystemDataLinks).toHaveBeenCalledWith(
      [201, 202],
      FILE_ID,
    );
  });

  it('keeps the non-module portion of a complete unresolved chain in segmentOnly mode', async () => {
    const unresolved = [
      segment(301, MODULE_A, SUBSYSTEM_A),
      segment(302, SUBSYSTEM_A, MODULE_B),
    ];
    const {service, dataLinkRepository} = createFixture({
      reachableUnresolved: unresolved,
      routeSegments: unresolved,
    });

    const result = await service.deleteConnected(
      MODULE_A,
      FILE_ID,
      LINK_DELETION_MODE.SegmentOnly,
    );

    expect(dataLinkRepository.deleteSubsystemDataLinks).toHaveBeenCalledWith(
      [301],
      FILE_ID,
    );
    expect(result.unresolvedSubsystemDataLinks).toEqual([{systemId: '301'}]);
  });
});
