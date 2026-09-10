/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {DataPort, PORT_IO_TYPE, Subsystem} from '@arc/core';
import type {
  ControlLinkRepository,
  DataLinkRepository,
  IdGenerationPort,
  NaturalIdGenerationPort,
  SubsystemRepository,
  UnitOfWork,
} from '@arc/core';
import {CreateSubsystemHandler} from '../../../../../src/application/usecase-designer/subsystem/create/create-subsystem.handler.js';
import {CreateSubsystemCommand} from '../../../../../src/application/usecase-designer/subsystem/create/create-subsystem.command.js';
import {DeleteSubsystemHandler} from '../../../../../src/application/usecase-designer/subsystem/delete/delete-subsystem.handler.js';
import {DeleteSubsystemCommand} from '../../../../../src/application/usecase-designer/subsystem/delete/delete-subsystem.command.js';
import {MoveSubsystemComponentsHandler} from '../../../../../src/application/usecase-designer/subsystem/move/move-subsystem-components.handler.js';
import {MoveSubsystemComponentsCommand} from '../../../../../src/application/usecase-designer/subsystem/move/move-subsystem-components.command.js';
import {PatchSubsystemHandler} from '../../../../../src/application/usecase-designer/subsystem/patch/patch-subsystem.handler.js';
import {PatchSubsystemCommand} from '../../../../../src/application/usecase-designer/subsystem/patch/patch-subsystem.command.js';
import {SetSubsystemFilteredKeysHandler} from '../../../../../src/application/usecase-designer/subsystem/set-filtered-keys/set-subsystem-filtered-keys.handler.js';
import {SetSubsystemFilteredKeysCommand} from '../../../../../src/application/usecase-designer/subsystem/set-filtered-keys/set-subsystem-filtered-keys.command.js';

const FILE_ID = 10;
const GROUP_ID = 'test-group';
const SUBSYSTEM_ID = 100;

function makeSubsystem(overrides: Partial<Subsystem> = {}): Subsystem {
  return new Subsystem({
    systemId: SUBSYSTEM_ID,
    fileSystemId: FILE_ID,
    parentId: undefined,
    name: 'Subsystem',
    subsystemId: 1,
    filteredKeySystemIds: [],
    dataPorts: [],
    controlPorts: [],
    ...overrides,
  });
}

function makeSubsystemRepository(
  overrides: Record<string, unknown> = {},
): SubsystemRepository {
  return {
    findSubsystems: jest.fn().mockResolvedValue([]),
    findNodeTopology: jest.fn().mockResolvedValue([]),
    findSubsystemForPatch: jest.fn().mockResolvedValue(makeSubsystem()),
    findKeyDefinitionsByIds: jest.fn().mockResolvedValue([]),
    subsystemExists: jest.fn().mockResolvedValue(true),
    hasSubsystems: jest.fn().mockResolvedValue(true),
    clearControlPortIntents: jest.fn(),
    createSubsystem: jest.fn(),
    deleteSubsystem: jest.fn(),
    renameSubsystem: jest.fn(),
    setFilteredKeys: jest.fn(),
    addDataPort: jest.fn(),
    removeDataPort: jest.fn(),
    addControlPort: jest.fn(),
    removeControlPort: jest.fn(),
    updateParentId: jest.fn(),
    ...overrides,
  } as unknown as SubsystemRepository;
}

function makeDataLinkRepository(
  overrides: Record<string, unknown> = {},
): DataLinkRepository {
  return {
    getLinksByPortSystemIds: jest.fn().mockResolvedValue([]),
    findAllWithSegments: jest.fn().mockResolvedValue([]),
    replaceSubsystemDataLinkSegments: jest.fn(),
    ...overrides,
  } as unknown as DataLinkRepository;
}

function makeControlLinkRepository(
  overrides: Record<string, unknown> = {},
): ControlLinkRepository {
  return {
    getLinksByPortSystemIds: jest.fn().mockResolvedValue([]),
    findAllWithSegments: jest.fn().mockResolvedValue([]),
    replaceSubsystemControlLinkSegments: jest.fn(),
    ...overrides,
  } as unknown as ControlLinkRepository;
}

function makeUow(
  options: {
    subsystemRepository?: SubsystemRepository;
    dataLinkRepository?: DataLinkRepository;
    controlLinkRepository?: ControlLinkRepository;
    moduleRepository?: Record<string, unknown>;
  } = {},
): UnitOfWork {
  return {
    startTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 1, fileSystemId: FILE_ID, mode: 'DESIGNER'},
      groupId: GROUP_ID,
    }),
    getSubsystemRepository: jest
      .fn()
      .mockReturnValue(
        options.subsystemRepository ?? makeSubsystemRepository(),
      ),
    getDataLinkRepository: jest
      .fn()
      .mockReturnValue(options.dataLinkRepository ?? makeDataLinkRepository()),
    getControlLinkRepository: jest
      .fn()
      .mockReturnValue(
        options.controlLinkRepository ?? makeControlLinkRepository(),
      ),
    getModuleRepository: jest.fn().mockReturnValue({
      findModulesBySubgraphId: jest.fn().mockResolvedValue([]),
      updateParentId: jest.fn(),
      ...options.moduleRepository,
    }),
  } as unknown as UnitOfWork;
}

function makeIdGeneration(): IdGenerationPort {
  return {getNextId: jest.fn().mockResolvedValue(900)};
}

function makeNaturalIdGeneration(): NaturalIdGenerationPort {
  return {
    getNextId: jest.fn().mockReturnValue(7),
  } as unknown as NaturalIdGenerationPort;
}

describe('CreateSubsystemHandler', () => {
  it('creates an auto-named root subsystem', async () => {
    const repository = makeSubsystemRepository();
    const uow = makeUow({subsystemRepository: repository});
    const handler = new CreateSubsystemHandler(
      uow,
      makeIdGeneration(),
      makeNaturalIdGeneration(),
    );

    const result = await handler.handle(
      new CreateSubsystemCommand(FILE_ID, undefined, undefined),
    );

    expect(result).toMatchObject({
      groupId: GROUP_ID,
      subsystemSystemId: 900,
      naturalId: 7,
      name: 'SS_0x00000007',
    });
    expect(repository.createSubsystem).toHaveBeenCalledTimes(1);
    expect(uow.commit).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate names', async () => {
    const repository = makeSubsystemRepository({
      findSubsystems: jest
        .fn()
        .mockResolvedValue([{systemId: 1, name: 'Existing'}]),
    });
    const uow = makeUow({subsystemRepository: repository});
    const handler = new CreateSubsystemHandler(
      uow,
      makeIdGeneration(),
      makeNaturalIdGeneration(),
    );

    await expect(
      handler.handle(
        new CreateSubsystemCommand(FILE_ID, 'existing', undefined),
      ),
    ).rejects.toThrow('already in use');
    expect(uow.rollback).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteSubsystemHandler', () => {
  it('rejects a subsystem that still has children', async () => {
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue([
        {
          systemId: SUBSYSTEM_ID,
          naturalId: 1,
          name: 'Parent',
          parentId: undefined,
          subgraphSystemIds: [],
        },
        {
          systemId: 101,
          naturalId: 2,
          name: 'Child',
          parentId: SUBSYSTEM_ID,
          subgraphSystemIds: [],
        },
      ]),
    });
    const uow = makeUow({subsystemRepository: repository});

    await expect(
      new DeleteSubsystemHandler(uow).handle(
        new DeleteSubsystemCommand(SUBSYSTEM_ID, FILE_ID),
      ),
    ).rejects.toThrow('not empty');
    expect(repository.deleteSubsystem).not.toHaveBeenCalled();
  });

  it('deletes an empty subsystem and returns its snapshot', async () => {
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue([
        {
          systemId: SUBSYSTEM_ID,
          naturalId: 1,
          name: 'Empty',
          parentId: undefined,
          subgraphSystemIds: [],
        },
      ]),
    });
    const uow = makeUow({subsystemRepository: repository});

    const result = await new DeleteSubsystemHandler(uow).handle(
      new DeleteSubsystemCommand(SUBSYSTEM_ID, FILE_ID),
    );

    expect(result.deletedSubsystemSnapshot).toMatchObject({
      systemId: SUBSYSTEM_ID,
      naturalId: 1,
      name: 'Empty',
    });
    expect(repository.deleteSubsystem).toHaveBeenCalledWith(SUBSYSTEM_ID);
  });
});

describe('SetSubsystemFilteredKeysHandler', () => {
  it('rejects a missing key definition', async () => {
    const repository = makeSubsystemRepository({
      findKeyDefinitionsByIds: jest.fn().mockResolvedValue([]),
    });
    const uow = makeUow({subsystemRepository: repository});

    await expect(
      new SetSubsystemFilteredKeysHandler(uow).handle(
        new SetSubsystemFilteredKeysCommand(SUBSYSTEM_ID, FILE_ID, [500]),
      ),
    ).rejects.toThrow('KeyDefinition 500 not found');
    expect(repository.setFilteredKeys).not.toHaveBeenCalled();
  });

  it('sets valid filtered keys and returns them', async () => {
    const keys = [{systemId: 500, keyId: 9, name: 'Mode'}];
    const repository = makeSubsystemRepository({
      findKeyDefinitionsByIds: jest.fn().mockResolvedValue(keys),
    });
    const uow = makeUow({subsystemRepository: repository});

    const result = await new SetSubsystemFilteredKeysHandler(uow).handle(
      new SetSubsystemFilteredKeysCommand(SUBSYSTEM_ID, FILE_ID, [500]),
    );

    expect(result.filteredKeys).toEqual(keys);
    expect(repository.setFilteredKeys).toHaveBeenCalledWith(
      SUBSYSTEM_ID,
      [500],
    );
  });
});

describe('PatchSubsystemHandler', () => {
  it('rejects an empty patch', async () => {
    const uow = makeUow();
    const handler = new PatchSubsystemHandler(uow, makeIdGeneration());

    await expect(
      handler.handle(
        new PatchSubsystemCommand(
          SUBSYSTEM_ID,
          FILE_ID,
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ),
    ).rejects.toThrow('At least one field must be provided');
    expect(uow.startTransaction).not.toHaveBeenCalled();
  });

  it('removes the only free port when reducing a count by one', async () => {
    const ports = [
      new DataPort({
        systemId: 101,
        dataPortId: 1,
        portIoType: PORT_IO_TYPE.Input,
        isStatic: false,
      }),
      new DataPort({
        systemId: 102,
        dataPortId: 2,
        portIoType: PORT_IO_TYPE.Input,
        isStatic: false,
      }),
      new DataPort({
        systemId: 103,
        dataPortId: 3,
        portIoType: PORT_IO_TYPE.Input,
        isStatic: false,
      }),
    ];
    const repository = makeSubsystemRepository({
      findSubsystemForPatch: jest
        .fn()
        .mockResolvedValue(makeSubsystem({dataPorts: ports})),
    });
    const dataLinks = makeDataLinkRepository({
      getLinksByPortSystemIds: jest.fn().mockResolvedValue([
        {portSystemId: 101, linkSystemId: 700},
        {portSystemId: 103, linkSystemId: 701},
      ]),
    });
    const uow = makeUow({
      subsystemRepository: repository,
      dataLinkRepository: dataLinks,
    });

    await new PatchSubsystemHandler(uow, makeIdGeneration()).handle(
      new PatchSubsystemCommand(
        SUBSYSTEM_ID,
        FILE_ID,
        undefined,
        2,
        undefined,
        undefined,
      ),
    );

    expect(repository.removeDataPort).toHaveBeenCalledWith(102, SUBSYSTEM_ID);
    expect(uow.commit).toHaveBeenCalledTimes(1);
  });
});

describe('MoveSubsystemComponentsHandler', () => {
  it('rejects an empty move request', async () => {
    const uow = makeUow();

    await expect(
      new MoveSubsystemComponentsHandler(uow, makeIdGeneration()).handle(
        new MoveSubsystemComponentsCommand(FILE_ID, [], [], null),
      ),
    ).rejects.toThrow('At least one component system ID');
  });

  it('moves a subsystem and returns empty impact collections when wiring is unchanged', async () => {
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue([
        {
          systemId: SUBSYSTEM_ID,
          naturalId: 1,
          name: 'Source',
          parentId: undefined,
          subgraphSystemIds: [],
        },
        {
          systemId: 200,
          naturalId: 2,
          name: 'Target',
          parentId: undefined,
          subgraphSystemIds: [],
        },
      ]),
      findNodeTopology: jest.fn().mockResolvedValue([
        {systemId: SUBSYSTEM_ID, parentId: null, type: 'subsystem'},
        {systemId: 200, parentId: null, type: 'subsystem'},
      ]),
    });
    const uow = makeUow({subsystemRepository: repository});

    const result = await new MoveSubsystemComponentsHandler(
      uow,
      makeIdGeneration(),
    ).handle(
      new MoveSubsystemComponentsCommand(FILE_ID, [], [SUBSYSTEM_ID], 200),
    );

    expect(repository.updateParentId).toHaveBeenCalledWith(SUBSYSTEM_ID, 200);
    expect(result.addedDataLinks).toEqual([]);
    expect(result.removedDataLinks).toEqual([]);
    expect(result.addedControlLinks).toEqual([]);
    expect(result.subsystemPortChanges).toEqual([]);
  });
});
