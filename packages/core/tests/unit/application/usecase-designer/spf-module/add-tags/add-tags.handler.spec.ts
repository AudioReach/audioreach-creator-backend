/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, jest} from '@jest/globals';
import type {UnitOfWork, ModuleRepository, IdGenerationPort} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {AddTagsHandler} from '../../../../../../src/application/usecase-designer/spf-module/add-tags/add-tags.handler.js';
import {AddTagsCommand} from '../../../../../../src/application/usecase-designer/spf-module/add-tags/add-tags.command.js';

const MODULE_ID = 1;
const FILE_ID = 10;
const DEF_ID = 5;
const TAG_DEF_ID = 70;

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
    getAllTagsForModule: jest.fn().mockResolvedValue([]),
    createTag: jest.fn().mockResolvedValue(undefined),
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

function makeIdGen(): jest.Mocked<IdGenerationPort> {
  let c = 1000;
  return {
    getNextId: jest.fn().mockImplementation(() => Promise.resolve(c++)),
  } as any;
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

describe('AddTagsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    await expect(
      new AddTagsHandler(makeUow(moduleRepo), makeIdGen()).handle(
        new AddTagsCommand(String(MODULE_ID), [String(TAG_DEF_ID)]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('skips duplicate tag (same tagDefinitionSystemId already exists)', async () => {
    const moduleRepo = makeModuleRepo({
      getAllTagsForModule: jest.fn().mockResolvedValue([
        {
          systemId: 50,
          spfModuleSystemId: MODULE_ID,
          tagDefinitionSystemId: TAG_DEF_ID,
        },
      ]),
    });
    const result = await new AddTagsHandler(
      makeUow(moduleRepo),
      makeIdGen(),
    ).handle(new AddTagsCommand(String(MODULE_ID), [String(TAG_DEF_ID)]));
    expect(moduleRepo.createTag).not.toHaveBeenCalled();
    expect(result.data.addedTagSystemIds).toHaveLength(0);
  });

  it('calls createTag with allocated tagSystemId and returns groupId', async () => {
    const moduleRepo = makeModuleRepo();
    const result = await new AddTagsHandler(
      makeUow(moduleRepo),
      makeIdGen(),
    ).handle(new AddTagsCommand(String(MODULE_ID), [String(TAG_DEF_ID)]));
    expect(moduleRepo.createTag).toHaveBeenCalledTimes(1);
    expect(result.data.groupId).toBe('grp');
    expect(result.data.addedTagSystemIds).toHaveLength(1);
  });
});
