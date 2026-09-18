/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import {SetContainerHeapIdCommand} from '../../../../../../src/application/usecase-designer/container/set-heap-id/set-container-heap-id.command.js';
import {SetContainerHeapIdHandler} from '../../../../../../src/application/usecase-designer/container/set-heap-id/set-container-heap-id.handler.js';
import {
  ResourceNotFoundException,
  InvalidInputException,
} from '../../../../../../src/shared/exceptions/index.js';
import type {
  ContainerRepository,
  ModuleRepository,
  UnitOfWork,
} from '@arc/core';

const FILE_SYSTEM_ID = 10;
const CONTAINER_SYSTEM_ID = 42;
const HEAP_PROPERTY_SYSTEM_ID = 0x2002;
const CONTAINER_HEAP_PROPERTY_ID = 0x08001174;
const UINT32_ELEMENTS_STRUCTURE = JSON.stringify([
  {elementType: 'ConfigElement', dataType: 'UInt32'},
]);

const HEAP_PROPERTY_DEFINITION = {
  systemId: HEAP_PROPERTY_SYSTEM_ID,
  naturalId: CONTAINER_HEAP_PROPERTY_ID,
  name: 'Heap',
  elementsStructure: UINT32_ELEMENTS_STRUCTURE,
};

function createContainerRepository(
  overrides: Partial<ContainerRepository> = {},
): ContainerRepository {
  return {
    containerExists: jest.fn().mockResolvedValue(true),
    getPropertyDefinitionByPropertyId: jest
      .fn()
      .mockResolvedValue(HEAP_PROPERTY_DEFINITION),
    getPropertyData: jest.fn().mockResolvedValue(null),
    setPropertyData: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ContainerRepository;
}

function createModuleRepository(
  overrides: Partial<ModuleRepository> = {},
): ModuleRepository {
  return {
    findModulesByContainerId: jest.fn().mockResolvedValue([
      {
        systemId: 10,
        definitionSystemId: 100,
        containerSystemId: CONTAINER_SYSTEM_ID,
        subgraphSystemId: 1,
      },
      {
        systemId: 20,
        definitionSystemId: 200,
        containerSystemId: CONTAINER_SYSTEM_ID,
        subgraphSystemId: 1,
      },
    ]),
    updateHeapId: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ModuleRepository;
}

function createUnitOfWork(
  containerRepository = createContainerRepository(),
  moduleRepository = createModuleRepository(),
): UnitOfWork {
  return {
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(true),
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 1, fileSystemId: FILE_SYSTEM_ID, mode: 'DESIGNER'},
      groupId: 'test-group-id',
    }),
    getContainerRepository: jest.fn().mockReturnValue(containerRepository),
    getModuleRepository: jest.fn().mockReturnValue(moduleRepository),
  } as unknown as UnitOfWork;
}

describe('SetContainerHeapIdHandler', () => {
  it('returns the container and all cascaded module heap IDs', async () => {
    const containerRepository = createContainerRepository();
    const moduleRepository = createModuleRepository();
    const uow = createUnitOfWork(containerRepository, moduleRepository);
    const handler = new SetContainerHeapIdHandler(uow);

    await expect(
      handler.handle(new SetContainerHeapIdCommand(CONTAINER_SYSTEM_ID, 1)),
    ).resolves.toEqual({
      containerSystemId: CONTAINER_SYSTEM_ID,
      heapId: 1,
      updatedModuleHeapIds: [
        {moduleSystemId: 10, heapId: 1},
        {moduleSystemId: 20, heapId: 1},
      ],
    });

    expect(containerRepository.setPropertyData).toHaveBeenCalledWith(
      CONTAINER_SYSTEM_ID,
      HEAP_PROPERTY_SYSTEM_ID,
      expect.any(Uint8Array),
    );
    expect(moduleRepository.updateHeapId).toHaveBeenNthCalledWith(1, 10, 1);
    expect(moduleRepository.updateHeapId).toHaveBeenNthCalledWith(2, 20, 1);
    expect(uow.commit).toHaveBeenCalled();
  });

  it('supports Low Power heap ID 2', async () => {
    const moduleRepository = createModuleRepository();
    const uow = createUnitOfWork(createContainerRepository(), moduleRepository);
    const handler = new SetContainerHeapIdHandler(uow);

    const result = await handler.handle(
      new SetContainerHeapIdCommand(CONTAINER_SYSTEM_ID, 2),
    );

    expect(result.heapId).toBe(2);
    expect(result.updatedModuleHeapIds).toEqual([
      {moduleSystemId: 10, heapId: 2},
      {moduleSystemId: 20, heapId: 2},
    ]);
    expect(moduleRepository.updateHeapId).toHaveBeenNthCalledWith(1, 10, 2);
    expect(moduleRepository.updateHeapId).toHaveBeenNthCalledWith(2, 20, 2);
  });

  it('does not write when the container already has the requested heap ID', async () => {
    const containerRepository = createContainerRepository({
      getPropertyData: jest
        .fn()
        .mockResolvedValue(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])),
    });
    const moduleRepository = createModuleRepository();
    const uow = createUnitOfWork(containerRepository, moduleRepository);
    const handler = new SetContainerHeapIdHandler(uow);

    await expect(
      handler.handle(new SetContainerHeapIdCommand(CONTAINER_SYSTEM_ID, 1)),
    ).resolves.toEqual({
      containerSystemId: CONTAINER_SYSTEM_ID,
      heapId: 1,
      updatedModuleHeapIds: [],
    });

    expect(uow.startTransaction).not.toHaveBeenCalled();
    expect(containerRepository.setPropertyData).not.toHaveBeenCalled();
    expect(moduleRepository.updateHeapId).not.toHaveBeenCalled();
  });

  it('throws InvalidInputException for an unsupported heap ID', async () => {
    const uow = createUnitOfWork();
    const handler = new SetContainerHeapIdHandler(uow);

    await expect(
      handler.handle(new SetContainerHeapIdCommand(CONTAINER_SYSTEM_ID, 3)),
    ).rejects.toBeInstanceOf(InvalidInputException);

    expect(uow.startTransaction).not.toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException when the container does not exist', async () => {
    const containerRepository = createContainerRepository({
      containerExists: jest.fn().mockResolvedValue(false),
    });
    const uow = createUnitOfWork(containerRepository);
    const handler = new SetContainerHeapIdHandler(uow);

    await expect(
      handler.handle(new SetContainerHeapIdCommand(CONTAINER_SYSTEM_ID, 1)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);

    expect(uow.startTransaction).not.toHaveBeenCalled();
  });

  it('throws ResourceNotFoundException when the heap property definition is missing', async () => {
    const containerRepository = createContainerRepository({
      getPropertyDefinitionByPropertyId: jest.fn().mockResolvedValue(null),
    });
    const uow = createUnitOfWork(containerRepository);
    const handler = new SetContainerHeapIdHandler(uow);

    await expect(
      handler.handle(new SetContainerHeapIdCommand(CONTAINER_SYSTEM_ID, 1)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);

    expect(uow.startTransaction).not.toHaveBeenCalled();
  });

  it('rolls back when a module heap update fails', async () => {
    const moduleRepository = createModuleRepository({
      updateHeapId: jest.fn().mockRejectedValue(new Error('write failed')),
    });
    const uow = createUnitOfWork(createContainerRepository(), moduleRepository);
    const handler = new SetContainerHeapIdHandler(uow);

    await expect(
      handler.handle(new SetContainerHeapIdCommand(CONTAINER_SYSTEM_ID, 1)),
    ).rejects.toThrow('write failed');

    expect(uow.rollback).toHaveBeenCalled();
    expect(uow.commit).not.toHaveBeenCalled();
  });
});
