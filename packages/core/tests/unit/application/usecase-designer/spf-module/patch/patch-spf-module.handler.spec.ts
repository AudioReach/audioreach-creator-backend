/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';

import {PatchSpfModuleCommand} from '../../../../../../src/application/usecase-designer/spf-module/patch/patch-spf-module.command.js';
import {PatchSpfModuleHandler} from '../../../../../../src/application/usecase-designer/spf-module/patch/patch-spf-module.handler.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
  DomainRuleViolationException,
  PORT_IO_TYPE,
  MODULE_PORT_STRATEGIES,
} from '@arc/core';
import type {
  UnitOfWork,
  ModuleRepository,
  ContainerRepository,
  ModuleDefinitionRepository,
  DataLinkRepository,
  ControlLinkRepository,
  IdGenerationPort,
  ProjectRepository,
} from '@arc/core';
import {SpfModule} from '../../../../../../src/domain/entities/usecase-data/module/spf-module.js';
import {DataPort} from '../../../../../../src/domain/entities/usecase-data/node/entities/data-port.js';
import {ControlPort} from '../../../../../../src/domain/entities/usecase-data/node/entities/control-port.js';

const FILE_ID = 10;
const MODULE_ID = 100;
const GROUP_ID = 'test-group-uuid';

function makeModule(
  overrides: {dataPorts?: DataPort[]; controlPorts?: ControlPort[]} = {},
): SpfModule {
  return new SpfModule({
    systemId: MODULE_ID,
    fileSystemId: FILE_ID,
    instanceId: 1,
    definitionSystemId: 200,
    containerSystemId: 300,
    subgraphSystemId: 400,
    dataPorts: overrides.dataPorts ?? [],
    controlPorts: overrides.controlPorts ?? [],
  });
}

function makeModuleRepo(
  overrides: Partial<ModuleRepository> = {},
): ModuleRepository {
  return {
    findModuleForPatch: jest.fn().mockResolvedValue(makeModule()),
    renameModule: jest.fn().mockResolvedValue(undefined),
    changeContainer: jest.fn().mockResolvedValue(undefined),
    addDataPort: jest.fn().mockResolvedValue(undefined),
    removeDataPort: jest.fn().mockResolvedValue(undefined),
    addControlPort: jest.fn().mockResolvedValue(undefined),
    removeControlPort: jest.fn().mockResolvedValue(undefined),
    createModule: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeContainerRepo(
  overrides: Partial<ContainerRepository> = {},
): ContainerRepository {
  return {
    containerExists: jest.fn().mockResolvedValue(true),
    getContainerById: jest.fn().mockResolvedValue(null),
    createContainer: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDefRepo(
  overrides: Partial<ModuleDefinitionRepository> = {},
): ModuleDefinitionRepository {
  return {
    findBySystemId: jest.fn().mockResolvedValue(null),
    findByModuleIdAndProcId: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeLinkRepo(): DataLinkRepository {
  return {getLinksByPortSystemIds: jest.fn().mockResolvedValue([])};
}

function makeControlLinkRepo(): ControlLinkRepository {
  return {getLinksByPortSystemIds: jest.fn().mockResolvedValue([])};
}

function makeProjectRepo(strategy: string | null = null): ProjectRepository {
  return {
    getPortStrategy: jest.fn().mockResolvedValue(strategy),
    createOfflineProject: jest.fn(),
    updateFileStatus: jest.fn(),
    deleteProject: jest.fn(),
    updateFileHeader: jest.fn(),
  } as unknown as ProjectRepository;
}

function makeUow(
  repos: {
    moduleRepo?: ModuleRepository;
    containerRepo?: ContainerRepository;
    defRepo?: ModuleDefinitionRepository;
    dataLinkRepo?: DataLinkRepository;
    controlLinkRepo?: ControlLinkRepository;
    projectRepo?: ProjectRepository;
  } = {},
): UnitOfWork {
  const startTransaction = jest.fn().mockResolvedValue(undefined);
  const commit = jest.fn().mockResolvedValue(undefined);
  const rollback = jest.fn().mockResolvedValue(undefined);
  const isInTransaction = jest.fn().mockReturnValue(true);
  return {
    startTransaction,
    commit,
    rollback,
    isInTransaction,
    getWriteContext: jest.fn().mockReturnValue({
      session: {
        sessionId: 1,
        fileSystemId: FILE_ID,
        mode: 'DESIGNER',
        projectId: '1',
      },
      groupId: GROUP_ID,
    }),
    setWriteContext: jest.fn(),
    applyCachedActions: jest.fn().mockResolvedValue(undefined),
    getSessionRepository: jest.fn(),
    getModuleRepository: jest
      .fn()
      .mockReturnValue(repos.moduleRepo ?? makeModuleRepo()),
    getContainerRepository: jest
      .fn()
      .mockReturnValue(repos.containerRepo ?? makeContainerRepo()),
    getModuleDefinitionRepository: jest
      .fn()
      .mockReturnValue(repos.defRepo ?? makeDefRepo()),
    getDataLinkRepository: jest
      .fn()
      .mockReturnValue(repos.dataLinkRepo ?? makeLinkRepo()),
    getControlLinkRepository: jest
      .fn()
      .mockReturnValue(repos.controlLinkRepo ?? makeControlLinkRepo()),
    getBulkImportRepository: jest.fn(),
    getProjectRepository: jest
      .fn()
      .mockReturnValue(repos.projectRepo ?? makeProjectRepo()),
    getValidationPreferencesRepository: jest.fn(),
    getValidationQueryService: jest.fn(),
  } as unknown as UnitOfWork;
}

const idGeneration: IdGenerationPort = {
  getNextId: jest.fn().mockResolvedValue(999),
};

/** Plain object matching SpfModuleDefinition shape for port-count tests */
function makeDefinitionWithInputPorts(maxAllowedPortCount: number): any {
  return {
    containerTypesSystemIds: new Set<number>([]),
    dataPortGroups: [
      {portIoType: 'INPUT', maxAllowedPortCount, staticPortDefinitions: []},
    ],
    staticControlPorts: [],
    dynamicIntents: [],
  };
}

describe('PatchSpfModuleHandler', () => {
  let handler: PatchSpfModuleHandler;
  let uow: UnitOfWork;

  beforeEach(() => {
    uow = makeUow();
    handler = new PatchSpfModuleHandler(uow, idGeneration);
  });

  it('throws InvalidOperationException when no fields provided', async () => {
    const cmd = new PatchSpfModuleCommand(MODULE_ID);
    await expect(handler.handle(cmd)).rejects.toThrow(
      InvalidOperationException,
    );
    expect(uow.startTransaction).not.toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException and calls rollback when module does not exist', async () => {
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(null),
    });
    uow = makeUow({moduleRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    const cmd = new PatchSpfModuleCommand(MODULE_ID, 'alias');
    await expect(handler.handle(cmd)).rejects.toThrow(
      ResourceNotFoundException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('alias-only: calls renameModule once and commits', async () => {
    const moduleRepo = makeModuleRepo();
    uow = makeUow({moduleRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    const cmd = new PatchSpfModuleCommand(MODULE_ID, 'new-alias');
    const result = await handler.handle(cmd);
    expect(moduleRepo.renameModule).toHaveBeenCalledWith(
      MODULE_ID,
      'new-alias',
    );
    expect(moduleRepo.changeContainer).not.toHaveBeenCalled();
    expect(uow.commit).toHaveBeenCalled();
    expect(result.groupId).toBe(GROUP_ID);
  });

  it('containerId: auto-creates container when target does not exist', async () => {
    const currentContainer = {
      systemId: 300,
      containerId: 1,
      containerTypeSystemId: 5,
      fileSystemId: FILE_ID,
      properties: new Map(),
    };
    const containerRepo = makeContainerRepo({
      getContainerById: jest
        .fn()
        .mockImplementation((id: number) =>
          id === 300
            ? Promise.resolve(currentContainer)
            : Promise.resolve(null),
        ),
    });
    const definition = {
      containerTypesSystemIds: new Set([5]),
      dataPortGroups: [],
      staticControlPorts: [],
      dynamicIntents: [],
    };
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue(definition),
    });
    uow = makeUow({containerRepo, defRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    const cmd = new PatchSpfModuleCommand(MODULE_ID, undefined, 42);
    await handler.handle(cmd);
    expect(containerRepo.createContainer).toHaveBeenCalled();
  });

  it('containerId: calls changeContainer when target exists and properties match', async () => {
    const currentContainer = {
      systemId: 300,
      containerId: 1,
      containerTypeSystemId: 5,
      fileSystemId: FILE_ID,
      properties: new Map(),
    };
    const targetContainer = {
      systemId: 42,
      containerId: 2,
      containerTypeSystemId: 5,
      fileSystemId: FILE_ID,
      properties: new Map(),
    };
    const containerRepo = makeContainerRepo({
      getContainerById: jest
        .fn()
        .mockImplementation((id: number) =>
          id === 300
            ? Promise.resolve(currentContainer)
            : Promise.resolve(targetContainer),
        ),
    });
    const definition = {
      containerTypesSystemIds: new Set([5]),
      dataPortGroups: [],
      staticControlPorts: [],
      dynamicIntents: [],
    };
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue(definition),
    });
    const moduleRepo = makeModuleRepo();
    uow = makeUow({containerRepo, defRepo, moduleRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    const cmd = new PatchSpfModuleCommand(MODULE_ID, undefined, 42);
    await handler.handle(cmd);
    expect(moduleRepo.changeContainer).toHaveBeenCalledWith(MODULE_ID, 42);
  });

  it('containerId: throws DomainRuleViolationException on type incompatible', async () => {
    const currentContainer = {
      systemId: 300,
      containerId: 1,
      containerTypeSystemId: 5,
      fileSystemId: FILE_ID,
      properties: new Map(),
    };
    const targetContainer = {
      systemId: 42,
      containerId: 2,
      containerTypeSystemId: 9,
      fileSystemId: FILE_ID,
      properties: new Map(),
    };
    const containerRepo = makeContainerRepo({
      getContainerById: jest
        .fn()
        .mockImplementation((id: number) =>
          id === 300
            ? Promise.resolve(currentContainer)
            : Promise.resolve(targetContainer),
        ),
    });
    // definition only allows containerTypeSystemId=5, not 9
    const definition = {
      containerTypesSystemIds: new Set([5]),
      dataPortGroups: [],
      staticControlPorts: [],
      dynamicIntents: [],
    };
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue(definition),
    });
    uow = makeUow({containerRepo, defRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    const cmd = new PatchSpfModuleCommand(MODULE_ID, undefined, 42);
    await expect(handler.handle(cmd)).rejects.toThrow(
      DomainRuleViolationException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('maxInputPortsSupported increase: calls addDataPort the correct number of times', async () => {
    const existingPort = new DataPort({
      systemId: 1,
      dataPortId: 1,
      portIoType: 'INPUT',
      isStatic: false,
    });
    const module = makeModule({dataPorts: [existingPort]});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const definition = makeDefinitionWithInputPorts(4);
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue(definition),
    });
    uow = makeUow({moduleRepo, defRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    // 1 existing INPUT port, requesting 3 → need to add 2
    const cmd = new PatchSpfModuleCommand(MODULE_ID, undefined, undefined, 3);
    await handler.handle(cmd);
    expect(moduleRepo.addDataPort).toHaveBeenCalledTimes(2);
  });

  it('maxInputPortsSupported decrease: blocked by linked port, throws DomainRuleViolationException', async () => {
    const portA = new DataPort({
      systemId: 1,
      dataPortId: 1,
      portIoType: 'INPUT',
      isStatic: false,
    });
    const portB = new DataPort({
      systemId: 2,
      dataPortId: 2,
      portIoType: 'INPUT',
      isStatic: false,
    });
    const module = makeModule({dataPorts: [portA, portB]});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const dataLinkRepo: DataLinkRepository = {
      getLinksByPortSystemIds: jest.fn().mockResolvedValue([
        {linkSystemId: 10, portSystemId: 1},
        {linkSystemId: 11, portSystemId: 2},
      ]),
    };
    const definition = makeDefinitionWithInputPorts(4);
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue(definition),
    });
    uow = makeUow({moduleRepo, defRepo, dataLinkRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    const cmd = new PatchSpfModuleCommand(MODULE_ID, undefined, undefined, 0);
    await expect(handler.handle(cmd)).rejects.toThrow(
      DomainRuleViolationException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('maxInputPortsSupported decrease: removes ports LIFO when no links', async () => {
    const portA = new DataPort({
      systemId: 1,
      dataPortId: 1,
      portIoType: 'INPUT',
      isStatic: false,
    });
    const portB = new DataPort({
      systemId: 3,
      dataPortId: 3,
      portIoType: 'INPUT',
      isStatic: false,
    });
    const module = makeModule({dataPorts: [portA, portB]});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const definition = makeDefinitionWithInputPorts(4);
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue(definition),
    });
    uow = makeUow({moduleRepo, defRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    // 2 INPUT ports, requesting 1 → remove highest systemId (3) first (LIFO)
    const cmd = new PatchSpfModuleCommand(MODULE_ID, undefined, undefined, 1);
    await handler.handle(cmd);
    expect(moduleRepo.removeDataPort).toHaveBeenCalledWith(3, MODULE_ID);
    expect(moduleRepo.removeDataPort).toHaveBeenCalledTimes(1);
  });

  it('maxControlPortsSupported increase: throws DomainRuleViolationException when no available intents', async () => {
    // Existing dynamic port holds intent types 1 and 2; both have maxPort=1.
    // CurrentUsage(1)=1 == maxPort(1), CurrentUsage(2)=1 == maxPort(1) → no slots available.
    const existingCp = new ControlPort({
      systemId: 1,
      portId: 1,
      isStatic: false,
      nodeSystemId: MODULE_ID,
      intentSystemIds: [10, 11],
      intentTypeIds: [1, 2], // type IDs matching the dynamic intent pool
    });
    const module = makeModule({controlPorts: [existingCp]});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const definition = {
      containerTypesSystemIds: new Set<number>([]),
      dataPortGroups: [],
      staticControlPorts: [{portId: 1}, {portId: 2}], // length=2 → max control ports
      dynamicIntents: [
        {intentId: 1, maxPort: 1}, // at capacity
        {intentId: 2, maxPort: 1}, // at capacity
      ],
    };
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue(definition),
    });
    uow = makeUow({moduleRepo, defRepo});
    handler = new PatchSpfModuleHandler(uow, idGeneration);
    // Requesting 2 control ports, currently have 1 → need to add 1, but 0 intent slots available
    const cmd = new PatchSpfModuleCommand(
      MODULE_ID,
      undefined,
      undefined,
      undefined,
      undefined,
      2,
    );
    await expect(handler.handle(cmd)).rejects.toThrow(
      DomainRuleViolationException,
    );
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('multi-field patch: commits once; rollback NOT called', async () => {
    const cmd = new PatchSpfModuleCommand(MODULE_ID, 'alias');
    await handler.handle(cmd);
    expect(uow.commit).toHaveBeenCalledTimes(1);
    expect(uow.rollback).not.toHaveBeenCalled();
  });
});

describe('PatchSpfModuleHandler — port ID generation', () => {
  it('assigns gap-filling dataPortId when adding input ports (SEQUENTIAL)', async () => {
    // Module has input ports at IDs {1, 4, 5} — gaps at 2 and 3.
    // Requesting 5 (currently 3) → add 2 → should assign dataPortId 2 then 3.
    const existingInputPorts = [
      new DataPort({
        systemId: 10,
        dataPortId: 1,
        portIoType: PORT_IO_TYPE.Input,
        isStatic: true,
      }),
      new DataPort({
        systemId: 11,
        dataPortId: 4,
        portIoType: PORT_IO_TYPE.Input,
        isStatic: false,
      }),
      new DataPort({
        systemId: 12,
        dataPortId: 5,
        portIoType: PORT_IO_TYPE.Input,
        isStatic: false,
      }),
    ];
    const module = makeModule({dataPorts: existingInputPorts});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue({
        containerTypesSystemIds: new Set<number>(),
        dataPortGroups: [
          {
            portIoType: PORT_IO_TYPE.Input,
            maxAllowedPortCount: 10,
            staticPortDefinitions: [],
          },
        ],
        staticControlPorts: [],
        dynamicIntents: [],
      }),
    });
    const projectRepo = makeProjectRepo(MODULE_PORT_STRATEGIES.SEQUENTIAL);
    const testUow = makeUow({moduleRepo, defRepo, projectRepo});
    const testHandler = new PatchSpfModuleHandler(testUow, idGeneration);

    await testHandler.handle(
      new PatchSpfModuleCommand(MODULE_ID, undefined, undefined, 5),
    );

    const addCalls = (moduleRepo.addDataPort as ReturnType<typeof jest.fn>).mock
      .calls;
    expect(addCalls).toHaveLength(2);
    const addedIds = addCalls.map(
      (c: unknown[]) => (c[0] as DataPort).dataPortId,
    );
    expect(addedIds).toEqual([2, 3]);
  });

  it('assigns gap-filling portId when adding control ports (starts at 0x80000000)', async () => {
    // Module has one dynamic control port at 0x80000000; requesting 2 → add 1 → should be 0x80000001.
    const existingControlPort = new ControlPort({
      systemId: 20,
      portId: 0x80000000,
      isStatic: false,
      nodeSystemId: MODULE_ID,
      name: 'cp0',
      intentSystemIds: [],
      intentTypeIds: [],
    });
    const module = makeModule({controlPorts: [existingControlPort]});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue({
        containerTypesSystemIds: new Set<number>(),
        dataPortGroups: [],
        staticControlPorts: [{portId: 1}, {portId: 2}], // length=2 → maxAllowed=2
        dynamicIntents: [{intentId: 1, maxPort: 10}], // 10 slots available
      }),
    });
    const testUow = makeUow({moduleRepo, defRepo});
    const testHandler = new PatchSpfModuleHandler(testUow, idGeneration);

    await testHandler.handle(
      new PatchSpfModuleCommand(
        MODULE_ID,
        undefined,
        undefined,
        undefined,
        undefined,
        2,
      ),
    );

    const addCalls = (moduleRepo.addControlPort as ReturnType<typeof jest.fn>)
      .mock.calls;
    expect(addCalls).toHaveLength(1);
    expect((addCalls[0][0] as ControlPort).portId).toBe(0x80000001);
  });

  it('does not call getPortStrategy on alias-only patch', async () => {
    const projectRepo = makeProjectRepo();
    const testUow = makeUow({projectRepo});
    const testHandler = new PatchSpfModuleHandler(testUow, idGeneration);

    await testHandler.handle(new PatchSpfModuleCommand(MODULE_ID, 'new-name'));

    expect(projectRepo.getPortStrategy).not.toHaveBeenCalled();
  });
});

describe('PatchSpfModuleHandler — static port protection', () => {
  it('throws DomainRuleViolationException when requested < static input port count', async () => {
    // Module has 2 static input ports; requesting 1 is below the static minimum.
    const staticPort1 = new DataPort({
      systemId: 1,
      dataPortId: 2,
      portIoType: PORT_IO_TYPE.Input,
      isStatic: true,
    });
    const staticPort2 = new DataPort({
      systemId: 2,
      dataPortId: 4,
      portIoType: PORT_IO_TYPE.Input,
      isStatic: true,
    });
    const module = makeModule({dataPorts: [staticPort1, staticPort2]});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue({
        containerTypesSystemIds: new Set<number>(),
        dataPortGroups: [
          {
            portIoType: PORT_IO_TYPE.Input,
            maxAllowedPortCount: 4,
            staticPortDefinitions: [],
          },
        ],
        staticControlPorts: [],
        dynamicIntents: [],
      }),
    });
    const testUow = makeUow({moduleRepo, defRepo});
    const testHandler = new PatchSpfModuleHandler(testUow, idGeneration);

    await expect(
      testHandler.handle(
        new PatchSpfModuleCommand(MODULE_ID, undefined, undefined, 1),
      ),
    ).rejects.toThrow(DomainRuleViolationException);
    expect(testUow.rollback).toHaveBeenCalled();
    // Static ports must not be removed
    expect(moduleRepo.removeDataPort).not.toHaveBeenCalled();
  });

  it('throws DomainRuleViolationException when requested < static control port count', async () => {
    // Module has 1 static control port; requesting 0 is below the static minimum.
    const staticCp = new ControlPort({
      systemId: 10,
      portId: 1,
      isStatic: true,
      nodeSystemId: MODULE_ID,
      intentSystemIds: [],
    });
    const module = makeModule({controlPorts: [staticCp]});
    const moduleRepo = makeModuleRepo({
      findModuleForPatch: jest.fn().mockResolvedValue(module),
    });
    const defRepo = makeDefRepo({
      findBySystemId: jest.fn().mockResolvedValue({
        containerTypesSystemIds: new Set<number>(),
        dataPortGroups: [],
        staticControlPorts: [{portId: 1}],
        dynamicIntents: [],
      }),
    });
    const testUow = makeUow({moduleRepo, defRepo});
    const testHandler = new PatchSpfModuleHandler(testUow, idGeneration);

    await expect(
      testHandler.handle(
        new PatchSpfModuleCommand(
          MODULE_ID,
          undefined,
          undefined,
          undefined,
          undefined,
          0,
        ),
      ),
    ).rejects.toThrow(DomainRuleViolationException);
    expect(testUow.rollback).toHaveBeenCalled();
    expect(moduleRepo.removeControlPort).not.toHaveBeenCalled();
  });
});
