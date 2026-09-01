/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import type {QueryServices, SubgraphRepository, UnitOfWork} from '@arc/core';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
} from '../../../../../../src/shared/exceptions/index.js';
import {CreateVcpmCkvHandler} from '../../../../../../src/application/usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.handler.js';
import {CreateVcpmCkvCommand} from '../../../../../../src/application/usecase-designer/subgraph/create-vcpm-ckv/create-vcpm-ckv.command.js';

const FILE_ID = 10;
const SUBGRAPH_ID = 1;
const INSTANCE_ID = 20;
const CKV_SYSTEM_ID = 99;
const VALUE_SYSTEM_IDS = [101, 102];
const GROUP_ID = 'group-abc';

const VCPM_DEF = {
  systemId: 5,
  parameters: [{systemId: 300, isReadOnly: false, elementsStructure: '[]'}],
};

function makeSubgraphRepo(
  overrides: Partial<SubgraphRepository> = {},
): jest.Mocked<SubgraphRepository> {
  return {
    subgraphExists: jest.fn().mockResolvedValue(true),
    getVcpmInstanceSystemId: jest.fn().mockResolvedValue(INSTANCE_ID),
    vcpmCkvExists: jest.fn().mockResolvedValue(false),
    createVcpmCkv: jest.fn().mockResolvedValue(CKV_SYSTEM_ID),
    vcpmCkvExistsBySystemId: jest.fn(),
    deleteVcpmCkv: jest.fn(),
    getVcpmCkvPayloads: jest.fn(),
    updateVcpmCalData: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<SubgraphRepository>;
}

function makeQueryServices(
  overrides: Partial<QueryServices> = {},
): jest.Mocked<QueryServices> {
  return {
    vcpmDefinitionQueryService: {
      getVcpmModuleDefinitionsWithParams: jest
        .fn()
        .mockResolvedValue([VCPM_DEF]),
    },
    keyValueDefQueryService: {
      getKeyValueSummaryForGivenValues: jest.fn().mockResolvedValue({
        kind: 'OK',
        data: [
          {
            key: {keyId: 1, systemId: 50, name: 'k'},
            value: {valueId: 2, systemId: VALUE_SYSTEM_IDS[0], name: 'v0'},
          },
          {
            key: {keyId: 1, systemId: 50, name: 'k'},
            value: {valueId: 3, systemId: VALUE_SYSTEM_IDS[1], name: 'v1'},
          },
        ],
      }),
    },
    ...overrides,
  } as unknown as jest.Mocked<QueryServices>;
}

function makeUow(
  repo: jest.Mocked<SubgraphRepository>,
): jest.Mocked<UnitOfWork> {
  return {
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 7, fileSystemId: FILE_ID},
      groupId: GROUP_ID,
    }),
    getSubgraphRepository: jest.fn().mockReturnValue(repo),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<UnitOfWork>;
}

function makeCommand(): CreateVcpmCkvCommand {
  return new CreateVcpmCkvCommand(SUBGRAPH_ID, [
    {valueSystemIds: VALUE_SYSTEM_IDS.map(String)},
  ]);
}

describe('CreateVcpmCkvHandler', () => {
  it('throws ResourceNotFoundException when subgraph is not found', async () => {
    const repo = makeSubgraphRepo({
      subgraphExists: jest.fn().mockResolvedValue(false),
    });
    await expect(
      new CreateVcpmCkvHandler(makeUow(repo), makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when no VCPM definitions are found', async () => {
    const repo = makeSubgraphRepo();
    const queryServices = makeQueryServices({
      vcpmDefinitionQueryService: {
        getVcpmModuleDefinitionsWithParams: jest.fn().mockResolvedValue([]),
      } as never,
    });
    await expect(
      new CreateVcpmCkvHandler(makeUow(repo), queryServices).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when the VCPM instance is not found', async () => {
    const repo = makeSubgraphRepo({
      getVcpmInstanceSystemId: jest.fn().mockResolvedValue(null),
    });
    await expect(
      new CreateVcpmCkvHandler(makeUow(repo), makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws DomainRuleViolationException when a duplicate CKV exists', async () => {
    const repo = makeSubgraphRepo({
      vcpmCkvExists: jest.fn().mockResolvedValue(true),
    });
    await expect(
      new CreateVcpmCkvHandler(makeUow(repo), makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(DomainRuleViolationException);
  });

  it('creates the CKV and returns its key/value summary', async () => {
    const repo = makeSubgraphRepo();
    const uow = makeUow(repo);
    const result = await new CreateVcpmCkvHandler(
      uow,
      makeQueryServices(),
    ).handle(makeCommand());

    expect(repo.createVcpmCkv).toHaveBeenCalledWith(
      SUBGRAPH_ID,
      INSTANCE_ID,
      VALUE_SYSTEM_IDS,
      VCPM_DEF.parameters,
    );
    expect(uow.startTransaction).toHaveBeenCalled();
    expect(uow.commit).toHaveBeenCalled();
    expect(result).toEqual({
      ckvSystemId: String(CKV_SYSTEM_ID),
      groupId: GROUP_ID,
      ckv: [
        {keyId: 1, valueId: 2},
        {keyId: 1, valueId: 3},
      ],
    });
  });

  it('rolls back and rethrows a create failure', async () => {
    const repo = makeSubgraphRepo({
      createVcpmCkv: jest.fn().mockRejectedValue(new Error('db write failure')),
    });
    const uow = makeUow(repo);
    (uow.isInTransaction as jest.Mock).mockReturnValue(true);
    await expect(
      new CreateVcpmCkvHandler(uow, makeQueryServices()).handle(makeCommand()),
    ).rejects.toThrow('db write failure');
    expect(uow.rollback).toHaveBeenCalled();
  });
});
