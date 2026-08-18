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
import {PutCkvCalDataHandler} from '../../../../../../src/application/usecase-designer/spf-module/put-cal-data/put-ckv-cal-data.handler.js';
import {PutCkvCalDataCommand} from '../../../../../../src/application/usecase-designer/spf-module/put-cal-data/put-ckv-cal-data.command.js';

const FILE_ID = 10;
const MODULE_ID = 1;
const CKV_ID = 2;
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
    ckvExists: jest.fn().mockResolvedValue(true),
    getExistingCkvPayloads: jest
      .fn()
      .mockResolvedValue([{systemId: 100, parameterSystemId: 200}]),
    setCkvCalData: jest.fn().mockResolvedValue(undefined),
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
    findCalibrationParametersByDefinitionId: jest.fn(),
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
): PutCkvCalDataCommand {
  return new PutCkvCalDataCommand(
    String(MODULE_ID),
    String(CKV_ID),
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

describe('PutCkvCalDataHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new PutCkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('throws ResourceNotFoundException when CKV not found', async () => {
    const moduleRepo = makeModuleRepo({
      ckvExists: jest.fn().mockResolvedValue(false),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new PutCkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('adds to failures when no existing payload row (FR15)', async () => {
    const moduleRepo = makeModuleRepo({
      getExistingCkvPayloads: jest.fn().mockResolvedValue([]),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new PutCkvCalDataHandler(uow);
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
    const handler = new PutCkvCalDataHandler(uow);
    const result = await handler.handle(makeCommand());
    expect(result.issues[0].message).toMatch(/read-only/i);
  });

  it('adds to failures on serialization failure (value out of range)', async () => {
    const uow = makeUow(makeModuleRepo(), makeDefRepo());
    const handler = new PutCkvCalDataHandler(uow);
    // Int16 max is 32767 — 99999 should fail
    const result = await handler.handle(makeCommand('100', '99999'));
    expect(result.issues[0].message).toMatch(/range|Int16/i);
  });

  it('calls setCkvCalData and returns groupId on success', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new PutCkvCalDataHandler(uow);
    const result = await handler.handle(makeCommand());
    expect(result.data.succeededParamSystemIds).toEqual([100]);
    expect(result.issues ?? []).toHaveLength(0);
    expect(result.data.groupId).toBe('group-abc');
    expect(moduleRepo.setCkvCalData).toHaveBeenCalledWith(
      MODULE_ID,
      CKV_ID,
      expect.arrayContaining([expect.objectContaining({payloadSystemId: 100})]),
      undefined,
    );
  });

  it('calls rollback and re-throws if setCkvCalData throws', async () => {
    const moduleRepo = makeModuleRepo({
      setCkvCalData: jest.fn().mockRejectedValue(new Error('db error')),
    });
    const uow = makeUow(moduleRepo, makeDefRepo());
    (uow.isInTransaction as jest.Mock).mockReturnValue(true);
    const handler = new PutCkvCalDataHandler(uow);
    await expect(handler.handle(makeCommand())).rejects.toThrow('db error');
    expect(uow.rollback).toHaveBeenCalled();
  });

  it('passes uiPersistence to setCkvCalData when present', async () => {
    const moduleRepo = makeModuleRepo();
    const uow = makeUow(moduleRepo, makeDefRepo());
    const handler = new PutCkvCalDataHandler(uow);
    const cmd = new PutCkvCalDataCommand(
      String(MODULE_ID),
      String(CKV_ID),
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
    const call = (moduleRepo.setCkvCalData as jest.Mock).mock.calls[0];
    expect(call[3]).toBeInstanceOf(Uint8Array);
    const decoded = new TextDecoder().decode(call[3] as Uint8Array);
    expect(decoded).toBe('IIR pregain = 5');
  });
});
