/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {beforeEach, describe, expect, it, jest} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {SOURCE} from '../../../../../../src/application/shared/change-vocabulary.js';
import {SubsystemLinkResolutionService} from '../../../../../../src/application/usecase-designer/use-case-creator/services/subsystem-link-resolution.service.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {CONTROL_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/control-link-type.js';
import {SubsystemDataLink} from '../../../../../../src/domain/entities/usecase-data/links/subsystem-data-link.js';
import {SubsystemControlLink} from '../../../../../../src/domain/entities/usecase-data/links/subsystem-control-link.js';
import {NodeType} from '../../../../../../src/domain/entities/usecase-data/node/node.js';
import {ISSUE_CODE} from '../../../../../../src/shared/issues/operational-codes.js';

const FILE_SYSTEM_ID = 1;

function dataSegment(
  systemId: number,
  sourceNodeSystemId: number,
  destinationNodeSystemId: number,
  sourcePortSystemId: number,
  destinationPortSystemId: number,
): SubsystemDataLink {
  return new SubsystemDataLink({
    systemId,
    sourceNodeSystemId,
    destinationNodeSystemId,
    sourcePortSystemId,
    destinationPortSystemId,
    dataLinkSystemId: null,
    fileSystemId: FILE_SYSTEM_ID,
    linkType: DATA_LINK_TYPE.Normal,
  });
}

function controlSegment(
  systemId: number,
  peerNodeASystemId: number,
  peerNodeBSystemId: number,
  nodeAPortSystemId: number,
  nodeBPortSystemId: number,
): SubsystemControlLink {
  return new SubsystemControlLink(
    systemId,
    peerNodeASystemId,
    peerNodeBSystemId,
    nodeAPortSystemId,
    nodeBPortSystemId,
    null,
    FILE_SYSTEM_ID,
    CONTROL_LINK_TYPE.Normal,
    0,
  );
}

function nodes(
  entries: readonly [number, NodeType][],
): {systemId: number; parentSystemId: null; type: NodeType}[] {
  return entries.map(([systemId, type]) => ({
    systemId,
    parentSystemId: null,
    type,
  }));
}

function makeUow(
  options: {
    dataSegments?: SubsystemDataLink[];
    controlSegments?: SubsystemControlLink[];
    nodeTopology?: {systemId: number; parentSystemId: null; type: NodeType}[];
  } = {},
) {
  const dataLinkRepository = {
    findAllLinks: jest.fn().mockResolvedValue({
      dataLinks: [],
      unresolvedSubsystemDataLinks: options.dataSegments ?? [],
    }),
    createDataLink: jest.fn().mockResolvedValue(undefined),
    resolveSubsystemDataLinks: jest.fn().mockResolvedValue(undefined),
  };
  const controlLinkRepository = {
    findAllLinks: jest.fn().mockResolvedValue({
      controlLinks: [],
      unresolvedSubsystemControlLinks: options.controlSegments ?? [],
    }),
    createAggregate: jest.fn().mockResolvedValue(undefined),
    resolveSubsystemControlLinks: jest.fn().mockResolvedValue(undefined),
  };
  const moduleRepository = {
    findModulePortsForLink: jest.fn().mockResolvedValue({
      subgraphSystemId: 5,
      ports: [],
    }),
    findModuleById: jest.fn().mockResolvedValue({subgraphSystemId: 5}),
  };
  const uow = {
    getWriteContext: () => ({
      session: {fileSystemId: FILE_SYSTEM_ID, sessionId: 10},
    }),
    getDataLinkRepository: () => dataLinkRepository,
    getControlLinkRepository: () => controlLinkRepository,
    getSubsystemRepository: () => ({
      getAllNodesWithParents: jest
        .fn()
        .mockResolvedValue(options.nodeTopology ?? []),
    }),
    getModuleRepository: () => moduleRepository,
  };
  return {uow, dataLinkRepository, controlLinkRepository, moduleRepository};
}

describe('SubsystemLinkResolutionService.resolveAllChains', () => {
  const service = new SubsystemLinkResolutionService();
  const idGeneration = {getNextId: jest.fn()};

  beforeEach(() => {
    jest.clearAllMocks();
    idGeneration.getNextId.mockResolvedValue(99);
  });

  it('is a no-op when no unresolved subsystem links exist', async () => {
    const {uow, dataLinkRepository, controlLinkRepository} = makeUow();

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(dataLinkRepository.createDataLink).not.toHaveBeenCalled();
    expect(controlLinkRepository.createAggregate).not.toHaveBeenCalled();
    expect(idGeneration.getNextId).not.toHaveBeenCalled();
  });

  it('creates a canonical DataLink and resolves all segments in one complete data chain', async () => {
    const segments = [
      dataSegment(1, 10, 20, 100, 200),
      dataSegment(2, 20, 30, 201, 300),
    ];
    const {uow, dataLinkRepository} = makeUow({
      dataSegments: segments,
      nodeTopology: nodes([
        [10, NodeType.Module],
        [20, NodeType.Subsystem],
        [30, NodeType.Module],
      ]),
    });

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(dataLinkRepository.createDataLink).toHaveBeenCalledTimes(1);
    const [dataLink, boundaryPorts, createOptions] =
      dataLinkRepository.createDataLink.mock.calls[0];
    expect(dataLink.systemId).toBe(99);
    expect(dataLink.sourcePortSystemId).toBe(100);
    expect(dataLink.destinationPortSystemId).toBe(300);
    expect(boundaryPorts).toEqual([]);
    expect(createOptions).toMatchObject({source: SOURCE.Manual});
    expect(dataLinkRepository.resolveSubsystemDataLinks).toHaveBeenCalledWith(
      segments,
      99,
      createOptions,
    );
  });

  it('creates one DataLink per complete data chain with distinct group IDs', async () => {
    idGeneration.getNextId.mockResolvedValueOnce(99).mockResolvedValueOnce(100);
    const {uow, dataLinkRepository} = makeUow({
      dataSegments: [
        dataSegment(1, 10, 20, 100, 200),
        dataSegment(2, 20, 30, 201, 300),
        dataSegment(3, 40, 50, 400, 500),
        dataSegment(4, 50, 60, 501, 600),
      ],
      nodeTopology: nodes([
        [10, NodeType.Module],
        [20, NodeType.Subsystem],
        [30, NodeType.Module],
        [40, NodeType.Module],
        [50, NodeType.Subsystem],
        [60, NodeType.Module],
      ]),
    });

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(dataLinkRepository.createDataLink).toHaveBeenCalledTimes(2);
    const firstOptions = dataLinkRepository.createDataLink.mock.calls[0][2];
    const secondOptions = dataLinkRepository.createDataLink.mock.calls[1][2];
    expect(firstOptions.linkedEntityGroupId).not.toBe(
      secondOptions.linkedEntityGroupId,
    );
  });

  it('fails before allocating IDs or staging writes for an incomplete data chain', async () => {
    const {uow, dataLinkRepository, controlLinkRepository} = makeUow({
      dataSegments: [dataSegment(1, 10, 20, 100, 200)],
      nodeTopology: nodes([
        [10, NodeType.Module],
        [20, NodeType.Subsystem],
      ]),
    });

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail) {
      expect(result.issues[0]?.code).toBe(
        ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN,
      );
    }
    expect(idGeneration.getNextId).not.toHaveBeenCalled();
    expect(dataLinkRepository.createDataLink).not.toHaveBeenCalled();
    expect(controlLinkRepository.createAggregate).not.toHaveBeenCalled();
  });

  it('fails for a cyclic data chain', async () => {
    const {uow} = makeUow({
      dataSegments: [
        dataSegment(1, 10, 20, 100, 200),
        dataSegment(2, 20, 30, 201, 300),
        dataSegment(3, 30, 20, 301, 202),
      ],
      nodeTopology: nodes([
        [10, NodeType.Module],
        [20, NodeType.Subsystem],
        [30, NodeType.Subsystem],
      ]),
    });

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail) {
      expect(result.issues[0]?.code).toBe(
        ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN,
      );
    }
  });

  it('creates one ControlLink and resolves segments for a complete control chain', async () => {
    const segments = [
      controlSegment(1, 50, 60, 100, 200),
      controlSegment(2, 60, 70, 201, 300),
    ];
    const {uow, controlLinkRepository} = makeUow({
      controlSegments: segments,
      nodeTopology: nodes([
        [50, NodeType.Module],
        [60, NodeType.Subsystem],
        [70, NodeType.Module],
      ]),
    });

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(controlLinkRepository.createAggregate).toHaveBeenCalledTimes(1);
    const [controlLink, fileSystemId, createOptions] =
      controlLinkRepository.createAggregate.mock.calls[0];
    expect(controlLink.nodeAPortSystemId).toBe(100);
    expect(controlLink.nodeBPortSystemId).toBe(300);
    expect(fileSystemId).toBe(FILE_SYSTEM_ID);
    expect(createOptions).toMatchObject({source: SOURCE.Manual});
    expect(
      controlLinkRepository.resolveSubsystemControlLinks,
    ).toHaveBeenCalledWith(segments, 99, createOptions);
  });

  it('deduplicates a direct control chain discovered from both directions', async () => {
    const {uow, controlLinkRepository} = makeUow({
      controlSegments: [controlSegment(1, 50, 70, 100, 300)],
      nodeTopology: nodes([
        [50, NodeType.Module],
        [70, NodeType.Module],
      ]),
    });

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(controlLinkRepository.createAggregate).toHaveBeenCalledTimes(1);
  });

  it('fails with every incomplete-chain issue without staging complete chains', async () => {
    const {uow, dataLinkRepository, controlLinkRepository} = makeUow({
      dataSegments: [
        dataSegment(1, 10, 20, 100, 200),
        dataSegment(2, 20, 30, 201, 300),
        dataSegment(3, 40, 50, 400, 500),
      ],
      controlSegments: [controlSegment(4, 60, 70, 600, 700)],
      nodeTopology: nodes([
        [10, NodeType.Module],
        [20, NodeType.Subsystem],
        [30, NodeType.Module],
        [40, NodeType.Module],
        [50, NodeType.Subsystem],
        [60, NodeType.Module],
        [70, NodeType.Subsystem],
      ]),
    });

    const result = await service.resolveAllChains(uow as never, idGeneration);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind === RESULT_KIND.Fail) {
      expect(result.issues.map(issue => issue.code)).toEqual([
        ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_DATA_CHAIN,
        ISSUE_CODE.ROUTING_PHASE0_INCOMPLETE_CONTROL_CHAIN,
      ]);
    }
    expect(dataLinkRepository.createDataLink).not.toHaveBeenCalled();
    expect(controlLinkRepository.createAggregate).not.toHaveBeenCalled();
  });
});
