/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, jest} from '@jest/globals';
import type {UnitOfWork, ModuleRepository} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {RemoveTkvsHandler} from '../../../../../../src/application/usecase-designer/spf-module/remove-tkvs/remove-tkvs.handler.js';
import {RemoveTkvsCommand} from '../../../../../../src/application/usecase-designer/spf-module/remove-tkvs/remove-tkvs.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const TAG_ID = 50;
const TKV_ID = 80;

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
    getTagBySystemId: jest.fn().mockResolvedValue({
      systemId: TAG_ID,
      spfModuleSystemId: MODULE_ID,
      tagDefinitionSystemId: 70,
    }),
    getAllTkvsForTag: jest.fn().mockResolvedValue([
      {
        systemId: TKV_ID,
        moduleTagIdMapSystemId: TAG_ID,
        valueDefinitionSystemIds: [],
      },
    ]),
    removeTkv: jest.fn().mockResolvedValue(undefined),
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

describe('RemoveTkvsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    await expect(
      new RemoveTkvsHandler(makeUow(moduleRepo)).handle(
        new RemoveTkvsCommand(String(MODULE_ID), String(TAG_ID), [
          String(TKV_ID),
        ]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when tag not found on module', async () => {
    const moduleRepo = makeModuleRepo({
      getTagBySystemId: jest.fn().mockResolvedValue(null),
    });
    await expect(
      new RemoveTkvsHandler(makeUow(moduleRepo)).handle(
        new RemoveTkvsCommand(String(MODULE_ID), String(TAG_ID), [
          String(TKV_ID),
        ]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('calls removeTkv for each valid tkvSystemId', async () => {
    const moduleRepo = makeModuleRepo();
    await new RemoveTkvsHandler(makeUow(moduleRepo)).handle(
      new RemoveTkvsCommand(String(MODULE_ID), String(TAG_ID), [
        String(TKV_ID),
      ]),
    );
    expect(moduleRepo.removeTkv).toHaveBeenCalledWith(TKV_ID, MODULE_ID);
  });

  it('collects per-item error for TKV not found in tag', async () => {
    const moduleRepo = makeModuleRepo({
      getAllTkvsForTag: jest.fn().mockResolvedValue([]),
    });
    const result = await new RemoveTkvsHandler(makeUow(moduleRepo)).handle(
      new RemoveTkvsCommand(String(MODULE_ID), String(TAG_ID), [
        String(TKV_ID),
      ]),
    );
    expect(moduleRepo.removeTkv).not.toHaveBeenCalled();
    expect(result.issues).toHaveLength(1);
  });
});
