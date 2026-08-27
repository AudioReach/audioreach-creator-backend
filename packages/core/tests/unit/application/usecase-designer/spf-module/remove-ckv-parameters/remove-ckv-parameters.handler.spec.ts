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
import {RemoveCkvParametersHandler} from '../../../../../../src/application/usecase-designer/spf-module/remove-ckv-parameters/remove-ckv-parameters.handler.js';
import {RemoveCkvParametersCommand} from '../../../../../../src/application/usecase-designer/spf-module/remove-ckv-parameters/remove-ckv-parameters.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const DEF_ID = 5;
const PARAM_ID = 200;
const CKV_ID = 100;
const PAYLOAD_ID = 999;

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
      .mockResolvedValue(
        new Map([
          [CKV_ID, [{systemId: PAYLOAD_ID, parameterSystemId: PARAM_ID}]],
        ]),
      ),
    removeParameterFromCkv: jest.fn().mockResolvedValue(undefined),
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

describe('RemoveCkvParametersHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new RemoveCkvParametersHandler(uow, makeIdGen()).handle(
        new RemoveCkvParametersCommand(String(MODULE_ID), [String(PARAM_ID)]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('calls removeParameterFromCkv for matching payload', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new RemoveCkvParametersHandler(uow, makeIdGen()).handle(
      new RemoveCkvParametersCommand(String(MODULE_ID), [String(PARAM_ID)]),
    );
    expect(moduleRepo.removeParameterFromCkv).toHaveBeenCalledWith(
      PAYLOAD_ID,
      CKV_ID,
      MODULE_ID,
    );
  });

  it('removes CKV when last parameter is removed and creates zero CKV', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new RemoveCkvParametersHandler(uow, makeIdGen()).handle(
      new RemoveCkvParametersCommand(String(MODULE_ID), [String(PARAM_ID)]),
    );
    expect(moduleRepo.removeCkv).toHaveBeenCalledWith(CKV_ID, MODULE_ID);
    expect(moduleRepo.createCkv).toHaveBeenCalledTimes(1);
  });
});
