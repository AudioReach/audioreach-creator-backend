/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import type {SubgraphRepository, UnitOfWork} from '@arc/core';
import {
  ResourceNotFoundException,
  InvalidOperationException,
} from '../../../../../../src/shared/exceptions/index.js';
import {UpdateVcpmCalDataHandler} from '../../../../../../src/application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.handler.js';
import {UpdateVcpmCalDataCommand} from '../../../../../../src/application/usecase-designer/subgraph/update-vcpm-cal-data/update-vcpm-cal-data.command.js';

const FILE_ID = 10;
const SUBGRAPH_ID = 20;
const CKV_ID = 30;
const PAYLOAD_SYSTEM_ID = 100;
const PARAM_DEF_SYSTEM_ID = 200;

const VALID_ELEMENTS_STRUCTURE = JSON.stringify([
  {elementType: 'ConfigElement', dataType: 'Int16'},
]);

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
    getAllVcpmData: jest.fn().mockResolvedValue({
      instance: {
        systemId: 21,
        subgraphSystemId: SUBGRAPH_ID,
        vcpmModuleDefinitionSystemId: 999,
        ckvs: [{systemId: CKV_ID, valueDefinitionSystemIds: []}],
      },
      payloads: new Map([[PAYLOAD_SYSTEM_ID, PARAM_DEF_SYSTEM_ID]]),
    }),
    updateVcpmCalData: jest.fn().mockResolvedValue(undefined),
    createSubgraph: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<SubgraphRepository>;
}

function makeUow(
  repo: jest.Mocked<SubgraphRepository>,
  paramDefs: unknown[] = [WRITABLE_PARAM_DEF],
): jest.Mocked<UnitOfWork> {
  return {
    getWriteContext: jest.fn().mockReturnValue({
      session: {sessionId: 7, fileSystemId: FILE_ID},
      groupId: 'group-abc',
    }),
    getSubgraphRepository: jest.fn().mockReturnValue(repo),
    getVcpmDefinitionRepository: jest.fn().mockReturnValue({
      getAllVcpmModuleDefinitions: jest.fn().mockResolvedValue([
        {
          systemId: 999,
          parameters: paramDefs,
        },
      ]),
    }),
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
      new UpdateVcpmCalDataHandler(makeUow(repo)).handle(makeCommand()),
    ).rejects.toThrow(ResourceNotFoundException);
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo)).handle(makeCommand()),
    ).rejects.toThrow(String(SUBGRAPH_ID));
  });

  it('throws when the CKV is not found', async () => {
    const repo = makeRepo({
      getAllVcpmData: jest.fn().mockResolvedValue({
        instance: {
          systemId: 21,
          subgraphSystemId: SUBGRAPH_ID,
          vcpmModuleDefinitionSystemId: 999,
          ckvs: [],
        },
        payloads: new Map(),
      }),
    });
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo)).handle(makeCommand()),
    ).rejects.toThrow(ResourceNotFoundException);
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo)).handle(makeCommand()),
    ).rejects.toThrow(String(CKV_ID));
  });

  it('rejects a missing payload row without staging updates', async () => {
    const repo = makeRepo({
      getAllVcpmData: jest.fn().mockResolvedValue({
        instance: {
          systemId: 21,
          subgraphSystemId: SUBGRAPH_ID,
          vcpmModuleDefinitionSystemId: 999,
          ckvs: [{systemId: CKV_ID, valueDefinitionSystemIds: []}],
        },
        payloads: new Map(),
      }),
    });
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo)).handle(makeCommand()),
    ).rejects.toThrow(ResourceNotFoundException);
    expect(repo.updateVcpmCalData).not.toHaveBeenCalled();
  });

  it('rejects a read-only parameter without staging updates', async () => {
    const definition = {...WRITABLE_PARAM_DEF, isReadOnly: true};
    const repo = makeRepo();
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo, [definition])).handle(
        makeCommand(),
      ),
    ).rejects.toThrow(InvalidOperationException);
    expect(repo.updateVcpmCalData).not.toHaveBeenCalled();
  });

  it('rejects serialization failures without staging updates', async () => {
    const repo = makeRepo();
    await expect(
      new UpdateVcpmCalDataHandler(makeUow(repo)).handle(
        makeCommand([makeParam(PAYLOAD_SYSTEM_ID, '99999')]),
      ),
    ).rejects.toThrow(InvalidOperationException);
    expect(repo.updateVcpmCalData).not.toHaveBeenCalled();
  });

  it('updates all requested payloads atomically', async () => {
    const repo = makeRepo();
    const uow = makeUow(repo);
    const result = await new UpdateVcpmCalDataHandler(uow).handle(
      makeCommand(),
    );
    expect(result).toBeUndefined();
    expect(repo.updateVcpmCalData).toHaveBeenCalled();
  });

  it('rejects the whole request when any parameter fails', async () => {
    const secondPayloadId = 101;
    const secondDefinitionId = 201;
    const repo = makeRepo({
      getAllVcpmData: jest.fn().mockResolvedValue({
        instance: {
          systemId: 21,
          subgraphSystemId: SUBGRAPH_ID,
          vcpmModuleDefinitionSystemId: 999,
          ckvs: [{systemId: CKV_ID, valueDefinitionSystemIds: []}],
        },
        payloads: new Map([
          [PAYLOAD_SYSTEM_ID, PARAM_DEF_SYSTEM_ID],
          [secondPayloadId, secondDefinitionId],
        ]),
      }),
    });
    await expect(
      new UpdateVcpmCalDataHandler(
        makeUow(repo, [
          WRITABLE_PARAM_DEF,
          {
            systemId: secondDefinitionId,
            isReadOnly: true,
            elementsStructure: VALID_ELEMENTS_STRUCTURE,
          },
        ]),
      ).handle(makeCommand([makeParam(), makeParam(secondPayloadId, '10')])),
    ).rejects.toThrow(InvalidOperationException);
    expect(repo.updateVcpmCalData).not.toHaveBeenCalled();
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
      new UpdateVcpmCalDataHandler(uow).handle(makeCommand()),
    ).rejects.toThrow('db write error');
    expect(uow.rollback).toHaveBeenCalled();
  });
});
