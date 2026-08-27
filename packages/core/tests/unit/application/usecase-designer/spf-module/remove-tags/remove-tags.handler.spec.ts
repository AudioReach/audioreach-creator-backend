/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it, expect, jest} from '@jest/globals';
import type {UnitOfWork, ModuleRepository, QueryServices} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {RemoveTagsHandler} from '../../../../../../src/application/usecase-designer/spf-module/remove-tags/remove-tags.handler.js';
import {RemoveTagsCommand} from '../../../../../../src/application/usecase-designer/spf-module/remove-tags/remove-tags.command.js';

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
    getTkvPayloadEntries: jest.fn().mockResolvedValue([]),
    removeTkv: jest.fn().mockResolvedValue(undefined),
    removeTag: jest.fn().mockResolvedValue(undefined),
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
    getModuleDefinitionRepository: jest.fn().mockReturnValue({
      getParameterDefinitions: jest.fn().mockResolvedValue([]),
    }),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<UnitOfWork>;
}

function makeQueryServices(): QueryServices {
  return {
    tagDefinitionQueryService: {
      getTagDefinition: jest.fn().mockResolvedValue({
        systemId: 70,
        naturalId: 7,
        name: 'tag',
        isVoice: false,
        keys: [],
      }),
    },
    keyValueDefQueryService: {
      getKeyValueSummaryForGivenValues: jest.fn().mockResolvedValue({
        kind: 'OK',
        data: [],
      }),
    },
  } as unknown as QueryServices;
}

describe('RemoveTagsHandler', () => {
  it('throws ResourceNotFoundException when SpfModule not found', async () => {
    const moduleRepo = makeModuleRepo({
      getSpfModuleForValidation: jest.fn().mockResolvedValue(null),
    });
    await expect(
      new RemoveTagsHandler(makeUow(moduleRepo), makeQueryServices()).handle(
        new RemoveTagsCommand(String(MODULE_ID), [String(TAG_ID)]),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('cascades removeTkv before removeTag', async () => {
    const moduleRepo = makeModuleRepo();
    const result = await new RemoveTagsHandler(
      makeUow(moduleRepo),
      makeQueryServices(),
    ).handle(new RemoveTagsCommand(String(MODULE_ID), [String(TAG_ID)]));
    expect(moduleRepo.removeTkv).toHaveBeenCalledWith(TKV_ID, TAG_ID);
    expect(moduleRepo.removeTag).toHaveBeenCalledWith(TAG_ID, MODULE_ID);
    expect(result.data.removedTags[0]).toMatchObject({
      systemId: TAG_ID,
      naturalId: 7,
      tagName: 'tag',
      tkvs: [
        {
          systemId: String(TKV_ID),
          keyValuePairs: [],
          supportedParameters: [],
        },
      ],
    });
  });

  it('collects per-item error for tag not found on module', async () => {
    const moduleRepo = makeModuleRepo({
      getTagBySystemId: jest.fn().mockResolvedValue(null),
    });
    const result = await new RemoveTagsHandler(
      makeUow(moduleRepo),
      makeQueryServices(),
    ).handle(new RemoveTagsCommand(String(MODULE_ID), [String(TAG_ID)]));
    expect(moduleRepo.removeTag).not.toHaveBeenCalled();
    expect(result.issues).toHaveLength(1);
  });
});
