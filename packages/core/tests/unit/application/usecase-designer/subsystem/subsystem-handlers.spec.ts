/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {
  DataLink,
  DataPort,
  LINK_TYPE,
  PORT_IO_TYPE,
  SubsystemDataLink,
  Subsystem,
} from '@arc/core';
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
    parentSystemId: undefined,
    name: 'Subsystem',
    naturalId: 1,
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
    findSubsystemFileSystemId: jest.fn().mockResolvedValue(null),
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
    findSubsystemDataRouteContext: jest.fn().mockResolvedValue({
      subsystemDataLinks: [],
      nodeTypeBySystemId: new Map(),
    }),
    deleteSubsystemDataLinks: jest.fn(),
    replaceSubsystemDataLinkSegments: jest.fn(),
    replaceUnresolvedSubsystemDataLinkSegments: jest.fn(),
    ...overrides,
  } as unknown as DataLinkRepository;
}

function makeControlLinkRepository(
  overrides: Record<string, unknown> = {},
): ControlLinkRepository {
  return {
    getLinksByPortSystemIds: jest.fn().mockResolvedValue([]),
    findAllWithSegments: jest.fn().mockResolvedValue([]),
    findSubsystemControlRouteContext: jest.fn().mockResolvedValue({
      subsystemControlLinks: [],
      nodeTypeBySystemId: new Map(),
    }),
    deleteSubsystemControlLinks: jest.fn(),
    replaceSubsystemControlLinkSegments: jest.fn(),
    replaceUnresolvedSubsystemControlLinkSegments: jest.fn(),
    ...overrides,
  } as unknown as ControlLinkRepository;
}

function makeUow(
  options: {
    subsystemRepository?: SubsystemRepository;
    dataLinkRepository?: DataLinkRepository;
    controlLinkRepository?: ControlLinkRepository;
    moduleRepository?: Record<string, unknown>;
    subgraphRepository?: Record<string, unknown>;
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
      findModulesBySubgraphIds: jest.fn().mockResolvedValue([]),
      updateParentId: jest.fn(),
      ...options.moduleRepository,
    }),
    getSubgraphRepository: jest.fn().mockReturnValue({
      findSubgraphFileSystemId: jest.fn().mockResolvedValue(null),
      subgraphExists: jest.fn().mockResolvedValue(true),
      ...options.subgraphRepository,
    }),
  } as unknown as UnitOfWork;
}

function makeDataLink(
  systemId: number,
  sourceNodeSystemId: number,
  destinationNodeSystemId: number,
  subsystemDataLinks: SubsystemDataLink[] = [],
): DataLink {
  return new DataLink({
    systemId,
    sourceNodeSystemId,
    destinationNodeSystemId,
    sourcePortSystemId: systemId + 1000,
    destinationPortSystemId: systemId + 2000,
    linkType: LINK_TYPE.IntraUsecase,
    sourceSubgraphSystemId: 1,
    destSubgraphSystemId: 2,
    fileSystemId: FILE_ID,
    subsystemDataLinks,
  });
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

  it('rebuilds a module-to-module path when the source module is moved', async () => {
    const targetSubsystem = makeSubsystem({systemId: 200});
    const dataLink = makeDataLink(700, 1, 2);
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue([
        {
          systemId: 200,
          naturalId: 2,
          name: 'Target',
          parentId: undefined,
          subgraphSystemIds: [],
        },
      ]),
      findNodeTopology: jest.fn().mockResolvedValue([
        {systemId: 1, parentId: null, type: 'module'},
        {systemId: 2, parentId: null, type: 'module'},
        {systemId: 200, parentId: null, type: 'subsystem'},
      ]),
      findSubsystemForPatch: jest.fn().mockResolvedValue(targetSubsystem),
    });
    const dataLinks = makeDataLinkRepository({
      findAllWithSegments: jest.fn().mockResolvedValue([dataLink]),
    });
    const modules = {
      findModulesBySubgraphIds: jest.fn().mockResolvedValue([{systemId: 1}]),
      updateParentId: jest.fn(),
    };
    const uow = makeUow({
      subsystemRepository: repository,
      dataLinkRepository: dataLinks,
      moduleRepository: modules,
    });

    const result = await new MoveSubsystemComponentsHandler(
      uow,
      makeIdGeneration(),
    ).handle(new MoveSubsystemComponentsCommand(FILE_ID, [11], [], 200));

    expect(modules.updateParentId).toHaveBeenCalledWith(1, 200);
    expect(dataLinks.replaceSubsystemDataLinkSegments).toHaveBeenCalledWith(
      dataLink.systemId,
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeSystemId: 1,
          destinationNodeSystemId: 200,
        }),
        expect.objectContaining({
          sourceNodeSystemId: 200,
          destinationNodeSystemId: 2,
        }),
      ]),
    );
    expect(result.addedDataLinks).toEqual([dataLink]);
  });

  it('does not rebuild paths when moved modules have no links', async () => {
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue([
        {
          systemId: 200,
          naturalId: 2,
          name: 'Target',
          parentId: undefined,
          subgraphSystemIds: [],
        },
      ]),
      findNodeTopology: jest.fn().mockResolvedValue([
        {systemId: 1, parentId: null, type: 'module'},
        {systemId: 2, parentId: null, type: 'module'},
        {systemId: 200, parentId: null, type: 'subsystem'},
      ]),
      findSubsystemForPatch: jest
        .fn()
        .mockResolvedValue(makeSubsystem({systemId: 200})),
    });
    const dataLinks = makeDataLinkRepository();
    const modules = {
      findModulesBySubgraphIds: jest.fn().mockResolvedValue([{systemId: 1}]),
      updateParentId: jest.fn(),
    };
    const uow = makeUow({
      subsystemRepository: repository,
      dataLinkRepository: dataLinks,
      moduleRepository: modules,
    });

    const result = await new MoveSubsystemComponentsHandler(
      uow,
      makeIdGeneration(),
    ).handle(new MoveSubsystemComponentsCommand(FILE_ID, [11], [], 200));

    expect(modules.updateParentId).toHaveBeenCalledWith(1, 200);
    expect(dataLinks.replaceSubsystemDataLinkSegments).not.toHaveBeenCalled();
    expect(result.addedDataLinks).toEqual([]);
    expect(result.subsystemPortChanges).toEqual([]);
  });

  it('only rebuilds the connection crossing a moved nested subsystem', async () => {
    const subsystems = [
      {
        systemId: 101,
        naturalId: 1,
        name: 'SS1',
        parentId: 102,
        subgraphSystemIds: [],
      },
      {
        systemId: 102,
        naturalId: 2,
        name: 'SS2',
        parentId: undefined,
        subgraphSystemIds: [],
      },
      {
        systemId: 103,
        naturalId: 3,
        name: 'SS3',
        parentId: 104,
        subgraphSystemIds: [],
      },
      {
        systemId: 104,
        naturalId: 4,
        name: 'SS4',
        parentId: undefined,
        subgraphSystemIds: [],
      },
      {
        systemId: 105,
        naturalId: 5,
        name: 'SS5',
        parentId: undefined,
        subgraphSystemIds: [],
      },
    ];
    const movedConnection = makeDataLink(801, 201, 204, [
      new SubsystemDataLink({
        systemId: 901,
        sourceNodeSystemId: 201,
        destinationNodeSystemId: 101,
        sourcePortSystemId: 1801,
        destinationPortSystemId: 1901,
        dataLinkSystemId: 801,
        fileSystemId: FILE_ID,
      }),
      new SubsystemDataLink({
        systemId: 902,
        sourceNodeSystemId: 101,
        destinationNodeSystemId: 102,
        sourcePortSystemId: 1901,
        destinationPortSystemId: 1902,
        dataLinkSystemId: 801,
        fileSystemId: FILE_ID,
      }),
      new SubsystemDataLink({
        systemId: 903,
        sourceNodeSystemId: 102,
        destinationNodeSystemId: 104,
        sourcePortSystemId: 1902,
        destinationPortSystemId: 1904,
        dataLinkSystemId: 801,
        fileSystemId: FILE_ID,
      }),
      new SubsystemDataLink({
        systemId: 904,
        sourceNodeSystemId: 104,
        destinationNodeSystemId: 204,
        sourcePortSystemId: 1904,
        destinationPortSystemId: 2804,
        dataLinkSystemId: 801,
        fileSystemId: FILE_ID,
      }),
    ]);
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue(subsystems),
      findNodeTopology: jest.fn().mockResolvedValue([
        {systemId: 101, parentId: 102, type: 'subsystem'},
        {systemId: 102, parentId: null, type: 'subsystem'},
        {systemId: 103, parentId: 104, type: 'subsystem'},
        {systemId: 104, parentId: null, type: 'subsystem'},
        {systemId: 105, parentId: null, type: 'subsystem'},
        {systemId: 201, parentId: 101, type: 'module'},
        {systemId: 204, parentId: 104, type: 'module'},
      ]),
      findSubsystemForPatch: jest
        .fn()
        .mockImplementation(async (systemId: number) => {
          const subsystem = makeSubsystem({systemId});
          if (systemId === 101) {
            subsystem.dataPorts.push(
              new DataPort({
                systemId: 3,
                naturalId: 1,
                portIoType: PORT_IO_TYPE.OutputInput,
                isStatic: false,
                name: 'SS1 data',
              }),
            );
          }
          if (systemId === 102) {
            subsystem.dataPorts.push(
              new DataPort({
                systemId: 5,
                naturalId: 1,
                portIoType: PORT_IO_TYPE.OutputInput,
                isStatic: false,
                name: 'SS2 data',
              }),
            );
          }
          return subsystem;
        }),
    });
    const dataLinks = makeDataLinkRepository({
      findAllWithSegments: jest.fn().mockResolvedValue([movedConnection]),
    });
    const uow = makeUow({
      subsystemRepository: repository,
      dataLinkRepository: dataLinks,
    });

    const result = await new MoveSubsystemComponentsHandler(
      uow,
      makeIdGeneration(),
    ).handle(new MoveSubsystemComponentsCommand(FILE_ID, [], [101], 105));

    expect(repository.updateParentId).toHaveBeenCalledWith(101, 105);
    expect(dataLinks.replaceSubsystemDataLinkSegments).toHaveBeenCalledTimes(1);
    expect(dataLinks.replaceSubsystemDataLinkSegments).toHaveBeenCalledWith(
      movedConnection.systemId,
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeSystemId: 201,
          destinationNodeSystemId: 101,
        }),
        expect.objectContaining({
          sourceNodeSystemId: 101,
          destinationNodeSystemId: 105,
        }),
        expect.objectContaining({
          sourceNodeSystemId: 105,
          destinationNodeSystemId: 104,
        }),
        expect.objectContaining({
          sourceNodeSystemId: 104,
          destinationNodeSystemId: 204,
        }),
      ]),
    );
    expect(result.addedDataLinks).toEqual([movedConnection]);
  });

  it('moves an unresolved chain ending at a subsystem when its source subsystem moves', async () => {
    const subsystems = [
      {
        systemId: 101,
        naturalId: 1,
        name: 'SS1',
        parentId: 102,
        subgraphSystemIds: [],
      },
      {
        systemId: 102,
        naturalId: 2,
        name: 'SS2',
        parentId: undefined,
        subgraphSystemIds: [],
      },
      {
        systemId: 104,
        naturalId: 4,
        name: 'SS4',
        parentId: undefined,
        subgraphSystemIds: [],
      },
      {
        systemId: 105,
        naturalId: 5,
        name: 'SS5',
        parentId: undefined,
        subgraphSystemIds: [],
      },
    ];
    const unresolvedSegments = [
      new SubsystemDataLink({
        systemId: 901,
        sourceNodeSystemId: 201,
        destinationNodeSystemId: 101,
        sourcePortSystemId: 1,
        destinationPortSystemId: 2,
        dataLinkSystemId: null,
        fileSystemId: FILE_ID,
      }),
      new SubsystemDataLink({
        systemId: 902,
        sourceNodeSystemId: 101,
        destinationNodeSystemId: 102,
        sourcePortSystemId: 3,
        destinationPortSystemId: 4,
        dataLinkSystemId: null,
        fileSystemId: FILE_ID,
      }),
      new SubsystemDataLink({
        systemId: 903,
        sourceNodeSystemId: 102,
        destinationNodeSystemId: 104,
        sourcePortSystemId: 5,
        destinationPortSystemId: 6,
        dataLinkSystemId: null,
        fileSystemId: FILE_ID,
      }),
    ];
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue(subsystems),
      findNodeTopology: jest.fn().mockResolvedValue([
        {systemId: 201, parentId: 101, type: 'module'},
        {systemId: 101, parentId: 102, type: 'subsystem'},
        {systemId: 102, parentId: null, type: 'subsystem'},
        {systemId: 104, parentId: null, type: 'subsystem'},
        {systemId: 105, parentId: null, type: 'subsystem'},
      ]),
      findSubsystemForPatch: jest
        .fn()
        .mockImplementation(async (systemId: number) => {
          const subsystem = makeSubsystem({systemId});
          if (systemId === 101) {
            subsystem.dataPorts.push(
              new DataPort({
                systemId: 3,
                naturalId: 1,
                portIoType: PORT_IO_TYPE.OutputInput,
                isStatic: false,
                name: 'SS1 data',
              }),
            );
          }
          if (systemId === 102) {
            subsystem.dataPorts.push(
              new DataPort({
                systemId: 5,
                naturalId: 1,
                portIoType: PORT_IO_TYPE.OutputInput,
                isStatic: false,
                name: 'SS2 data',
              }),
            );
          }
          return subsystem;
        }),
    });
    const dataLinks = makeDataLinkRepository({
      findSubsystemDataRouteContext: jest.fn().mockResolvedValue({
        subsystemDataLinks: unresolvedSegments,
        nodeTypeBySystemId: new Map([
          [201, 'module'],
          [101, 'subsystem'],
          [102, 'subsystem'],
          [104, 'subsystem'],
          [105, 'subsystem'],
        ]),
      }),
    });
    const uow = makeUow({
      subsystemRepository: repository,
      dataLinkRepository: dataLinks,
    });

    const result = await new MoveSubsystemComponentsHandler(
      uow,
      makeIdGeneration(),
    ).handle(new MoveSubsystemComponentsCommand(FILE_ID, [], [101], 105));

    expect(repository.updateParentId).toHaveBeenCalledWith(101, 105);
    expect(
      dataLinks.replaceUnresolvedSubsystemDataLinkSegments,
    ).toHaveBeenCalledWith(
      [901, 902, 903],
      expect.arrayContaining([
        expect.objectContaining({
          sourceNodeSystemId: 201,
          destinationNodeSystemId: 101,
        }),
        expect.objectContaining({
          sourceNodeSystemId: 101,
          destinationNodeSystemId: 105,
        }),
        expect.objectContaining({
          sourceNodeSystemId: 105,
          destinationNodeSystemId: 104,
        }),
      ]),
      FILE_ID,
    );
    expect(dataLinks.deleteSubsystemDataLinks).not.toHaveBeenCalled();
    expect(dataLinks.replaceSubsystemDataLinkSegments).not.toHaveBeenCalled();
    expect(result.addedDataLinks).toEqual([]);
  });

  it('partially moves valid subsystems and reports root-to-root no-ops', async () => {
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue([
        {
          systemId: 100,
          naturalId: 1,
          name: 'AlreadyRoot',
          parentId: undefined,
          subgraphSystemIds: [],
        },
        {
          systemId: 101,
          naturalId: 2,
          name: 'Nested',
          parentId: 200,
          subgraphSystemIds: [],
        },
        {
          systemId: 200,
          naturalId: 3,
          name: 'Parent',
          parentId: undefined,
          subgraphSystemIds: [],
        },
      ]),
      findNodeTopology: jest.fn().mockResolvedValue([
        {systemId: 100, parentId: null, type: 'subsystem'},
        {systemId: 101, parentId: 200, type: 'subsystem'},
        {systemId: 200, parentId: null, type: 'subsystem'},
      ]),
      findSubsystemForPatch: jest
        .fn()
        .mockImplementation(async (systemId: number) =>
          makeSubsystem({systemId}),
        ),
    });
    const uow = makeUow({subsystemRepository: repository});

    const result = await new MoveSubsystemComponentsHandler(
      uow,
      makeIdGeneration(),
    ).handle(new MoveSubsystemComponentsCommand(FILE_ID, [], [100, 101], null));

    expect(repository.updateParentId).toHaveBeenCalledWith(101, null);
    expect(repository.updateParentId).not.toHaveBeenCalledWith(100, null);
    expect(result.updatedSubsystems).toEqual([
      {systemId: 101, parentSystemId: null},
    ]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues?.[0]?.code).toBe('ARC-SS-DUPLICATE-ROOT-MOVE');
    expect(uow.commit).toHaveBeenCalled();
  });

  it('rejects an all-invalid root-to-root move', async () => {
    const repository = makeSubsystemRepository({
      findSubsystems: jest.fn().mockResolvedValue([
        {
          systemId: 100,
          naturalId: 1,
          name: 'AlreadyRoot',
          parentId: undefined,
          subgraphSystemIds: [],
        },
      ]),
      findNodeTopology: jest
        .fn()
        .mockResolvedValue([
          {systemId: 100, parentId: null, type: 'subsystem'},
        ]),
    });
    const uow = makeUow({subsystemRepository: repository});

    await expect(
      new MoveSubsystemComponentsHandler(uow, makeIdGeneration()).handle(
        new MoveSubsystemComponentsCommand(FILE_ID, [], [100], null),
      ),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({code: 'ARC-SS-DUPLICATE-ROOT-MOVE'}),
      ]),
    });
    expect(uow.rollback).toHaveBeenCalled();
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('reports a component from another file as a domain violation', async () => {
    const repository = makeSubsystemRepository({
      findSubsystemFileSystemId: jest.fn().mockResolvedValue(99),
    });
    const uow = makeUow({subsystemRepository: repository});

    await expect(
      new MoveSubsystemComponentsHandler(uow, makeIdGeneration()).handle(
        new MoveSubsystemComponentsCommand(FILE_ID, [], [777], null),
      ),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({code: 'ENTITY_WRONG_FILE'}),
      ]),
    });
  });
});
