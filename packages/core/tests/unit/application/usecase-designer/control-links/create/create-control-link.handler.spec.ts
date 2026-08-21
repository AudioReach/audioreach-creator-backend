/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {CreateControlLinkFlatHandler} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link-flat.handler.js';
import {CreateControlLinkWithSubsystemsHandler} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link-with-subsystems.handler.js';
import {CreateControlLinkFlatCommand} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link.command.js';
import {CONTROL_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/control-link-type.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {NodeType} from '../../../../../../src/domain/entities/usecase-data/node/node.js';
import type {ControlLinkRepository} from '../../../../../../src/application/ports/persistence/repositories/control-link/control-link.repository.js';
import type {SubsystemRepository} from '../../../../../../src/application/ports/persistence/repositories/subsystem/subsystem.repository.js';
import type {UnitOfWork} from '../../../../../../src/application/ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../../../../src/application/ports/persistence/query-services/query-services.js';
import type {IdGenerationPort} from '../../../../../../src/application/ports/id-generation/id-generation.port.js';

const fileSystemId = 10;

function moduleResult(systemId: number) {
  return {
    kind: RESULT_KIND.Ok,
    data: {
      systemId,
      subgraphSystemId: 100,
      parentSystemId: undefined,
      definitionSystemId: 900,
      controlPorts: [
        {
          systemId: systemId === 1 ? 11 : 22,
          naturalId: 1,
          allocatedIntents: [],
          totalLinksAtPort: 0,
        },
      ],
    },
  } as never;
}

function makeQueryServices(): QueryServices {
  return {
    spfModuleQueryService: {
      getSpfModule: jest
        .fn()
        .mockImplementation((id: number) => Promise.resolve(moduleResult(id))),
    },
    spfModuleDefinitionQueryService: {
      getDefinition: jest.fn().mockResolvedValue({
        kind: RESULT_KIND.Ok,
        data: {
          staticControlPorts: [{naturalId: 1, staticIntents: [{naturalId: 7}]}],
          dynamicIntents: [],
        },
      }),
    },
    useCaseQueryService: {
      findUsecaseIdsBySubgraphIds: jest.fn().mockResolvedValue(new Map()),
    },
    nodeQueryService: {
      getControlPorts: jest.fn().mockImplementation((id: number) =>
        Promise.resolve({
          kind: RESULT_KIND.Ok,
          data: [
            {
              systemId: id === 1 ? 11 : 22,
              naturalId: 1,
              allocatedIntents: [],
              totalLinksAtPort: 0,
            },
          ],
        }),
      ),
    },
  } as unknown as QueryServices;
}

function makeRepository(
  overrides: Partial<ControlLinkRepository> = {},
): ControlLinkRepository {
  return {
    findByPortPair: jest.fn().mockResolvedValue(null),
    createControlLink: jest.fn().mockResolvedValue(undefined),
    reactivateControlLink: jest.fn().mockResolvedValue(undefined),
    createSubsystemControlLink: jest.fn().mockResolvedValue(undefined),
    getAllControlLinks: jest.fn().mockResolvedValue([]),
    getAllSubsystemControlLinks: jest.fn().mockResolvedValue([]),
    getAllocatedIntentIds: jest.fn().mockResolvedValue([]),
    deleteIntents: jest.fn().mockResolvedValue(undefined),
    createIntents: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ControlLinkRepository;
}

function makeUow(
  repo: ControlLinkRepository,
  subsystem?: SubsystemRepository,
): UnitOfWork {
  return {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    applyCachedActions: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 1, fileSystemId, mode: 'DESIGNER'},
      groupId: 'group-1',
    }),
    getControlLinkRepository: jest.fn().mockReturnValue(repo),
    getSubsystemRepository: jest.fn().mockReturnValue(
      subsystem ??
        ({
          getAllNodesWithParents: jest.fn().mockResolvedValue([
            {systemId: 1, parentSystemId: null, type: NodeType.Module},
            {systemId: 2, parentSystemId: null, type: NodeType.Module},
          ]),
          createControlPorts: jest.fn().mockResolvedValue(undefined),
          controlPortExists: jest.fn().mockResolvedValue(false),
          subsystemExists: jest.fn().mockResolvedValue(false),
          getSubsystems: jest.fn().mockResolvedValue([]),
        } as unknown as SubsystemRepository),
    ),
    getModuleRepository: jest.fn().mockReturnValue({
      findModuleForControlLink: jest.fn().mockImplementation((id: number) =>
        Promise.resolve({
          subgraphSystemId: 100,
          parentSystemId: null,
          definitionSystemId: 900,
          controlPorts: [{systemId: id === 1 ? 11 : 22, naturalId: 1}],
        }),
      ),
      findControlPortsForLink: jest.fn().mockImplementation((id: number) =>
        Promise.resolve([
          {
            systemId: id === 1 ? 11 : 22,
            naturalId: 1,
            allocatedIntents: [],
            totalLinksAtPort: 0,
          },
        ]),
      ),
    }),
    getModuleDefinitionRepository: jest.fn().mockReturnValue({
      findBySystemId: jest.fn().mockResolvedValue({
        staticControlPorts: [{naturalId: 1, staticIntents: [{naturalId: 7}]}],
        dynamicIntents: [],
      }),
    }),
    getUsecaseRepository: jest.fn().mockReturnValue({
      findBySubgraph: jest.fn().mockResolvedValue([]),
    }),
  } as unknown as UnitOfWork;
}

function makeIdGeneration(): IdGenerationPort {
  let next = 1000;
  return {
    getNextId: jest.fn().mockImplementation(() => Promise.resolve(next++)),
  } as IdGenerationPort;
}

function command(): CreateControlLinkFlatCommand {
  return new CreateControlLinkFlatCommand(
    CONTROL_LINK_TYPE.Normal,
    1,
    11,
    2,
    22,
    1,
  );
}

describe('CreateControlLinkFlatHandler', () => {
  it('creates the canonical link and stages definition-derived intents', async () => {
    const repo = makeRepository();
    const uow = makeUow(repo);
    const handler = new CreateControlLinkFlatHandler(
      uow,
      makeIdGeneration(),
      makeQueryServices(),
    );

    const result = await handler.handle(command());

    expect(repo.createControlLink).toHaveBeenCalledTimes(1);
    expect(repo.createIntents).toHaveBeenCalledTimes(2);
    expect(repo.createIntents).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({controlPortSystemId: 11, intentId: 7}),
    ]);
    expect(repo.createIntents).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({controlPortSystemId: 22, intentId: 7}),
    ]);
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(result.controlLinks).toHaveLength(1);
  });

  it('rolls back when intent edit-action staging fails', async () => {
    const repo = makeRepository({
      createIntents: jest
        .fn()
        .mockRejectedValue(new Error('intent write failed')),
    });
    const uow = makeUow(repo);
    const handler = new CreateControlLinkFlatHandler(
      uow,
      makeIdGeneration(),
      makeQueryServices(),
    );

    await expect(handler.handle(command())).rejects.toThrow(
      'intent write failed',
    );
    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('returns 422 semantics when a supplied port belongs to another node', async () => {
    const uow = makeUow(makeRepository());
    (uow.getSubsystemRepository as jest.Mock).mockReturnValue({
      getAllNodesWithParents: jest.fn().mockResolvedValue([]),
      createControlPorts: jest.fn().mockResolvedValue(undefined),
      controlPortExists: jest.fn().mockResolvedValue(true),
      subsystemExists: jest.fn().mockResolvedValue(false),
      getSubsystems: jest.fn().mockResolvedValue([]),
    });
    (uow.getModuleRepository as jest.Mock).mockReturnValue({
      findModuleForControlLink: jest.fn().mockImplementation((id: number) =>
        Promise.resolve({
          subgraphSystemId: 100,
          parentSystemId: null,
          definitionSystemId: 900,
          controlPorts: [{systemId: id === 1 ? 11 : 22, naturalId: 1}],
        }),
      ),
      findControlPortsForLink: jest.fn().mockResolvedValue([]),
    });
    const handler = new CreateControlLinkFlatHandler(uow, makeIdGeneration());

    await expect(handler.handle(command())).rejects.toThrow(
      'not owned by node',
    );
    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });

  it('returns 404 semantics when a supplied port does not exist', async () => {
    const uow = makeUow(makeRepository());
    (uow.getModuleRepository as jest.Mock).mockReturnValue({
      findModuleForControlLink: jest.fn().mockImplementation((id: number) =>
        Promise.resolve({
          subgraphSystemId: 100,
          parentSystemId: null,
          definitionSystemId: 900,
          controlPorts: [{systemId: id === 1 ? 11 : 22, naturalId: 1}],
        }),
      ),
      findControlPortsForLink: jest.fn().mockResolvedValue([]),
    });
    const handler = new CreateControlLinkFlatHandler(uow, makeIdGeneration());

    await expect(handler.handle(command())).rejects.toThrow('not found');
  });

  it('rejects a second same-side connection on a subsystem port', async () => {
    const repo = makeRepository({
      getAllSubsystemControlLinks: jest.fn().mockResolvedValue([
        {
          systemId: 601,
          peerNodeASystemId: 1,
          peerNodeBSystemId: 10,
          nodeAPortSystemId: 11,
          nodeBPortSystemId: 101,
        },
      ]),
    });
    const uow = makeUow(repo);
    (uow.getSubsystemRepository as jest.Mock).mockReturnValue({
      getAllNodesWithParents: jest.fn().mockResolvedValue([
        {systemId: 1, parentSystemId: null, type: NodeType.Module},
        {systemId: 2, parentSystemId: null, type: NodeType.Module},
        {systemId: 10, parentSystemId: null, type: NodeType.Subsystem},
      ]),
      getSubsystems: jest.fn().mockResolvedValue([{systemId: 10}]),
    });
    const handler = new CreateControlLinkWithSubsystemsHandler(
      uow,
      makeIdGeneration(),
    );

    await expect(
      (
        handler as unknown as {
          checkSubsystemPortUniqueness: (
            command: unknown,
            fileId: number,
          ) => Promise<void>;
        }
      ).checkSubsystemPortUniqueness(
        {
          peerNodeASystemId: 10,
          nodeAPortSystemId: 101,
          peerNodeBSystemId: 2,
          nodeBPortSystemId: 22,
        },
        fileSystemId,
      ),
    ).rejects.toThrow('already has an outer connection');
  });

  it('allows one inner and one outer connection on the same subsystem port', async () => {
    const repo = makeRepository({
      getAllSubsystemControlLinks: jest.fn().mockResolvedValue([
        {
          systemId: 601,
          peerNodeASystemId: 1,
          peerNodeBSystemId: 10,
          nodeAPortSystemId: 11,
          nodeBPortSystemId: 101,
        },
      ]),
    });
    const uow = makeUow(repo);
    (uow.getSubsystemRepository as jest.Mock).mockReturnValue({
      getAllNodesWithParents: jest.fn().mockResolvedValue([
        {systemId: 1, parentSystemId: 10, type: NodeType.Module},
        {systemId: 2, parentSystemId: null, type: NodeType.Module},
        {systemId: 10, parentSystemId: null, type: NodeType.Subsystem},
      ]),
      getSubsystems: jest.fn().mockResolvedValue([{systemId: 10}]),
    });
    const handler = new CreateControlLinkWithSubsystemsHandler(
      uow,
      makeIdGeneration(),
    );

    await expect(
      (
        handler as unknown as {
          checkSubsystemPortUniqueness: (
            command: unknown,
            fileId: number,
          ) => Promise<void>;
        }
      ).checkSubsystemPortUniqueness(
        {
          peerNodeASystemId: 10,
          nodeAPortSystemId: 101,
          peerNodeBSystemId: 2,
          nodeBPortSystemId: 22,
        },
        fileSystemId,
      ),
    ).resolves.toBeUndefined();
  });
});
