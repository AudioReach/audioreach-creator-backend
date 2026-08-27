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
  QueryServices,
} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {RemoveCkvsHandler} from '../../../../../../src/application/usecase-designer/spf-module/remove-ckvs/remove-ckvs.handler.js';
import {RemoveCkvsCommand} from '../../../../../../src/application/usecase-designer/spf-module/remove-ckvs/remove-ckvs.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const DEF_ID = 5;
const CKV_ID = 100;

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
    getAllCkvsForModule: jest.fn().mockResolvedValue([
      {
        systemId: CKV_ID,
        spfModuleSystemId: MODULE_ID,
        valueDefinitionSystemIds: [1, 2],
      },
    ]),
    removeCkv: jest.fn().mockResolvedValue(undefined),
    createCkv: jest.fn().mockResolvedValue(undefined),
    findModuleForPatch: jest.fn(),
    renameModule: jest.fn(),
    changeContainer: jest.fn(),
    addDataPort: jest.fn(),
    removeDataPort: jest.fn(),
    addControlPort: jest.fn(),
    removeControlPort: jest.fn(),
    createModule: jest.fn(),
    ckvExists: jest.fn(),
    getAllTagsForModule: jest.fn(),
    getTagBySystemId: jest.fn(),
    createTag: jest.fn(),
    removeTag: jest.fn(),
    getAllTkvsForTag: jest.fn(),
    getTkvBySystemId: jest.fn(),
    createTkv: jest.fn(),
    removeTkv: jest.fn(),
    getAllCkvParameterPayloads: jest.fn(),
    addParameterToCkv: jest.fn(),
    removeParameterFromCkv: jest.fn(),
    addParameterToTkv: jest.fn(),
    removeParameterFromTkv: jest.fn(),
    getZeroCkv: jest.fn().mockResolvedValue(null),
    getCkvParameterPayloads: jest.fn().mockResolvedValue([]),
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

function makeQueryServices(): QueryServices {
  return {
    keyValueDefQueryService: {
      getKeyValueSummaryForGivenValues: jest.fn().mockImplementation(ids =>
        Promise.resolve({
          kind: 'OK',
          data: (ids as number[]).map(id => ({
            key: {systemId: id + 100, naturalId: id + 100, name: 'key'},
            value: {systemId: id, naturalId: id, name: 'value'},
          })),
        }),
      ),
    },
  } as unknown as QueryServices;
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

describe('RemoveCkvsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new RemoveCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
        new RemoveCkvsCommand(String(MODULE_ID), [String(CKV_ID)]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('calls removeCkv for each valid ckvSystemId', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new RemoveCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
      new RemoveCkvsCommand(String(MODULE_ID), [String(CKV_ID)]),
    );
    expect(moduleRepo.removeCkv).toHaveBeenCalledWith(CKV_ID, MODULE_ID);
  });

  it('creates zero CKV when last non-zero CKV is removed', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new RemoveCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
      new RemoveCkvsCommand(String(MODULE_ID), [String(CKV_ID)]),
    );
    expect(moduleRepo.createCkv).toHaveBeenCalledTimes(1);
    const kvDataArg = (moduleRepo.createCkv as jest.MockedFunction<any>).mock
      .calls[0][0];
    expect(kvDataArg.valueDefinitionSystemIds).toHaveLength(0);
  });

  it('does not create zero CKV when other non-zero CKVs remain', async () => {
    const moduleRepo = makeModuleRepo({
      getAllCkvsForModule: jest.fn().mockResolvedValue([
        {
          systemId: CKV_ID,
          spfModuleSystemId: MODULE_ID,
          valueDefinitionSystemIds: [1],
        },
        {
          systemId: 200,
          spfModuleSystemId: MODULE_ID,
          valueDefinitionSystemIds: [2],
        },
      ]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new RemoveCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
      new RemoveCkvsCommand(String(MODULE_ID), [String(CKV_ID)]),
    );
    expect(moduleRepo.createCkv).not.toHaveBeenCalled();
  });
});
