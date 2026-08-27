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
import {AddCkvParametersHandler} from '../../../../../../src/application/usecase-designer/spf-module/add-ckv-parameters/add-ckv-parameters.handler.js';
import {AddCkvParametersCommand} from '../../../../../../src/application/usecase-designer/spf-module/add-ckv-parameters/add-ckv-parameters.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const DEF_ID = 5;
const PARAM_ID = 200;
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
        valueDefinitionSystemIds: [1],
      },
    ]),
    getAllCkvParameterPayloads: jest
      .fn()
      .mockResolvedValue(new Map([[CKV_ID, []]])),
    addParameterToCkv: jest.fn().mockResolvedValue(undefined),
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
        systemId: PARAM_ID,
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

describe('AddCkvParametersHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new AddCkvParametersHandler(uow, makeIdGen()).handle(
        new AddCkvParametersCommand(String(MODULE_ID), [String(PARAM_ID)]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('calls addParameterToCkv for non-zero CKV that does not have the param', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new AddCkvParametersHandler(uow, makeIdGen()).handle(
      new AddCkvParametersCommand(String(MODULE_ID), [String(PARAM_ID)]),
    );
    expect(moduleRepo.addParameterToCkv).toHaveBeenCalledTimes(1);
  });

  it('skips parameter already present on CKV', async () => {
    const moduleRepo = makeModuleRepo({
      getAllCkvParameterPayloads: jest
        .fn()
        .mockResolvedValue(
          new Map([[CKV_ID, [{systemId: 999, parameterSystemId: PARAM_ID}]]]),
        ),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new AddCkvParametersHandler(uow, makeIdGen()).handle(
      new AddCkvParametersCommand(String(MODULE_ID), [String(PARAM_ID)]),
    );
    expect(moduleRepo.addParameterToCkv).not.toHaveBeenCalled();
  });
});
