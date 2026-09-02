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
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
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
    moduleTagIdMapExists: jest.fn().mockResolvedValue(true),
    tkvExists: jest.fn().mockResolvedValue(true),
    getExistingTkvPayloads: jest
      .fn()
      .mockResolvedValue([{systemId: 100, parameterSystemId: 200}]),
    setTkvCalData: jest.fn().mockResolvedValue(undefined),
    ckvExists: jest.fn(),
    getExistingCkvPayloads: jest.fn(),
    setCkvCalData: jest.fn(),
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

  it('throws ResourceNotFoundException when moduleTagIdMap not found', async () => {
    const moduleRepo = makeModuleRepo({
      moduleTagIdMapExists: jest.fn().mockResolvedValue(false),
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

  it('adds to failures when no existing payload row', async () => {
    const moduleRepo = makeModuleRepo({
      getExistingTkvPayloads: jest.fn().mockResolvedValue([]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    const result = await handler.handle(makeCommand());
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('PARAM_PAYLOAD_NOT_FOUND');
    expect(result.data.succeededParamSystemIds).toHaveLength(0);
  });

  it('adds to failures when parameter is read-only', async () => {
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
    const result = await handler.handle(makeCommand());
    expect(result.issues[0].message).toMatch(/read-only/i);
  });

  it('adds to failures on serialization failure (value out of range)', async () => {
    const uow = makeUow(makeModuleRepo(), makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    const result = await handler.handle(makeCommand('100', '99999'));
    expect(result.issues[0].message).toMatch(/range|Int16/i);
  });

  it('calls setTkvCalData and returns groupId on success', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new UpdateTkvCalDataHandler(uow);
    const result = await handler.handle(makeCommand());
    expect(result.data.succeededParamSystemIds).toEqual([100]);
    expect(result.issues ?? []).toHaveLength(0);
    expect(result.data.groupId).toBe('group-abc');
    expect(moduleRepo.setTkvCalData).toHaveBeenCalledWith(
      TAG_MAP_ID,
      TKV_ID,
      expect.arrayContaining([expect.objectContaining({payloadSystemId: 100})]),
      undefined,
    );
  });

  it('calls rollback and re-throws if setTkvCalData throws', async () => {
    const moduleRepo = makeModuleRepo({
      setTkvCalData: jest.fn().mockRejectedValue(new Error('write failed')),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    (uow.isInTransaction as jest.Mock).mockReturnValue(true);
    const handler = new UpdateTkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow('write failed');
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('passes uiPersistence to setTkvCalData when present', async () => {
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
    const call = (moduleRepo.setTkvCalData as jest.Mock).mock.calls[0];
    expect(call[3]).toBe('IIR pregain = 5');
  });
});
