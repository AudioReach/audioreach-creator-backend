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
    getTkvPayloadEntries: jest.fn().mockResolvedValue([]),
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

describe('AddTkvsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    await expect(
      new AddTkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
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
      new AddTkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
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
    const result = await new AddTkvsHandler(
      uow,
      makeIdGen(),
      makeQueryServices(),
    ).handle(
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
    const result = await new AddTkvsHandler(
      uow,
      makeIdGen(),
      makeQueryServices(),
    ).handle(
      new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
        {valueSystemIds: ['1']},
      ]),
    );
    expect(moduleRepo.createTkv).toHaveBeenCalledTimes(1);
    expect(result.data.groupId).toBe('grp');
    expect(result.data.addedTkvs).toHaveLength(1);
  });

  it('deduplicates repeated value IDs within a TKV', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());

    await new AddTkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
      new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
        {valueSystemIds: ['1', '1', '2']},
      ]),
    );

    expect(moduleRepo.createTkv).toHaveBeenCalledWith(
      expect.objectContaining({valueDefinitionSystemIds: [1, 2]}),
      TAG_ID,
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
              message: 'ValueDefinition not found for systemId=1',
              severity: 'ERROR',
            },
          ],
        }),
      },
    } as unknown as QueryServices;

    const result = await new AddTkvsHandler(
      uow,
      makeIdGen(),
      queryServices,
    ).handle(
      new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
        {valueSystemIds: ['1']},
      ]),
    );

    expect(result.kind).toBe('PARTIAL');
    expect(moduleRepo.createTkv).not.toHaveBeenCalled();
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
      new AddTkvsHandler(uow, makeIdGen(), queryServices).handle(
        new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
          {valueSystemIds: ['1']},
        ]),
      ),
    ).rejects.toThrow('database unavailable');
    expect(uow.rollback).toHaveBeenCalledTimes(1);
    expect(uow.commit).not.toHaveBeenCalled();
  });

  it('rejects an incomplete inherited parameter definition list', async () => {
    const moduleRepo = makeModuleRepo({
      getAllTkvsForTag: jest.fn().mockResolvedValue([
        {
          systemId: 80,
          moduleTagIdMapSystemId: TAG_ID,
          valueDefinitionSystemIds: [1],
        },
      ]),
      getTkvPayloadEntries: jest.fn().mockResolvedValue([
        {systemId: 300, parameterSystemId: 200},
        {systemId: 301, parameterSystemId: 201},
      ]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());

    await expect(
      new AddTkvsHandler(uow, makeIdGen(), makeQueryServices()).handle(
        new AddTkvsCommand(String(MODULE_ID), String(TAG_ID), [
          {valueSystemIds: ['2']},
        ]),
      ),
    ).rejects.toThrow(
      'Parameter definitions missing for inherited TKV payloads: 201',
    );
    expect(moduleRepo.createTkv).not.toHaveBeenCalled();
  });
});
