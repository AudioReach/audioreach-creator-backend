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
import {AddTkvsHandler} from '../../../../../../src/application/usecase-designer/spf-module/add-tkvs/add-tkvs.handler.js';
import {AddTkvsCommand} from '../../../../../../src/application/usecase-designer/spf-module/add-tkvs/add-tkvs.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const DEF_ID = 5;
const TAG_ID = 50;

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
    getTagBySystemId: jest.fn().mockResolvedValue({
      systemId: TAG_ID,
      spfModuleSystemId: MODULE_ID,
      tagDefinitionSystemId: 70,
    }),
    getAllTkvsForTag: jest.fn().mockResolvedValue([]),
    createTkv: jest.fn().mockResolvedValue(undefined),
    findModuleForPatch: jest.fn(),
    renameModule: jest.fn(),
    changeContainer: jest.fn(),
    addDataPort: jest.fn(),
    removeDataPort: jest.fn(),
    addControlPort: jest.fn(),
    removeControlPort: jest.fn(),
    createModule: jest.fn(),
    ckvExists: jest.fn(),
    createCkv: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ModuleRepository>;
}

function makeDefRepo(): jest.Mocked<ModuleDefinitionRepository> {
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

describe('AddTkvsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new AddTkvsHandler(uow, makeIdGen()).handle(
        new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
          {valueSystemIds: ['1']},
        ]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when tag not found on module', async () => {
    const moduleRepo = makeModuleRepo({
      getTagBySystemId: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new AddTkvsHandler(uow, makeIdGen()).handle(
        new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
          {valueSystemIds: ['1']},
        ]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('skips duplicate TKV with same valueDefinitionSystemIds', async () => {
    const moduleRepo = makeModuleRepo({
      getAllTkvsForTag: jest.fn().mockResolvedValue([
        {
          systemId: 80,
          moduleTagIdMapSystemId: TAG_ID,
          valueDefinitionSystemIds: [1],
        },
      ]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const result = await new AddTkvsHandler(uow, makeIdGen()).handle(
      new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
        {valueSystemIds: ['1']},
      ]),
    );
    expect(moduleRepo.createTkv).not.toHaveBeenCalled();
    expect(result.data.addedTkvs).toHaveLength(0);
  });

  it('calls createTkv and returns groupId on success', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const result = await new AddTkvsHandler(uow, makeIdGen()).handle(
      new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
        {valueSystemIds: ['1']},
      ]),
    );
    expect(moduleRepo.createTkv).toHaveBeenCalledTimes(1);
    expect(result.data.groupId).toBe('grp');
    expect(result.data.addedTkvs).toHaveLength(1);
  });
});
