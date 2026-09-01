/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import type {
  QueryServices,
  SubgraphRepository,
  UnitOfWork,
  VcpmPayloadRow,
} from '@arc/core';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/index.js';
import {UpdateVcpmCalDataHandler} from '../../../../../../src/application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.handler.js';
import {UpdateVcpmCalDataCommand} from '../../../../../../src/application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.command.js';
import {ISSUE_CODE} from '../../../../../../src/shared/issues/operational-codes.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';

const FILE_ID = 10;
const SUBGRAPH_ID = 20;
const CKV_ID = 30;
const PAYLOAD_SYSTEM_ID = 100;
const PARAM_DEF_SYSTEM_ID = 200;

const VALID_ELEMENTS_STRUCTURE = JSON.stringify([
  {elementType: 'ConfigElement', dataType: 'Int16'},
]);

const BASE_PAYLOAD_ROW: VcpmPayloadRow = {
  systemId: PAYLOAD_SYSTEM_ID,
  vcpmParameterSystemId: PARAM_DEF_SYSTEM_ID,
};

const WRITABLE_PARAM_DEF = {
  systemId: PARAM_DEF_SYSTEM_ID,
  isReadOnly: false,
  elementsStructure: VALID_ELEMENTS_STRUCTURE,
};

function makeParam(systemId = PAYLOAD_SYSTEM_ID, value = '42') {
  return {
    systemId,
    elements: [
      {
        type: 'ConfigElement' as const,
        name: 'x',
        value,
      },
    ],
  };
}

function makeRepo(
  overrides: Partial<SubgraphRepository> = {},
): jest.Mocked<SubgraphRepository> {
  return {
    subgraphExists: jest.fn().mockResolvedValue(true),
    vcpmCkvExistsBySystemId: jest.fn().mockResolvedValue(true),
    getVcpmCkvPayloads: jest.fn().mockResolvedValue([BASE_PAYLOAD_ROW]),
    updateVcpmCalData: jest.fn().mockResolvedValue(undefined),
    createSubgraph: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<SubgraphRepository>;
}

function makeQueryServices(
  paramDefs: unknown[] = [WRITABLE_PARAM_DEF],
): jest.Mocked<QueryServices> {
  return {
    vcpmDefinitionQueryService: {
      getVcpmModuleDefinitionsWithParams: jest
        .fn()
        .mockResolvedValue([{systemId: 999, parameters: paramDefs}]),
    },
  } as unknown as jest.Mocked<QueryServices>;
}

function makeUow(
  repo: jest.Mocked<SubgraphRepository>,
): jest.Mocked<UnitOfWork> {
  return {
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 7, fileSystemId: FILE_ID},
      groupId: 'group-abc',
    }),
    getSubgraphRepository: jest.fn().mockReturnValue(repo),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<UnitOfWork>;
}

function makeCommand(parameters = [makeParam()]): UpdateVcpmCalDataCommand {
  return new UpdateVcpmCalDataCommand(SUBGRAPH_ID, CKV_ID, parameters);
}

describe('UpdateVcpmCalDataHandler', () => {
  it('throws when the subgraph is not found', async () => {
    const repo = makeRepo({subgraphExists: jest.fn().mockResolvedValue(false)});
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo), makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo), makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(String(SUBGRAPH_ID));
  });

  it('throws when the CKV is not found', async () => {
    const repo = makeRepo({
      vcpmCkvExistsBySystemId: jest.fn().mockResolvedValue(false),
    });
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo), makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(ResourceNotFoundException);
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo), makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(String(CKV_ID));
  });

  it('reports a missing payload row', async () => {
    const repo = makeRepo({
      getVcpmCkvPayloads: jest.fn().mockResolvedValue([]),
    });
    const result = await new UpdateVcpmCalDataHandler(
      makeUow(repo),
      makeQueryServices(),
    ).handle(makeCommand());
    expect(result.issues?.[0].code).toBe(ISSUE_CODE.PARAM_PAYLOAD_NOT_FOUND);
    expect(result.data!.succeededParamSystemIds).toEqual([]);
  });

  it('reports a read-only parameter', async () => {
    const definition = {...WRITABLE_PARAM_DEF, isReadOnly: true};
    const result = await new UpdateVcpmCalDataHandler(
      makeUow(makeRepo()),
      makeQueryServices([definition]),
    ).handle(makeCommand());
    expect(result.issues?.[0].code).toBe(ISSUE_CODE.PARAM_READ_ONLY);
  });

  it('reports serialization failures', async () => {
    const result = await new UpdateVcpmCalDataHandler(
      makeUow(makeRepo()),
      makeQueryServices(),
    ).handle(makeCommand([makeParam(PAYLOAD_SYSTEM_ID, '99999')]));
    expect(result.issues?.[0].code).toBe(ISSUE_CODE.PARAM_SERIALIZATION_FAILED);
  });

  it('returns OK with the successful payload system IDs', async () => {
    const repo = makeRepo();
    const uow = makeUow(repo);
    const result = await new UpdateVcpmCalDataHandler(
      uow,
      makeQueryServices(),
    ).handle(makeCommand());
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data!.succeededParamSystemIds).toEqual([PAYLOAD_SYSTEM_ID]);
    expect(result.data!.groupId).toBe('group-abc');
    expect(repo.updateVcpmCalData).toHaveBeenCalled();
  });

  it('returns PARTIAL when some parameters fail', async () => {
    const secondPayloadId = 101;
    const secondDefinitionId = 201;
    const repo = makeRepo({
      getVcpmCkvPayloads: jest.fn().mockResolvedValue([
        BASE_PAYLOAD_ROW,
        {
          systemId: secondPayloadId,
          vcpmParameterSystemId: secondDefinitionId,
        },
      ]),
    });
    const result = await new UpdateVcpmCalDataHandler(
      makeUow(repo),
      makeQueryServices([
        WRITABLE_PARAM_DEF,
        {
          systemId: secondDefinitionId,
          isReadOnly: true,
          elementsStructure: VALID_ELEMENTS_STRUCTURE,
        },
      ]),
    ).handle(makeCommand([makeParam(), makeParam(secondPayloadId, '10')]));
    expect(result.kind).toBe(RESULT_KIND.Partial);
    expect(result.data!.succeededParamSystemIds).toEqual([PAYLOAD_SYSTEM_ID]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues![0].code).toBe(ISSUE_CODE.PARAM_READ_ONLY);
  });

  it('rolls back and rethrows a write failure', async () => {
    const repo = makeRepo({
      updateVcpmCalData: jest
        .fn()
        .mockRejectedValue(new Error('db write error')),
    });
    const uow = makeUow(repo);
    (uow.isInTransaction as jest.Mock).mockReturnValue(true);
    await expect(
      new UpdateVcpmCalDataHandler(uow, makeQueryServices()).handle(
        makeCommand(),
      ),
    ).rejects.toThrow('db write error');
    expect(uow.rollback).toHaveBeenCalled();
  });
});
