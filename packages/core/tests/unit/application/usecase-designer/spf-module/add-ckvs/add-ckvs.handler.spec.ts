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

describe('AddCkvsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new AddCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
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
    const result = await new AddCkvsHandler(
      uow,
      makeIdGen(),
      makeQueryServices(),
    ).handle(
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
    await new AddCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
      new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['1', '2']}]),
    );
    expect(moduleRepo.removeCkv).toHaveBeenCalledWith(99, MODULE_ID);
  });

  it('calls createCkv and returns groupId on success', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const result = await new AddCkvsHandler(
      uow,
      makeIdGen(),
      makeQueryServices(),
    ).handle(
      new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['3', '4']}]),
    );
    expect(moduleRepo.createCkv).toHaveBeenCalledTimes(1);
    expect(result.data.groupId).toBe('grp');
    expect(result.data.addedCkvs).toHaveLength(1);
  });

  it('deduplicates repeated value IDs within a CKV', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());

    await new AddCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
      new AddCkvsCommand(String(MODULE_ID), [
        {valueSystemIds: ['3', '3', '4']},
      ]),
    );

    expect(moduleRepo.createCkv).toHaveBeenCalledWith(
      expect.objectContaining({valueDefinitionSystemIds: [3, 4]}),
      MODULE_ID,
    );
  });

  it('returns a partial result without staging an invalid value definition', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const queryServices = {
      keyValueDefQueryService: {
        getKeyValueSummaryForGivenValues: jest.fn().mockResolvedValue({
          kind: 'PARTIAL',
          data: [],
          issues: [
            {
              code: 'ENTITY_NOT_FOUND',
              message: 'ValueDefinition not found for systemId=3',
              severity: 'ERROR',
            },
          ],
        }),
      },
    } as unknown as QueryServices;

    const result = await new AddCkvsHandler(
      uow,
      makeIdGen(),
      queryServices,
    ).handle(new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['3']}]));

    expect(result.kind).toBe('PARTIAL');
    expect(moduleRepo.createCkv).not.toHaveBeenCalled();
  });

  it('rolls back and throws when value resolution fails unexpectedly', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    uow.isInTransaction.mockReturnValue(true);
    const queryServices = {
      keyValueDefQueryService: {
        getKeyValueSummaryForGivenValues: jest.fn().mockResolvedValue({
          kind: 'FAIL',
          issues: [
            {
              code: 'ERR_9001',
              message: 'database unavailable',
              severity: 'ERROR',
            },
          ],
        }),
      },
    } as unknown as QueryServices;

    await expect(
      new AddCkvsHandler(uow, makeIdGen(), queryServices).handle(
        new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['3']}]),
      ),
    ).rejects.toThrow('database unavailable');
    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('rejects an incomplete inherited parameter definition list', async () => {
    const moduleRepo = makeModuleRepo({
      getAllCkvsForModule: jest.fn().mockResolvedValue([
        {
          systemId: 100,
          spfModuleSystemId: MODULE_ID,
          valueDefinitionSystemIds: [1],
        },
      ]),
      getCkvParameterPayloads: jest.fn().mockResolvedValue([
        {systemId: 300, parameterSystemId: 200},
        {systemId: 301, parameterSystemId: 201},
      ]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());

    await expect(
      new AddCkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
        new AddCkvsCommand(String(MODULE_ID), [{valueSystemIds: ['2']}]),
      ),
    ).rejects.toThrow(
      'Parameter definitions missing for inherited CKV payloads: 201',
    );
    expect(moduleRepo.createCkv).not.toHaveBeenCalled();
  });
});
