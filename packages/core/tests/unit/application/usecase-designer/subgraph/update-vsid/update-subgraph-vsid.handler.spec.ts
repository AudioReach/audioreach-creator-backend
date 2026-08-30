/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {UpdateSubgraphVsidHandler} from '../../../../../../src/application/usecase-designer/subgraph/update-vsid/update-subgraph-vsid.handler.js';
import {UpdateSubgraphVsidCommand} from '../../../../../../src/application/usecase-designer/subgraph/update-vsid/update-subgraph-vsid.command.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../../../../src/shared/exceptions/invalid-operation.exception.js';
import {Result} from '../../../../../../src/application/shared/result/result.js';

const SESSION = {sessionId: 1, fileSystemId: 7};
const GROUP_ID = 'g1';
const VSID_DEF_SYS_ID = 55;
const VSID_NATURAL_ID = 0x080010cc;
const VSID_ELEMENTS = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'vsid',
    dataType: 'UInt32',
    defaultValue: '0',
  },
]);

function uint32Payload(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}

function makeVsidDef(systemId = VSID_DEF_SYS_ID) {
  return {
    systemId,
    propertyId: VSID_NATURAL_ID,
    name: 'vsid',
    description: '',
    propertyType: 'SPF',
    maxSize: 4,
    isVoice: false,
    elementsStructure: VSID_ELEMENTS,
  };
}

function makeSubgraph(systemId: number, vsidValue?: number) {
  return {
    systemId,
    properties:
      vsidValue !== undefined
        ? [
            {
              systemId: 200 + systemId,
              propertySystemId: VSID_DEF_SYS_ID,
              payload: uint32Payload(vsidValue),
            },
          ]
        : [],
  };
}

function makeUow(opts: {subgraph?: any; linkedIds?: number[]} = {}) {
  const setPropertyData = jest.fn().mockResolvedValue(undefined);
  const startTransaction = jest.fn().mockResolvedValue(undefined);
  const commit = jest.fn().mockResolvedValue(undefined);
  const rollback = jest.fn().mockResolvedValue(undefined);
  const isInTransaction = jest.fn().mockReturnValue(false);
  const {subgraph = makeSubgraph(10, 100), linkedIds = []} = opts;

  return {
    getWriteContext: jest
      .fn()
      .mockReturnValue({session: SESSION, groupId: GROUP_ID}),
    getSubgraphRepository: jest.fn().mockReturnValue({
      getSubgraphWithProperties: jest
        .fn()
        .mockImplementation((id: number) =>
          Promise.resolve(id === 10 ? subgraph : null),
        ),
      getSubgraphsWithProperties: jest
        .fn()
        .mockImplementation((ids: number[]) => {
          const map = new Map<number, any>();
          for (const id of ids) {
            if (id === 10 && subgraph) map.set(id, subgraph);
          }
          return Promise.resolve(map);
        }),
      getSubgraphIdsInSameUsecases: jest.fn().mockResolvedValue(linkedIds),
      getSubgraphIdsInSameUsecasesForMany: jest
        .fn()
        .mockResolvedValue(linkedIds),
      setPropertyData,
    }),
    startTransaction,
    commit,
    rollback,
    isInTransaction,
    _setPropertyData: setPropertyData,
    _commit: commit,
    _rollback: rollback,
  };
}

function makeQueryServices(
  vsidDef: any = Result.ok([makeVsidDef()]),
  withElements: any = Result.ok(makeVsidDef()),
) {
  return {
    subgraphPropertyDefQueryService: {
      getAllSubgraphPropertyDefinitionsSummary: jest
        .fn()
        .mockResolvedValue(vsidDef),
      getSubgraphPropertyDefinitionWithElements: jest
        .fn()
        .mockResolvedValue(withElements),
    },
  };
}

const ELEMENTS = [
  {
    type: 'ConfigElement',
    name: 'vsid',
    dataType: 'UInt32',
    value: '200',
    isReadOnly: false,
    description: '',
  },
] as any;

describe('UpdateSubgraphVsidHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const uow = makeUow({subgraph: null}) as any;
    const handler = new UpdateSubgraphVsidHandler(
      uow,
      makeQueryServices() as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphVsidCommand(10, ELEMENTS)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('returns empty affectedSubgraphSystemIds when VSID unchanged', async () => {
    const uow = makeUow({subgraph: makeSubgraph(10, 200)}) as any;
    const handler = new UpdateSubgraphVsidHandler(
      uow,
      makeQueryServices() as any,
    );
    const result = await handler.handle(
      new UpdateSubgraphVsidCommand(10, ELEMENTS),
    );
    expect(result.affectedSubgraphSystemIds).toHaveLength(0);
    expect(uow._setPropertyData).not.toHaveBeenCalled();
  });

  it('writes only target subgraph when no linked subgraphs', async () => {
    const uow = makeUow({
      subgraph: makeSubgraph(10, 100),
      linkedIds: [],
    }) as any;
    const handler = new UpdateSubgraphVsidHandler(
      uow,
      makeQueryServices() as any,
    );
    const result = await handler.handle(
      new UpdateSubgraphVsidCommand(10, ELEMENTS),
    );
    expect(uow._setPropertyData).toHaveBeenCalledTimes(1);
    expect(result.affectedSubgraphSystemIds).toContain('10');
    expect(uow._commit).toHaveBeenCalled();
  });

  it('rolls back and rethrows when setPropertyData throws', async () => {
    const uow = makeUow({subgraph: makeSubgraph(10, 100)}) as any;
    uow
      .getSubgraphRepository()
      .setPropertyData.mockRejectedValueOnce(new Error('db error'));
    uow.isInTransaction.mockReturnValue(true);
    const handler = new UpdateSubgraphVsidHandler(
      uow,
      makeQueryServices() as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphVsidCommand(10, ELEMENTS)),
    ).rejects.toThrow('db error');
    expect(uow._rollback).toHaveBeenCalled();
  });

  it('throws InvalidOperationException when VSID serialization fails', async () => {
    const badElements = [
      {
        type: 'ConfigElement',
        name: 'vsid',
        dataType: 'UInt32',
        value: 'nan',
        isReadOnly: false,
        description: '',
      },
    ] as any;
    const uow = makeUow({subgraph: makeSubgraph(10, 100)}) as any;
    const handler = new UpdateSubgraphVsidHandler(
      uow,
      makeQueryServices() as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphVsidCommand(10, badElements)),
    ).rejects.toBeInstanceOf(InvalidOperationException);
  });
});
