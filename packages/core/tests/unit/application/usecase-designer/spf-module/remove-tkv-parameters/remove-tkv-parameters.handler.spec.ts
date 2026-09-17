/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, jest} from '@jest/globals';
import type {UnitOfWork, ModuleRepository} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {RemoveTkvParametersHandler} from '../../../../../../src/application/usecase-designer/spf-module/remove-tkv-parameters/remove-tkv-parameters.handler.js';
import {RemoveTkvParametersCommand} from '../../../../../../src/application/usecase-designer/spf-module/remove-tkv-parameters/remove-tkv-parameters.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const TKV_ID = 80;
const PARAM_ID = 200;
const PAYLOAD_ID = 999;

function makeModuleRepo(
  overrides: Partial<ModuleRepository> = {},
): jest.Mocked<ModuleRepository> {
  return {
    getSpfModuleForValidation: jest.fn().mockResolvedValue({
      systemId: MODULE_ID,
      definitionSystemId: 5,
      subgraphSystemId: 3,
      containerSystemId: 4,
    }),
    getTkvBySystemId: jest.fn().mockResolvedValue({
      systemId: TKV_ID,
      moduleTagIdMapSystemId: 50,
      valueDefinitionSystemIds: [],
    }),
    getCkvPayloadEntries: jest
      .fn()
      .mockResolvedValue([{systemId: PAYLOAD_ID, parameterSystemId: PARAM_ID}]),
    removeParameterFromTkv: jest.fn().mockResolvedValue(undefined),
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

function makeUow(
  moduleRepo: jest.Mocked<ModuleRepository>,
): jest.Mocked<UnitOfWork> {
  return {
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 7, fileSystemId: FILE_ID},
      groupId: 'grp',
    }),
    getModuleRepository: jest.fn().mockReturnValue(moduleRepo),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<UnitOfWork>;
}

describe('RemoveTkvParametersHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    await expect(
      new RemoveTkvParametersHandler(makeUow(moduleRepo)).handle(
        new RemoveTkvParametersCommand(String(MODULE_ID), [
          {tkvSystemId: String(TKV_ID), parameterSystemIds: [String(PARAM_ID)]},
        ]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('calls removeParameterFromTkv for matching payload', async () => {
    const moduleRepo = makeModuleRepo();
    await new RemoveTkvParametersHandler(makeUow(moduleRepo)).handle(
      new RemoveTkvParametersCommand(String(MODULE_ID), [
        {tkvSystemId: String(TKV_ID), parameterSystemIds: [String(PARAM_ID)]},
      ]),
    );
    expect(moduleRepo.removeParameterFromTkv).toHaveBeenCalledWith(
      PAYLOAD_ID,
      TKV_ID,
      MODULE_ID,
    );
  });

  it('collects per-item error for TKV not found', async () => {
    const moduleRepo = makeModuleRepo({
      getTkvBySystemId: jest.fn().mockResolvedValue(null),
    });
    const result = await new RemoveTkvParametersHandler(
      makeUow(moduleRepo),
    ).handle(
      new RemoveTkvParametersCommand(String(MODULE_ID), [
        {tkvSystemId: String(TKV_ID), parameterSystemIds: [String(PARAM_ID)]},
      ]),
    );
    expect(moduleRepo.removeParameterFromTkv).not.toHaveBeenCalled();
    expect(result.issues).toHaveLength(1);
  });
});
