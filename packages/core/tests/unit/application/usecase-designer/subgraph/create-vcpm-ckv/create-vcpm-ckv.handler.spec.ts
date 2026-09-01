/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import type {
  IdGenerationPort,
  QueryServices,
  SubgraphRepository,
  UnitOfWork,
} from '@arc/core';
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
const PAYLOAD_SYSTEM_ID = 100;
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
    getVcpmWriteAggregate: jest.fn().mockResolvedValue({
      instanceSystemId: INSTANCE_ID,
      ckvs: [],
      payloads: [],
    }),
    createVcpmCkv: jest.fn().mockResolvedValue(undefined),
    deleteVcpmCkv: jest.fn(),
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

function makeIdGeneration(): jest.Mocked<IdGenerationPort> {
  return {
    getNextId: jest
      .fn()
      .mockResolvedValueOnce(CKV_SYSTEM_ID)
      .mockResolvedValueOnce(PAYLOAD_SYSTEM_ID),
    reserveBlock: jest.fn(),
    persistLastUsedId: jest.fn(),
  } as unknown as jest.Mocked<IdGenerationPort>;
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
      new CreateVcpmCkvHandler(
        makeUow(repo),
        makeIdGeneration(),
        makeQueryServices(),
      ).handle(makeCommand()),
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
      new CreateVcpmCkvHandler(
        makeUow(repo),
        makeIdGeneration(),
        queryServices,
      ).handle(makeCommand()),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when the VCPM instance is not found', async () => {
    const repo = makeSubgraphRepo({
      getVcpmWriteAggregate: jest.fn().mockResolvedValue({
        instanceSystemId: null,
        ckvs: [],
        payloads: [],
      }),
    });
    await expect(
      new CreateVcpmCkvHandler(
        makeUow(repo),
        makeIdGeneration(),
        makeQueryServices(),
      ).handle(makeCommand()),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('throws DomainRuleViolationException when a duplicate CKV exists', async () => {
    const repo = makeSubgraphRepo({
      getVcpmWriteAggregate: jest.fn().mockResolvedValue({
        instanceSystemId: INSTANCE_ID,
        ckvs: [
          {
            systemId: CKV_SYSTEM_ID,
            vcpmInstanceSystemId: INSTANCE_ID,
            valueDefSystemIds: VALUE_SYSTEM_IDS,
          },
        ],
        payloads: [],
      }),
    });
    await expect(
      new CreateVcpmCkvHandler(
        makeUow(repo),
        makeIdGeneration(),
        makeQueryServices(),
      ).handle(makeCommand()),
    ).rejects.toThrow(DomainRuleViolationException);
  });

  it('creates the CKV and returns its key/value summary', async () => {
    const repo = makeSubgraphRepo();
    const uow = makeUow(repo);
    const idGeneration = makeIdGeneration();
    const result = await new CreateVcpmCkvHandler(
      uow,
      idGeneration,
      makeQueryServices(),
    ).handle(makeCommand());

    expect(idGeneration.getNextId).toHaveBeenNthCalledWith(1, FILE_ID);
    expect(idGeneration.getNextId).toHaveBeenNthCalledWith(2, FILE_ID);
    expect(repo.createVcpmCkv).toHaveBeenCalledWith(
      SUBGRAPH_ID,
      CKV_SYSTEM_ID,
      INSTANCE_ID,
      VALUE_SYSTEM_IDS,
      [
        {
          systemId: PAYLOAD_SYSTEM_ID,
          vcpmParameterSystemId: VCPM_DEF.parameters[0].systemId,
          payload: new Uint8Array(0),
        },
      ],
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
      new CreateVcpmCkvHandler(
        uow,
        makeIdGeneration(),
        makeQueryServices(),
      ).handle(makeCommand()),
    ).rejects.toThrow('db write failure');
    expect(uow.rollback).toHaveBeenCalled();
  });
});
