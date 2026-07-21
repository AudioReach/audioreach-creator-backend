/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {CreateControlLinkHandler} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link.handler.js';
import {CreateControlLinkCommand} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link.command.js';
import {
  DomainRuleViolationException,
  ResourceNotFoundException,
  NodeType,
  LINK_TYPE,
} from '@arc/core';

// ── Minimal mock builders ──────────────────────────────────────────────────

function makeClRepo(overrides: Record<string, unknown> = {}) {
  return {
    getLinksByPortSystemIds: jest.fn().mockResolvedValue([]),
    findNonDeletedByPortPair: jest.fn().mockResolvedValue(null),
    findSoftDeletedByPortPair: jest.fn().mockResolvedValue(null),
    createControlLink: jest.fn().mockResolvedValue(undefined),
    createSubsystemControlLink: jest.fn().mockResolvedValue(undefined),
    stageControlPortCreate: jest.fn().mockResolvedValue(undefined),
    stageIntentCreate: jest.fn().mockResolvedValue(undefined),
    patchControlLink: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function makeUow(clRepoOverrides: Record<string, unknown> = {}) {
  const clRepo = makeClRepo(clRepoOverrides);
  const ctx = {
    session: {sessionId: 1, fileSystemId: 100},
    groupId: 'grp-1',
  };
  return {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue(ctx),
    getControlLinkRepository: jest.fn().mockReturnValue(clRepo),
    getModuleRepository: jest.fn().mockReturnValue({}),
    _clRepo: clRepo,
  } as any;
}

function makeModuleResult(
  systemId: number,
  subgraphId: number,
  ports: {
    systemId: number;
    portId: number;
    allocatedIntents: {systemId: number; intentId: number}[];
  }[],
) {
  return {systemId, subgraphId, controlPorts: ports};
}

function makeQueryServices(
  nodeAType = NodeType.Module,
  nodeBType = NodeType.Module,
) {
  const nodeQsMock = {
    findNodeById: jest
      .fn()
      .mockResolvedValueOnce({
        kind: 'OK',
        data: {systemId: 100, type: nodeAType, parentId: null},
      })
      .mockResolvedValueOnce({
        kind: 'OK',
        data: {systemId: 200, type: nodeBType, parentId: null},
      }),
    getAllNodeParentMap: jest.fn().mockResolvedValue({
      kind: 'OK',
      data: new Map([
        [100, null],
        [200, null],
      ]),
    }),
    getIntentsByPortSystemIds: jest
      .fn()
      .mockResolvedValue({kind: 'OK', data: new Map()}),
    getControlPorts: jest.fn().mockResolvedValue({kind: 'OK', data: []}),
  };

  // Default: findOne returns different modules for different systemIds
  const moduleA = makeModuleResult(100, 10, [
    {
      systemId: 500,
      portId: 1,
      allocatedIntents: [{systemId: 5001, intentId: 42}],
    },
  ]);
  const moduleB = makeModuleResult(200, 10, [
    {
      systemId: 600,
      portId: 2,
      allocatedIntents: [{systemId: 6001, intentId: 42}],
    },
  ]);

  return {
    spfModuleQueryService: {
      findOne: jest.fn().mockImplementation(async (systemId: number) => {
        return systemId === 100 ? moduleA : moduleB;
      }),
      nodeQueryService: nodeQsMock,
    },
    useCaseQueryService: {
      getAllUseCases: jest.fn().mockResolvedValue({kind: 'OK', data: []}),
    },
  } as any;
}

function makeIdGen() {
  let counter = 9000;
  return {
    getNextId: jest.fn().mockImplementation(async () => ++counter),
  } as any;
}

function makeCmd(
  overrides: Partial<{
    peerNodeASystemId: number;
    nodeAPortSystemId: number;
    peerNodeBSystemId: number;
    nodeBPortSystemId: number;
    heapId: number;
    isInterUsecase: boolean;
    allowModulesOnly: boolean;
  }> = {},
) {
  return new CreateControlLinkCommand(
    overrides.peerNodeASystemId ?? 100,
    overrides.nodeAPortSystemId ?? 500,
    overrides.peerNodeBSystemId ?? 200,
    overrides.nodeBPortSystemId ?? 600,
    overrides.heapId ?? 1,
    overrides.isInterUsecase ?? false,
    undefined,
    overrides.allowModulesOnly ?? false,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('CreateControlLinkHandler', () => {
  let handler: CreateControlLinkHandler;
  let uow: ReturnType<typeof makeUow>;
  let queryServices: ReturnType<typeof makeQueryServices>;
  let idGen: ReturnType<typeof makeIdGen>;

  beforeEach(() => {
    uow = makeUow();
    queryServices = makeQueryServices();
    idGen = makeIdGen();
    handler = new CreateControlLinkHandler(uow, queryServices, idGen);
  });

  it('throws DomainRuleViolationException on self-loop', async () => {
    const cmd = makeCmd({peerNodeASystemId: 100, peerNodeBSystemId: 100});
    await expect(handler.handle(cmd)).rejects.toBeInstanceOf(
      DomainRuleViolationException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException when nodeA is not found', async () => {
    queryServices.spfModuleQueryService.nodeQueryService.findNodeById
      .mockReset()
      .mockResolvedValueOnce({kind: 'OK', data: null});
    await expect(handler.handle(makeCmd())).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException when nodeB is not found', async () => {
    queryServices.spfModuleQueryService.nodeQueryService.findNodeById
      .mockReset()
      .mockResolvedValueOnce({
        kind: 'OK',
        data: {systemId: 100, type: NodeType.Module, parentId: null},
      })
      .mockResolvedValueOnce({kind: 'OK', data: null});
    await expect(handler.handle(makeCmd())).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('throws DomainRuleViolationException when subsystem used on flat view (allowModulesOnly=true)', async () => {
    queryServices.spfModuleQueryService.nodeQueryService.findNodeById
      .mockReset()
      .mockResolvedValueOnce({
        kind: 'OK',
        data: {systemId: 100, type: NodeType.Subsystem, parentId: null},
      })
      .mockResolvedValueOnce({
        kind: 'OK',
        data: {systemId: 200, type: NodeType.Module, parentId: null},
      });
    await expect(
      handler.handle(makeCmd({allowModulesOnly: true})),
    ).rejects.toBeInstanceOf(DomainRuleViolationException);
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException when port not found on module', async () => {
    // module A has no matching port
    queryServices.spfModuleQueryService.findOne.mockResolvedValueOnce(
      makeModuleResult(100, 10, []),
    );
    await expect(handler.handle(makeCmd())).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('throws DomainRuleViolationException for duplicate non-deleted link', async () => {
    uow._clRepo.findNonDeletedByPortPair.mockResolvedValue({
      systemId: 999,
      linkType: LINK_TYPE.IntraSubgraph,
    });
    await expect(handler.handle(makeCmd())).rejects.toBeInstanceOf(
      DomainRuleViolationException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('throws DomainRuleViolationException when intent intersection is empty (both module ports)', async () => {
    // portA has intent 42, portB has intent 99 — no intersection
    queryServices.spfModuleQueryService.findOne
      .mockResolvedValueOnce(
        makeModuleResult(100, 10, [
          {
            systemId: 500,
            portId: 1,
            allocatedIntents: [{systemId: 5001, intentId: 42}],
          },
        ]),
      )
      .mockResolvedValueOnce(
        makeModuleResult(200, 10, [
          {
            systemId: 600,
            portId: 2,
            allocatedIntents: [{systemId: 6001, intentId: 99}],
          },
        ]),
      );
    await expect(handler.handle(makeCmd())).rejects.toBeInstanceOf(
      DomainRuleViolationException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('assigns INTRA_SUBGRAPH when both modules are in the same subgraph', async () => {
    // Default mock already returns correct modules per systemId (both subgraphId: 10)
    await handler.handle(makeCmd());
    expect(uow._clRepo.createControlLink).toHaveBeenCalledWith(
      expect.objectContaining({linkType: LINK_TYPE.IntraSubgraph}),
    );
    expect(uow.commit).toHaveBeenCalled();
  });

  it('assigns INTRA_USECASE when modules are in different subgraphs', async () => {
    queryServices.spfModuleQueryService.findOne.mockImplementation(
      async (systemId: number) => {
        if (systemId === 100)
          return makeModuleResult(100, 10, [
            {
              systemId: 500,
              portId: 1,
              allocatedIntents: [{systemId: 5001, intentId: 42}],
            },
          ]);
        return makeModuleResult(200, 20, [
          {
            systemId: 600,
            portId: 2,
            allocatedIntents: [{systemId: 6001, intentId: 42}],
          },
        ]);
      },
    );
    await handler.handle(makeCmd());
    expect(uow._clRepo.createControlLink).toHaveBeenCalledWith(
      expect.objectContaining({linkType: LINK_TYPE.IntraUsecase}),
    );
  });

  it('assigns INTER_USECASE when isInterUsecase=true', async () => {
    // Default mock: both modules in subgraphId 10
    await handler.handle(makeCmd({isInterUsecase: true}));
    expect(uow._clRepo.createControlLink).toHaveBeenCalledWith(
      expect.objectContaining({linkType: LINK_TYPE.InterUsecase}),
    );
  });

  it('stages Intent CREATE rows for each resolved intent on both ports', async () => {
    await handler.handle(makeCmd());
    // One intent (42), two ports = 2 intent create calls
    expect(uow._clRepo.stageIntentCreate).toHaveBeenCalledTimes(2);
    expect(uow._clRepo.stageIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({intentId: 42, controlPortSystemId: 500}),
    );
    expect(uow._clRepo.stageIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({intentId: 42, controlPortSystemId: 600}),
    );
  });

  it('does not create SCL segments when both nodes have no subsystem parent', async () => {
    await handler.handle(makeCmd());
    expect(uow._clRepo.createSubsystemControlLink).not.toHaveBeenCalled();
  });

  it('creates SCL segments and boundary ControlPort when nodes cross a subsystem boundary', async () => {
    // nodeA at top level, nodeB inside subsystem 10
    queryServices.spfModuleQueryService.nodeQueryService.getAllNodeParentMap.mockResolvedValue(
      {
        kind: 'OK',
        data: new Map([
          [100, null],
          [200, 10],
          [10, null],
        ]),
      },
    );
    await handler.handle(makeCmd());
    // 2 SCL segments: (100→10) and (10→200)
    expect(uow._clRepo.createSubsystemControlLink).toHaveBeenCalledTimes(2);
    // 1 boundary port on subsystem 10
    expect(uow._clRepo.stageControlPortCreate).toHaveBeenCalledTimes(1);
    expect(uow._clRepo.stageControlPortCreate).toHaveBeenCalledWith(
      expect.objectContaining({nodeSystemId: 10}),
    );
  });

  it('rolls back and rethrows when commit fails', async () => {
    uow.commit.mockRejectedValue(new Error('DB error'));
    await expect(handler.handle(makeCmd())).rejects.toThrow('DB error');
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('returns ComponentsReadModel with the created control link', async () => {
    const result = await handler.handle(makeCmd());
    expect(result.controlLinks).toHaveLength(1);
    expect(result.controlLinks[0]).toMatchObject({
      nodeAPortSystemId: 500, // canonical: min(500, 600) = 500
      nodeBPortSystemId: 600,
      heapId: 1,
      linkType: LINK_TYPE.IntraSubgraph,
    });
    expect(result.modules).toHaveLength(0);
    expect(result.dataLinks).toHaveLength(0);
  });
});
