/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, jest} from '@jest/globals';
import type {
  UnitOfWork,
  ModuleRepository,
  ModuleDefinitionRepository,
  IdGenerationPort,
} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {AddCkvsHandler} from '../../../../../../src/application/usecase-designer/spf-module/add-ckvs/add-ckvs.handler.js';
import {AddCkvsCommand} from '../../../../../../src/application/usecase-designer/spf-module/add-ckvs/add-ckvs.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const DEF_ID = 5;

function makeModuleRepo(
  overrides: Partial<ModuleRepository> = {},
): jest.Mocked<ModuleRepository> {
  return {
    getSpfModuleForValidation: jest.fn().mockResolvedValue({
      systemId: MODULE_ID,
      definitionSystemId: DEF_ID,
      subgraphSystemId: 3,
      containerSystemId: 4,
    }),
    getAllCkvsForModule: jest.fn().mockResolvedValue([]),
    getZeroCkv: jest.fn().mockResolvedValue(null),
    getCkvParameterPayloads: jest.fn().mockResolvedValue([]),
    createCkv: jest.fn().mockResolvedValue(undefined),
    removeCkv: jest.fn().mockResolvedValue(undefined),
    findModuleForPatch: jest.fn(),
    renameModule: jest.fn(),
    changeContainer: jest.fn(),
    addDataPort: jest.fn(),
    removeDataPort: jest.fn(),
    addControlPort: jest.fn(),
    removeControlPort: jest.fn(),
    createModule: jest.fn(),
    ckvExists: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ModuleRepository>;
}

function makeDefRepo(
  overrides: Partial<ModuleDefinitionRepository> = {},
): jest.Mocked<ModuleDefinitionRepository> {
  return {
    getParameterDefinitions: jest.fn().mockResolvedValue([
      {
        systemId: 200,
        isReadOnly: false,
        toolPolicy: 'CALIBRATION',
        elementsStructure: JSON.stringify([
          {elementType: 'ConfigElement', dataType: 'Int16', defaultValue: '0'},
        ]),
      },
    ]),
    findBySystemId: jest.fn(),
    findByModuleIdAndProcId: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ModuleDefinitionRepository>;
}

function makeIdGen(): jest.Mocked<IdGenerationPort> {
  let c = 1000;
  return {
    getNextId: jest.fn().mockImplementation(() => Promise.resolve(c++)),
  } as any;
}

function makeUow(
  moduleRepo: jest.Mocked<ModuleRepository>,
  defRepo: jest.Mocked<ModuleDefinitionRepository>,
): jest.Mocked<UnitOfWork> {
  return {
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 7, fileSystemId: FILE_ID},
      groupId: 'grp',
    }),
    getModuleRepository: jest.fn().mockReturnValue(moduleRepo),
    getModuleDefinitionRepository: jest.fn().mockReturnValue(defRepo),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<UnitOfWork>;
}

describe('AddCkvsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new AddCkvsHandler(uow, makeIdGen()).handle(
        new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['1', '2']}]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('skips duplicate CKV with same valueDefinitionSystemIds', async () => {
    const moduleRepo = makeModuleRepo({
      getAllCkvsForModule: jest.fn().mockResolvedValue([
        {
          systemId: 100,
          spfModuleSystemId: MODULE_ID,
          valueDefinitionSystemIds: [1, 2],
        },
      ]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const result = await new AddCkvsHandler(uow, makeIdGen()).handle(
      new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['1', '2']}]),
    );
    expect(moduleRepo.createCkv).not.toHaveBeenCalled();
    expect(result.data.addedCkvs).toHaveLength(0);
  });

  it('removes zero CKV when first non-zero CKV is added', async () => {
    const zeroCkv = {
      systemId: 99,
      spfModuleSystemId: MODULE_ID,
      valueDefinitionSystemIds: [],
    };
    const moduleRepo = makeModuleRepo({
      getZeroCkv: jest.fn().mockResolvedValue(zeroCkv),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new AddCkvsHandler(uow, makeIdGen()).handle(
      new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['1', '2']}]),
    );
    expect(moduleRepo.removeCkv).toHaveBeenCalledWith(99, MODULE_ID);
  });

  it('calls createCkv and returns groupId on success', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const result = await new AddCkvsHandler(uow, makeIdGen()).handle(
      new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['3', '4']}]),
    );
    expect(moduleRepo.createCkv).toHaveBeenCalledTimes(1);
    expect(result.data.groupId).toBe('grp');
    expect(result.data.addedCkvs).toHaveLength(1);
  });
});
