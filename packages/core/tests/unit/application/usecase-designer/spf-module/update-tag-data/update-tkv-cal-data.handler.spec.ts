/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import type {
  UnitOfWork,
  ModuleRepository,
  ModuleDefinitionRepository,
} from '@arc/core';
import {
  ResourceNotFoundException,
  InvalidInputException,
  InvalidOperationException,
} from '../../../../../../src/shared/exceptions/index.js';
import {UpdateTkvCalDataHandler} from '../../../../../../src/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.handler.js';
import {UpdateTkvCalDataCommand} from '../../../../../../src/application/usecase-designer/spf-module/update-tag-data/update-tkv-cal-data.command.js';

const FILE_ID = 10;
const MODULE_ID = 1;
const TAG_MAP_ID = 2;
const TKV_ID = 3;
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
    tagExists: jest.fn().mockResolvedValue(true),
    tkvExists: jest.fn().mockResolvedValue(true),
    getTkvPayloadEntries: jest
      .fn()
      .mockResolvedValue([{systemId: 100, parameterSystemId: 200}]),
    setTkvData: jest.fn().mockResolvedValue(undefined),
    ckvExists: jest.fn(),
    getCkvPayloadEntries: jest.fn(),
    setCkvData: jest.fn(),
    findModuleForPatch: jest.fn(),
    renameModule: jest.fn(),
    changeContainer: jest.fn(),
    addDataPort: jest.fn(),
    removeDataPort: jest.fn(),
    addControlPort: jest.fn(),
    removeControlPort: jest.fn(),
    createModule: jest.fn(),
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
        elementsStructure: JSON.stringify([
          {elementType: 'ConfigElement', dataType: 'Int16'},
        ]),
      },
    ]),
    findBySystemId: jest.fn(),
    findByModuleIdAndProcId: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ModuleDefinitionRepository>;
}

function makeUow(
  moduleRepo: jest.Mocked<ModuleRepository>,
  defRepo: jest.Mocked<ModuleDefinitionRepository>,
): jest.Mocked<UnitOfWork> {
  return {
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 7, fileSystemId: FILE_ID},
      groupId: 'group-abc',
    }),
    getModuleRepository: jest.fn().mockReturnValue(moduleRepo),
    getModuleDefinitionRepository: jest.fn().mockReturnValue(defRepo),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<UnitOfWork>;
}

function makeCommand(
  paramSystemId = '100',
  value = '42',
): UpdateTkvCalDataCommand {
  return new UpdateTkvCalDataCommand(
    String(MODULE_ID),
    String(TAG_MAP_ID),
    String(TKV_ID),
    [
      {
        systemId: paramSystemId,
        elements: [
          {
            type: 'ConfigElement',
            name: 'x',
            isReadOnly: false,
            dataType: 'Int16',
            value,
            min: undefined,
            max: undefined,
          },
        ],
      },
    ],
    undefined,
  );
}

describe('UpdateTkvCalDataHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when tag not found', async () => {
    const moduleRepo = makeModuleRepo({
      tagExists: jest.fn().mockResolvedValue(false),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when TKV not found', async () => {
    const moduleRepo = makeModuleRepo({
      tkvExists: jest.fn().mockResolvedValue(false),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when no existing payload row', async () => {
    const moduleRepo = makeModuleRepo({
      getTkvPayloadEntries: jest.fn().mockResolvedValue([]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws InvalidOperationException when parameter is read-only', async () => {
    const defRepo = makeDefRepo({
      getParameterDefinitions: jest.fn().mockResolvedValue([
        {
          systemId: 200,
          isReadOnly: true,
          elementsStructure: JSON.stringify([
            {elementType: 'ConfigElement', dataType: 'Int16'},
          ]),
        },
      ]),
    });
    const uow = makeUow(makeModuleRepo(), defRepo);
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      InvalidOperationException,
    );
  });

  it('throws InvalidInputException on serialization failure (value out of range)', async () => {
    const uow = makeUow(makeModuleRepo(), makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand('100', '99999'))).rejects.toThrow(
      InvalidInputException,
    );
  });

  it('calls setTkvData and returns groupId on success', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    const result = await handler.handle(makeCommand());
    expect(result.data.succeededParamSystemIds).toEqual([100]);
    expect(result.data.groupId).toBe('group-abc');
    expect(moduleRepo.setTkvData).toHaveBeenCalledWith(
      TAG_MAP_ID,
      TKV_ID,
      expect.arrayContaining([expect.objectContaining({payloadSystemId: 100})]),
      undefined,
    );
  });

  it('calls rollback and re-throws if setTkvData throws', async () => {
    const moduleRepo = makeModuleRepo({
      setTkvData: jest.fn().mockRejectedValue(new Error('write failed')),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    (uow.isInTransaction as jest.Mock).mockReturnValue(true);
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow('write failed');
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('passes uiPersistence to setTkvData when present', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    const cmd = new UpdateTkvCalDataCommand(
      String(MODULE_ID),
      String(TAG_MAP_ID),
      String(TKV_ID),
      [
        {
          systemId: '100',
          elements: [
            {
              type: 'ConfigElement',
              name: 'x',
              isReadOnly: false,
              dataType: 'Int16',
              value: '42',
              min: undefined,
              max: undefined,
            },
          ],
        },
      ],
      'IIR pregain = 5',
    );
    await handler.handle(cmd);
    const call = (moduleRepo.setTkvData as jest.Mock).mock.calls[0];
    expect(call[3]).toBe('IIR pregain = 5');
  });
});
