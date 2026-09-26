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
import {AddTkvParametersHandler} from '../../../../../../src/application/usecase-designer/spf-module/add-tkv-parameters/add-tkv-parameters.handler.js';
import {AddTkvParametersCommand} from '../../../../../../src/application/usecase-designer/spf-module/add-tkv-parameters/add-tkv-parameters.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const DEF_ID = 5;
const TKV_ID = 80;
const PARAM_ID = 200;

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
    getTkvBySystemId: jest.fn().mockResolvedValue({
      systemId: TKV_ID,
      moduleTagIdMapSystemId: 50,
      valueDefinitionSystemIds: [],
    }),
    getTkvPayloadEntries: jest.fn().mockResolvedValue([]),
    addParameterToTkv: jest.fn().mockResolvedValue(undefined),
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

describe('AddTkvParametersHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new AddTkvParametersHandler(uow, makeIdGen()).handle(
        new AddTkvParametersCommand(String(MODULE_ID), [
          {tkvSystemId: String(TKV_ID), parameterSystemIds: [String(PARAM_ID)]},
        ]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('calls addParameterToTkv for valid TKV and param', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new AddTkvParametersHandler(uow, makeIdGen()).handle(
      new AddTkvParametersCommand(String(MODULE_ID), [
        {tkvSystemId: String(TKV_ID), parameterSystemIds: [String(PARAM_ID)]},
      ]),
    );
    expect(moduleRepo.addParameterToTkv).toHaveBeenCalledTimes(1);
  });

  it('does not add a parameter already present on the TKV', async () => {
    const moduleRepo = makeModuleRepo({
      getTkvPayloadEntries: jest
        .fn()
        .mockResolvedValue([{systemId: 300, parameterSystemId: PARAM_ID}]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await new AddTkvParametersHandler(uow, makeIdGen()).handle(
      new AddTkvParametersCommand(String(MODULE_ID), [
        {tkvSystemId: String(TKV_ID), parameterSystemIds: [String(PARAM_ID)]},
      ]),
    );
    expect(moduleRepo.addParameterToTkv).not.toHaveBeenCalled();
  });

  it('collects per-item error for TKV not found', async () => {
    const moduleRepo = makeModuleRepo({
      getTkvBySystemId: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const result = await new AddTkvParametersHandler(uow, makeIdGen()).handle(
      new AddTkvParametersCommand(String(MODULE_ID), [
        {tkvSystemId: String(TKV_ID), parameterSystemIds: [String(PARAM_ID)]},
      ]),
    );
    expect(moduleRepo.addParameterToTkv).not.toHaveBeenCalled();
    expect(result.issues).toHaveLength(1);
  });
});
