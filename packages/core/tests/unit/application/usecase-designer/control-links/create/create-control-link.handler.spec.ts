/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {CreateControlLinkFlatHandler} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link-flat.handler.js';
import {CreateControlLinkWithSubsystemsHandler} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link-with-subsystems.handler.js';
import {CreateControlLinkCommand} from '../../../../../../src/application/usecase-designer/control-links/create/create-control-link.command.js';
import {CONTROL_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/control-link-type.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
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
      getSpfModule: jest.fn().mockImplementation((id: number) =>
        Promise.resolve(moduleResult(id)),
      ),
    },
    spfModuleDefinitionQueryService: {
      getDefinition: jest.fn().mockResolvedValue({
        kind: RESULT_KIND.Ok,
        data: {
          staticControlPorts: [
            {naturalId: 1, staticIntents: [{naturalId: 7}]},
          ],
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
    findActiveByPortPair: jest.fn().mockResolvedValue(null),
    findSoftDeletedByPortPair: jest.fn().mockResolvedValue(null),
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

function makeUow(repo: ControlLinkRepository, subsystem?: SubsystemRepository): UnitOfWork {
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
          getAllNodesWithParents: jest.fn().mockResolvedValue(
            new Map([
              [1, null],
              [2, null],
            ]),
          ),
          createControlPorts: jest.fn().mockResolvedValue(undefined),
          controlPortExists: jest.fn().mockResolvedValue(false),
          subsystemExists: jest.fn().mockResolvedValue(false),
        } as unknown as SubsystemRepository),
    ),
  } as unknown as UnitOfWork;
}

function makeIdGeneration(): IdGenerationPort {
  let next = 1000;
  return {
    getNextId: jest.fn().mockImplementation(() => Promise.resolve(next++)),
  } as IdGenerationPort;
}

function command(): CreateControlLinkCommand {
  return new CreateControlLinkCommand(
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
    expect(repo.createIntents).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({controlPortSystemId: 11, intentId: 7})],
    );
    expect(repo.createIntents).toHaveBeenNthCalledWith(
      2,
      [expect.objectContaining({controlPortSystemId: 22, intentId: 7})],
    );
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(result.controlLinks).toHaveLength(1);
  });

  it('rolls back when intent edit-action staging fails', async () => {
    const repo = makeRepository({
      createIntents: jest.fn().mockRejectedValue(new Error('intent write failed')),
    });
    const uow = makeUow(repo);
    const handler = new CreateControlLinkFlatHandler(
      uow,
      makeIdGeneration(),
      makeQueryServices(),
    );

    await expect(handler.handle(command())).rejects.toThrow('intent write failed');
    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('returns 422 semantics when a supplied port belongs to another node', async () => {
    const queryServices = makeQueryServices();
    (queryServices.nodeQueryService.getControlPorts as jest.Mock)
      .mockImplementation(async () => ({kind: RESULT_KIND.Ok, data: []}));
    const subsystem = {
      ...({} as SubsystemRepository),
      getAllNodesWithParents: jest.fn().mockResolvedValue(new Map()),
      createControlPorts: jest.fn().mockResolvedValue(undefined),
      controlPortExists: jest.fn().mockResolvedValue(true),
      subsystemExists: jest.fn().mockResolvedValue(false),
    } as unknown as SubsystemRepository;
    const uow = makeUow(makeRepository(), subsystem);
    const handler = new CreateControlLinkFlatHandler(
      uow,
      makeIdGeneration(),
      queryServices,
    );

    await expect(handler.handle(command())).rejects.toThrow('not owned by node');
    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });

  it('returns 404 semantics when a supplied port does not exist', async () => {
    const queryServices = makeQueryServices();
    (queryServices.nodeQueryService.getControlPorts as jest.Mock)
      .mockImplementation(async () => ({kind: RESULT_KIND.Ok, data: []}));
    const handler = new CreateControlLinkFlatHandler(
      makeUow(makeRepository()),
      makeIdGeneration(),
      queryServices,
    );

    await expect(handler.handle(command())).rejects.toThrow('not found');
  });

  it('maps only subsystem-link segments into the hierarchical response tree', async () => {
    const queries = {
      ...makeQueryServices(),
      subsystemQueryService: {
        findAll: jest.fn().mockResolvedValue({
          kind: RESULT_KIND.Ok,
          data: [
            {systemId: 10, name: 'SS1', parentSystemId: undefined, filteredKeys: []},
            {systemId: 20, name: 'SS2', parentSystemId: 10, filteredKeys: []},
          ],
        }),
      },
    } as unknown as QueryServices;
    const uow = makeUow(makeRepository());
    (uow.getSubsystemRepository as jest.Mock).mockReturnValue({
      getAllNodesWithParents: jest.fn().mockResolvedValue(
        new Map([
          [1, 10],
          [2, 20],
          [10, null],
          [20, 10],
        ]),
      ),
    });
    const handler = new CreateControlLinkWithSubsystemsHandler(
      uow,
      makeIdGeneration(),
      queries,
    );

    const response = await (
      handler as unknown as {
        hierarchyResponse: (command: unknown, context: unknown, link: unknown) => Promise<unknown>;
      }
    ).hierarchyResponse(
      {},
      {
        fileSystemId,
        nodeA: {parentSystemId: 10},
        nodeB: {parentSystemId: 20},
      },
      {
        systemId: 999,
        peerNodeASystemId: 1,
        peerNodeBSystemId: 2,
        nodeAPortSystemId: 11,
        nodeBPortSystemId: 22,
        heapId: 1,
        linkType: CONTROL_LINK_TYPE.Normal,
        subsystemControlLinks: [
          {
            systemId: 501,
            peerNodeASystemId: 1,
            peerNodeBSystemId: 10,
            nodeAPortSystemId: 11,
            nodeBPortSystemId: 101,
            linkType: CONTROL_LINK_TYPE.Normal,
          },
          {
            systemId: 502,
            peerNodeASystemId: 10,
            peerNodeBSystemId: 20,
            nodeAPortSystemId: 101,
            nodeBPortSystemId: 102,
            linkType: CONTROL_LINK_TYPE.Normal,
          },
          {
            systemId: 503,
            peerNodeASystemId: 20,
            peerNodeBSystemId: 2,
            nodeAPortSystemId: 102,
            nodeBPortSystemId: 22,
            linkType: CONTROL_LINK_TYPE.Normal,
          },
        ],
      },
    ) as {
      controlLinks: {systemId: string}[];
      subsystems: {
        children: {
          controlLinks: {systemId: string}[];
          subsystems: {
            children: {controlLinks: {systemId: string}[]};
          }[];
        };
      }[];
    };

    expect(response.controlLinks).toEqual([]);
    expect(response.subsystems[0].children.controlLinks).toEqual([
      expect.objectContaining({systemId: '501'}),
      expect.objectContaining({systemId: '502'}),
    ]);
    expect(
      response.subsystems[0].children.subsystems[0].children.controlLinks,
    ).toEqual([expect.objectContaining({systemId: '503'})]);
    expect(response.controlLinks).not.toContainEqual({systemId: '999'});
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
    const queries = {
      ...makeQueryServices(),
      subsystemQueryService: {
        findAll: jest.fn().mockResolvedValue({
          kind: RESULT_KIND.Ok,
          data: [{systemId: 10, parentSystemId: undefined, filteredKeys: []}],
        }),
      },
    } as unknown as QueryServices;
    const handler = new CreateControlLinkWithSubsystemsHandler(
      makeUow(repo),
      makeIdGeneration(),
      queries,
    );

    await expect(
      (
        handler as unknown as {
          checkSubsystemPortUniqueness: (command: unknown, fileId: number) => Promise<void>;
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
    const queries = {
      ...makeQueryServices(),
      subsystemQueryService: {
        findAll: jest.fn().mockResolvedValue({
          kind: RESULT_KIND.Ok,
          data: [{systemId: 10, parentSystemId: undefined, filteredKeys: []}],
        }),
      },
    } as unknown as QueryServices;
    const uow = makeUow(repo);
    (uow.getSubsystemRepository as jest.Mock).mockReturnValue({
      getAllNodesWithParents: jest.fn().mockResolvedValue(
        new Map([
          [1, 10],
          [2, null],
          [10, null],
        ]),
      ),
    });
    const handler = new CreateControlLinkWithSubsystemsHandler(
      uow,
      makeIdGeneration(),
      queries,
    );

    await expect(
      (
        handler as unknown as {
          checkSubsystemPortUniqueness: (command: unknown, fileId: number) => Promise<void>;
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
