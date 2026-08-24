/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import {CreateModuleHandler} from '../../../../../../src/application/usecase-designer/spf-module/create-module/create-module.handler.js';
import {CreateModuleCommand} from '../../../../../../src/application/usecase-designer/spf-module/create-module/create-module.command.js';
import {ResourceNotFoundException} from '@arc/core';
import type {
  UnitOfWork,
  ModuleRepository,
  ContainerRepository,
  ModuleDefinitionRepository,
  SubgraphRepository,
  SubsystemRepository,
  IdGenerationPort,
  NaturalIdGenerationPort,
} from '@arc/core';
const FILE_ID = 10;
const GROUP_ID = 'test-group-uuid';
const MODULE_DEF_SYSTEM_ID = 200;

function makeDefinition(
  overrides: Partial<{
    containerTypesSystemIds: Set<number>;
    dataPortGroups: unknown[];
    staticControlPorts: unknown[];
  }> = {},
) {
  return {
    systemId: MODULE_DEF_SYSTEM_ID,
    moduleDefinitionId: 42,
    containerTypesSystemIds: overrides.containerTypesSystemIds ?? new Set([50]),
    dataPortGroups: overrides.dataPortGroups ?? [
      {
        portIoType: 'INPUT',
        staticPortDefinitions: [{dataPortId: 1, name: 'in_0'}],
        maxAllowedPortCount: 4,
      },
    ],
    staticControlPorts: overrides.staticControlPorts ?? [
      {portId: 1, portName: 'ctrl_0'},
    ],
    dynamicIntents: [],
  };
}

function makeDefRepo(definition = makeDefinition()) {
  return {
    findBySystemId: jest.fn().mockResolvedValue(definition),
    findByModuleIdAndProcId: jest.fn().mockResolvedValue(definition),
  } as unknown as ModuleDefinitionRepository;
}

function makeSubgraphRepo(): SubgraphRepository {
  return {
    subgraphExists: jest.fn().mockResolvedValue(true),
    createSubgraph: jest.fn().mockResolvedValue(undefined),
  };
}

function makeContainerRepo(): ContainerRepository {
  return {
    containerExists: jest.fn().mockResolvedValue(true),
    getContainerById: jest.fn().mockResolvedValue(null),
    createContainer: jest.fn().mockResolvedValue(undefined),
    getPropertyData: jest.fn().mockResolvedValue(null),
    setPropertyData: jest.fn().mockResolvedValue(undefined),
  };
}

function makeSubsystemRepo(): SubsystemRepository {
  return {subsystemExists: jest.fn().mockResolvedValue(true)};
}

function makeModuleRepo(): ModuleRepository {
  return {
    findModuleForPatch: jest.fn(),
    renameModule: jest.fn(),
    changeContainer: jest.fn(),
    addDataPort: jest.fn(),
    removeDataPort: jest.fn(),
    addControlPort: jest.fn(),
    removeControlPort: jest.fn(),
    createModule: jest.fn().mockResolvedValue(undefined),
    createCkv: jest.fn(),
  };
}

function makeUow(
  overrides: {
    defRepo?: ModuleDefinitionRepository;
    subgraphRepo?: SubgraphRepository;
    containerRepo?: ContainerRepository;
    subsystemRepo?: SubsystemRepository;
    moduleRepo?: ModuleRepository;
  } = {},
): UnitOfWork {
  const commitSpy = jest.fn().mockResolvedValue(undefined);
  const rollbackSpy = jest.fn().mockResolvedValue(undefined);
  return {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: commitSpy,
    rollback: rollbackSpy,
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 1, fileSystemId: FILE_ID, mode: 'DESIGNER'},
      groupId: GROUP_ID,
    }),
    setWriteContext: jest.fn(),
    applyCachedActions: jest.fn().mockResolvedValue(undefined),
    getSessionRepository: jest.fn(),
    getBulkImportRepository: jest.fn(),
    getProjectRepository: jest.fn(),
    getValidationPreferencesRepository: jest.fn(),
    getValidationQueryService: jest.fn(),
    getModuleRepository: jest
      .fn()
      .mockReturnValue(overrides.moduleRepo ?? makeModuleRepo()),
    getContainerRepository: jest
      .fn()
      .mockReturnValue(overrides.containerRepo ?? makeContainerRepo()),
    getModuleDefinitionRepository: jest
      .fn()
      .mockReturnValue(overrides.defRepo ?? makeDefRepo()),
    getDataLinkRepository: jest.fn(),
    getControlLinkRepository: jest.fn(),
    getSubgraphRepository: jest
      .fn()
      .mockReturnValue(overrides.subgraphRepo ?? makeSubgraphRepo()),
    getSubsystemRepository: jest
      .fn()
      .mockReturnValue(overrides.subsystemRepo ?? makeSubsystemRepo()),
    getPropertyDefinitionsRepository: jest.fn().mockReturnValue({
      findSubgraphPropertyDefinitions: jest.fn().mockResolvedValue([]),
      findContainerPropertyDefinitions: jest.fn().mockResolvedValue([]),
    }),
  } as unknown as UnitOfWork;
}

let idSeq = 100;
function makeIdGen(): IdGenerationPort {
  return {getNextId: jest.fn().mockImplementation(() => idSeq++)};
}

function makeNaturalIdGen(): NaturalIdGenerationPort {
  const counters: Record<string, number> = {};
  return {
    registerBatch: jest.fn(),
    getNextId: jest.fn().mockImplementation((_fileId: number, type: string) => {
      counters[type] = (counters[type] ?? 0) + 1;
      return counters[type];
    }),
    release: jest.fn(),
    getRange: jest.fn(),
    setVmid: jest.fn(),
    getVmid: jest.fn(),
  } as unknown as NaturalIdGenerationPort;
}

describe('CreateModuleHandler — Variant 1 (auto-create subgraph + container)', () => {
  beforeEach(() => {
    idSeq = 100;
  });

  it('calls createSubgraph, createContainer and createModule; returns groupId + moduleSystemId', async () => {
    const subgraphRepo = makeSubgraphRepo();
    const containerRepo = makeContainerRepo();
    const moduleRepo = makeModuleRepo();
    const uow = makeUow({subgraphRepo, containerRepo, moduleRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    const result = await handler.handle(
      new CreateModuleCommand(42, 1, null, null, null),
    );
    expect(result.groupId).toBe(GROUP_ID);
    expect(result.moduleSystemId).toBeGreaterThan(0);
    expect(subgraphRepo.createSubgraph).toHaveBeenCalledTimes(1);
    expect(containerRepo.createContainer).toHaveBeenCalledTimes(1);
    expect(moduleRepo.createModule).toHaveBeenCalledTimes(1);
    expect(uow.commit).toHaveBeenCalled();
    expect(uow.rollback).not.toHaveBeenCalled();
  });

  it('initialises stack size = 0 on the auto-created container', async () => {
    const containerRepo = makeContainerRepo();
    const uow = makeUow({containerRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await handler.handle(new CreateModuleCommand(42, 1, null, null, null));

    const createdContainer = (
      containerRepo.createContainer as ReturnType<typeof jest.fn>
    ).mock.calls[0][0];
    expect(createdContainer.properties.has(0x08001013)).toBe(true);
  });

  it('uses first containerTypesSystemIds entry for the new container', async () => {
    const containerRepo = makeContainerRepo();
    const definition = makeDefinition({
      containerTypesSystemIds: new Set([77, 88]),
    });
    const uow = makeUow({containerRepo, defRepo: makeDefRepo(definition)});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await handler.handle(new CreateModuleCommand(42, 1, null, null, null));

    const createdContainer = (
      containerRepo.createContainer as ReturnType<typeof jest.fn>
    ).mock.calls[0][0];
    expect(createdContainer.containerTypeSystemId).toBe(77);
  });

  it('materialises static data ports from definition', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow({moduleRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await handler.handle(new CreateModuleCommand(42, 1, null, null, null));

    const module = (moduleRepo.createModule as ReturnType<typeof jest.fn>).mock
      .calls[0][0];
    expect(module.dataPorts).toHaveLength(1);
    expect(module.dataPorts[0].dataPortId).toBe(1);
    expect(module.dataPorts[0].isStatic).toBe(true);
  });

  it('materialises static control ports from definition', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow({moduleRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await handler.handle(new CreateModuleCommand(42, 1, null, null, null));

    const module = (moduleRepo.createModule as ReturnType<typeof jest.fn>).mock
      .calls[0][0];
    expect(module.controlPorts).toHaveLength(1);
    expect(module.controlPorts[0].portId).toBe(1);
    expect(module.controlPorts[0].isStatic).toBe(true);
  });
});

describe('CreateModuleHandler — Variant 2 (provided subgraph, auto-create container)', () => {
  beforeEach(() => {
    idSeq = 100;
  });

  it('validates that the provided subgraph exists', async () => {
    const subgraphRepo = makeSubgraphRepo();
    (
      subgraphRepo.subgraphExists as ReturnType<typeof jest.fn>
    ).mockResolvedValue(false);
    const uow = makeUow({subgraphRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await expect(
      handler.handle(new CreateModuleCommand(42, 1, null, 999, null)),
    ).rejects.toThrow(ResourceNotFoundException);
    expect(uow.rollback).toHaveBeenCalled();
    expect(subgraphRepo.createSubgraph).not.toHaveBeenCalled();
  });

  it('does not call createSubgraph when subgraphSystemId is provided', async () => {
    const subgraphRepo = makeSubgraphRepo();
    const uow = makeUow({subgraphRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await handler.handle(new CreateModuleCommand(42, 1, null, 77, null));

    expect(subgraphRepo.createSubgraph).not.toHaveBeenCalled();
  });
});

describe('CreateModuleHandler — Variant 3 (both provided)', () => {
  beforeEach(() => {
    idSeq = 100;
  });

  it('validates that the provided container exists', async () => {
    const containerRepo = makeContainerRepo();
    (
      containerRepo.containerExists as ReturnType<typeof jest.fn>
    ).mockResolvedValue(false);
    const uow = makeUow({containerRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await expect(
      handler.handle(new CreateModuleCommand(42, 1, null, 77, 88)),
    ).rejects.toThrow(ResourceNotFoundException);
    expect(uow.rollback).toHaveBeenCalled();
    expect(containerRepo.createContainer).not.toHaveBeenCalled();
  });
});

describe('CreateModuleHandler — failure paths', () => {
  beforeEach(() => {
    idSeq = 100;
  });

  it('throws ResourceNotFoundException when definition not found', async () => {
    const defRepo = makeDefRepo();
    (
      defRepo.findByModuleIdAndProcId as ReturnType<typeof jest.fn>
    ).mockResolvedValue(null);
    const uow = makeUow({defRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await expect(
      handler.handle(new CreateModuleCommand(99, 1, null, null, null)),
    ).rejects.toThrow(ResourceNotFoundException);
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException when parentId subsystem not found', async () => {
    const subsystemRepo = makeSubsystemRepo();
    (
      subsystemRepo.subsystemExists as ReturnType<typeof jest.fn>
    ).mockResolvedValue(false);
    const uow = makeUow({subsystemRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await expect(
      handler.handle(new CreateModuleCommand(42, 1, 555, null, null)),
    ).rejects.toThrow(ResourceNotFoundException);
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('rolls back and rethrows on unexpected error from createModule', async () => {
    const moduleRepo = makeModuleRepo();
    (moduleRepo.createModule as ReturnType<typeof jest.fn>).mockRejectedValue(
      new Error('DB error'),
    );
    const uow = makeUow({moduleRepo});
    const handler = new CreateModuleHandler(
      uow,
      makeIdGen(),
      makeNaturalIdGen(),
    );

    await expect(
      handler.handle(new CreateModuleCommand(42, 1, null, null, null)),
    ).rejects.toThrow('DB error');
    expect(uow.rollback).toHaveBeenCalled();
    expect(uow.commit).not.toHaveBeenCalled();
  });
});
