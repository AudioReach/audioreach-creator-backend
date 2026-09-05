/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {UpdateContainerPropertyHandler} from '../../../../../../src/application/usecase-designer/container/update-property/update-container-property.handler.js';
import {UpdateContainerPropertyCommand} from '../../../../../../src/application/usecase-designer/container/update-property/update-container-property.command.js';
import {
  ResourceNotFoundException,
  InvalidOperationException,
  DomainRuleViolationException,
} from '../../../../../../src/shared/exceptions/index.js';
import {
  Result,
  RESULT_KIND,
} from '../../../../../../src/application/shared/result/result.js';
import type {
  UnitOfWork,
  ContainerRepository,
  ModuleRepository,
  ModuleForContainer,
  PropertyDefinitionsRepository,
  ContainerPropertyDefinitionRecord,
} from '@arc/core';

const FILE_ID = 10;
const PROP_SYS_ID = 0x08001000;
const CAPABILITY_PROP_SYS_ID = 0x2001;
const HEAP_PROP_SYS_ID = 0x2002;
const CONTAINER_SYS_ID = 42;

// elementsStructure encoding a single uint32 — correct format from serialize-elements.spec.ts
const UINT32_ELEMENTS_STRUCTURE = JSON.stringify([
  {elementType: 'ConfigElement', dataType: 'UInt32'},
]);

// Input element shape: type (not elementType), value as string, isReadOnly required
function uint32Element(value: number) {
  return {
    type: 'ConfigElement',
    name: 'value',
    isReadOnly: false,
    dataType: 'UInt32',
    value: String(value),
    min: undefined,
    max: undefined,
  };
}

const UINT32_ELEMENT_VALUE_1 = [uint32Element(1)]; // heapId = Default
const UINT32_ELEMENT_VALUE_2 = [uint32Element(2)]; // heapId = Low Power

// capability list: count=1 + capabilityId — two uint32 fields → 8 bytes
const CAP_LIST_ELEMENTS_STRUCTURE = JSON.stringify([
  {elementType: 'ConfigElement', name: 'count', dataType: 'UInt32'},
  {elementType: 'ConfigElement', name: 'capabilityId_0', dataType: 'UInt32'},
]);

function capListElements(count: number, capabilityId: number) {
  return [
    {
      type: 'ConfigElement',
      name: 'count',
      isReadOnly: false,
      dataType: 'UInt32',
      value: String(count),
      min: undefined,
      max: undefined,
    },
    {
      type: 'ConfigElement',
      name: 'capabilityId_0',
      isReadOnly: false,
      dataType: 'UInt32',
      value: String(capabilityId),
      min: undefined,
      max: undefined,
    },
  ];
}

const CAP_LIST_ELEMENTS_VALID = capListElements(1, 0x100); // matches containerTypeIds [0x100]
const CAP_LIST_ELEMENTS_NO_MATCH = capListElements(1, 0x999); // no match

const PROP_DEF_UINT32 = {
  systemId: PROP_SYS_ID,
  propertyId: 0x1000,
  name: 'TestProp',
  elementsStructure: UINT32_ELEMENTS_STRUCTURE,
};

const PROP_DEF_CAP_LIST = {
  systemId: CAPABILITY_PROP_SYS_ID,
  propertyId: 0x08001011,
  name: 'CapabilityList',
  elementsStructure: CAP_LIST_ELEMENTS_STRUCTURE,
};

function makeContainerRepo(
  overrides: Partial<ContainerRepository> = {},
): ContainerRepository {
  return {
    containerExists: jest.fn().mockResolvedValue(true),
    getContainerById: jest.fn(),
    createContainer: jest.fn(),
    getPropertyData: jest.fn(),
    setPropertyData: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ContainerRepository;
}

function makeModuleRepo(modules: ModuleForContainer[] = []): ModuleRepository {
  return {
    findModuleForPatch: jest.fn(),
    renameModule: jest.fn(),
    changeContainer: jest.fn(),
    addDataPort: jest.fn(),
    removeDataPort: jest.fn(),
    addControlPort: jest.fn(),
    removeControlPort: jest.fn(),
    createModule: jest.fn(),
    createCkv: jest.fn(),
    getSpfModuleForValidation: jest.fn(),
    ckvExists: jest.fn(),
    getExistingCkvPayloads: jest.fn(),
    setCkvCalData: jest.fn(),
    getModulesByContainerId: jest.fn().mockResolvedValue(modules),
    updateHeapId: jest.fn().mockResolvedValue(undefined),
  } as unknown as ModuleRepository;
}

function makePropertyDefinitionsRepository(
  propDef: object = PROP_DEF_UINT32,
  fail = false,
): PropertyDefinitionsRepository {
  return {
    findSubgraphPropertyDefinitions: jest.fn(),
    findContainerPropertyDefinitions: jest.fn(),
    findContainerPropertyDefinition: jest
      .fn()
      .mockResolvedValue(
        fail ? null : (propDef as ContainerPropertyDefinitionRecord),
      ),
  };
}

function makeUow(
  overrides: {
    containerRepo?: ContainerRepository;
    moduleRepo?: ModuleRepository;
    propertyDefinitionsRepo?: PropertyDefinitionsRepository;
  } = {},
): UnitOfWork {
  const containerRepo = overrides.containerRepo ?? makeContainerRepo();
  const moduleRepo = overrides.moduleRepo ?? makeModuleRepo();
  const propertyDefinitionsRepo =
    overrides.propertyDefinitionsRepo ?? makePropertyDefinitionsRepository();
  return {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 1, fileSystemId: FILE_ID, mode: 'DESIGNER'},
      groupId: 'test-group-uuid',
    }),
    getModuleRepository: jest.fn().mockReturnValue(moduleRepo),
    getContainerRepository: jest.fn().mockReturnValue(containerRepo),
    getPropertyDefinitionsRepository: jest
      .fn()
      .mockReturnValue(propertyDefinitionsRepo),
  } as unknown as UnitOfWork;
}

function makeCommand(
  overrides: {
    propertySystemId?: number;
    elements?: any[];
  } = {},
): UpdateContainerPropertyCommand {
  return new UpdateContainerPropertyCommand(
    CONTAINER_SYS_ID,
    overrides.propertySystemId ?? PROP_SYS_ID,
    overrides.elements ?? UINT32_ELEMENT_VALUE_1,
  );
}

describe('UpdateContainerPropertyHandler', () => {
  it('throws ResourceNotFoundException when container does not exist', async () => {
    const containerRepo = makeContainerRepo({
      containerExists: jest.fn().mockResolvedValue(false),
    });
    const uow = makeUow({containerRepo});
    const handler = new UpdateContainerPropertyHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when property definition is not found', async () => {
    const uow = makeUow({
      propertyDefinitionsRepo: makePropertyDefinitionsRepository(
        PROP_DEF_UINT32,
        true,
      ),
    });
    const handler = new UpdateContainerPropertyHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws InvalidOperationException when serialization fails (value out of range)', async () => {
    // Use Int8 with explicit range [-128, 127]; passing 200 forces {ok: false}
    const rangedPropDef = {
      systemId: PROP_SYS_ID,
      propertyId: 0x1000,
      name: 'TestProp',
      elementsStructure: JSON.stringify([
        {
          elementType: 'ConfigElement',
          dataType: 'Int8',
          min: '-128',
          max: '127',
        },
      ]),
    };
    const uow = makeUow({
      propertyDefinitionsRepo: makePropertyDefinitionsRepository(rangedPropDef),
    });
    const handler = new UpdateContainerPropertyHandler(uow);
    const cmd = makeCommand({
      elements: [
        {
          type: 'ConfigElement',
          name: 'value',
          isReadOnly: false,
          dataType: 'Int8',
          value: '200',
          min: -128,
          max: 127,
        },
      ],
    });
    await expect(handler.handle(cmd)).rejects.toThrow(
      InvalidOperationException,
    );
  });

  it('throws DomainRuleViolationException with failing displayNames for 0x08001011', async () => {
    const modules: ModuleForContainer[] = [
      {moduleSystemId: 10, containerTypeIds: [0x100], displayName: 'ModuleX'},
    ];
    const moduleRepo = makeModuleRepo(modules);
    const uow = makeUow({
      moduleRepo,
      propertyDefinitionsRepo:
        makePropertyDefinitionsRepository(PROP_DEF_CAP_LIST),
    });
    const handler = new UpdateContainerPropertyHandler(uow);

    // capabilityId 0x999 has no intersection with module's containerTypeIds [0x100]
    let caught: unknown;
    try {
      await handler.handle(
        makeCommand({
          propertySystemId: CAPABILITY_PROP_SYS_ID,
          elements: CAP_LIST_ELEMENTS_NO_MATCH,
        }),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DomainRuleViolationException);
    const ex = caught as DomainRuleViolationException;
    expect(ex.message).toBe(
      'Module capability and container capability do not match for one or more modules; see issues for details.',
    );
    expect(ex.issues[0]?.message).toContain('ModuleX');
    const containerRepo = (
      uow.getContainerRepository as ReturnType<typeof jest.fn>
    )();
    expect(containerRepo.setPropertyData).not.toHaveBeenCalled();
  });

  it('calls setPropertyData and does not call updateHeapId for 0x08001011 when all modules pass', async () => {
    const modules: ModuleForContainer[] = [
      {moduleSystemId: 10, containerTypeIds: [0x100], displayName: 'ModuleX'},
    ];
    const moduleRepo = makeModuleRepo(modules);
    const uow = makeUow({
      moduleRepo,
      propertyDefinitionsRepo:
        makePropertyDefinitionsRepository(PROP_DEF_CAP_LIST),
    });
    const handler = new UpdateContainerPropertyHandler(uow);

    // capabilityId 0x100 matches module's containerTypeIds [0x100]
    await handler.handle(
      makeCommand({
        propertySystemId: CAPABILITY_PROP_SYS_ID,
        elements: CAP_LIST_ELEMENTS_VALID,
      }),
    );

    const containerRepo = (
      uow.getContainerRepository as ReturnType<typeof jest.fn>
    )();
    expect(containerRepo.setPropertyData).toHaveBeenCalledWith(
      CONTAINER_SYS_ID,
      CAPABILITY_PROP_SYS_ID,
      expect.any(Uint8Array),
    );
    expect(moduleRepo.updateHeapId).not.toHaveBeenCalled();
    expect(uow.commit).toHaveBeenCalled();
  });

  it('calls setPropertyData but not updateHeapId when heap is Default (0x1)', async () => {
    const heapPropDef = {
      systemId: HEAP_PROP_SYS_ID,
      propertyId: 0x08001174,
      name: 'Heap',
      elementsStructure: UINT32_ELEMENTS_STRUCTURE,
    };
    const moduleRepo = makeModuleRepo([]);
    const uow = makeUow({
      moduleRepo,
      propertyDefinitionsRepo: makePropertyDefinitionsRepository(heapPropDef),
    });
    const handler = new UpdateContainerPropertyHandler(uow);

    // value 1 = Default heap ID → no cascade
    await handler.handle(
      makeCommand({
        propertySystemId: HEAP_PROP_SYS_ID,
        elements: UINT32_ELEMENT_VALUE_1,
      }),
    );

    const containerRepo = (
      uow.getContainerRepository as ReturnType<typeof jest.fn>
    )();
    expect(containerRepo.setPropertyData).toHaveBeenCalledWith(
      CONTAINER_SYS_ID,
      HEAP_PROP_SYS_ID,
      expect.any(Uint8Array),
    );
    expect(moduleRepo.updateHeapId).not.toHaveBeenCalled();
    expect(uow.commit).toHaveBeenCalled();
  });

  it('calls setPropertyData and updateHeapId for each module when heap is Low Power (0x2)', async () => {
    const heapPropDef = {
      systemId: HEAP_PROP_SYS_ID,
      propertyId: 0x08001174,
      name: 'Heap',
      elementsStructure: UINT32_ELEMENTS_STRUCTURE,
    };
    const modules: ModuleForContainer[] = [
      {moduleSystemId: 10, containerTypeIds: [0x100], displayName: 'Mod1'},
      {moduleSystemId: 20, containerTypeIds: [0x100], displayName: 'Mod2'},
    ];
    const moduleRepo = makeModuleRepo(modules);
    const uow = makeUow({
      moduleRepo,
      propertyDefinitionsRepo: makePropertyDefinitionsRepository(heapPropDef),
    });
    const handler = new UpdateContainerPropertyHandler(uow);

    // value 2 = Low Power → cascade to all modules
    await handler.handle(
      makeCommand({
        propertySystemId: HEAP_PROP_SYS_ID,
        elements: UINT32_ELEMENT_VALUE_2,
      }),
    );

    const containerRepo = (
      uow.getContainerRepository as ReturnType<typeof jest.fn>
    )();
    expect(containerRepo.setPropertyData).toHaveBeenCalledWith(
      CONTAINER_SYS_ID,
      HEAP_PROP_SYS_ID,
      expect.any(Uint8Array),
    );
    expect(moduleRepo.updateHeapId).toHaveBeenCalledTimes(2);
    expect(moduleRepo.updateHeapId).toHaveBeenCalledWith(10, 0x2);
    expect(moduleRepo.updateHeapId).toHaveBeenCalledWith(20, 0x2);
    expect(uow.commit).toHaveBeenCalled();
  });

  it('calls setPropertyData and does not call updateHeapId for any other property', async () => {
    const moduleRepo = makeModuleRepo([]);
    const uow = makeUow({moduleRepo});
    const handler = new UpdateContainerPropertyHandler(uow);

    await handler.handle(makeCommand({propertySystemId: 0x08001234}));

    const containerRepo = (
      uow.getContainerRepository as ReturnType<typeof jest.fn>
    )();
    expect(containerRepo.setPropertyData).toHaveBeenCalledWith(
      CONTAINER_SYS_ID,
      0x08001234,
      expect.any(Uint8Array),
    );
    expect(moduleRepo.updateHeapId).not.toHaveBeenCalled();
    expect(uow.commit).toHaveBeenCalled();
  });
});
