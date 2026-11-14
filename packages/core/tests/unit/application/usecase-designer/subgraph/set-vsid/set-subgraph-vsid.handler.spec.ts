/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {SetSubgraphVsidHandler} from '../../../../../../src/application/usecase-designer/subgraph/set-vsid/set-subgraph-vsid.handler.js';
import {SetSubgraphVsidCommand} from '../../../../../../src/application/usecase-designer/subgraph/set-vsid/set-subgraph-vsid.command.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {InvalidInputException} from '../../../../../../src/shared/exceptions/invalid-input.exception.js';
import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';
import {batchOf, notFoundBatch} from '../../../../../helpers/index.js';

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
    naturalId: VSID_NATURAL_ID,
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
              propertyDefinitionSystemId: VSID_DEF_SYS_ID,
              getPayloadCopy: () => uint32Payload(vsidValue),
            },
          ]
        : [],
  };
}

interface UseCaseLink {
  valueSystemIds: number[];
  subgraphSystemIds: number[];
}

function makeUow(
  opts: {subgraph?: any; linked?: any[]; usecases?: UseCaseLink[]} = {},
) {
  const setPropertyData = jest.fn().mockResolvedValue(undefined);
  const startTransaction = jest.fn().mockResolvedValue(undefined);
  const commit = jest.fn().mockResolvedValue(undefined);
  const rollback = jest.fn().mockResolvedValue(undefined);
  const isInTransaction = jest.fn().mockReturnValue(false);
  const {subgraph = makeSubgraph(10, 100), linked = [], usecases = []} = opts;
  const subgraphs = new Map<number, any>(
    [subgraph, ...linked].filter(Boolean).map(sg => [sg.systemId, sg]),
  );

  return {
    getWriteContext: jest
      .fn()
      .mockReturnValue({session: SESSION, groupId: GROUP_ID}),
    getSubgraphRepository: jest.fn().mockReturnValue({
      findSubgraphAggregates: jest
        .fn()
        .mockImplementation((_fs: number, ids: number[]) => {
          const found = ids.filter(id => subgraphs.has(id));
          return Promise.resolve(
            batchOf(
              ENTITY_TYPE.Subgraph,
              found.map(id => subgraphs.get(id)),
              notFoundBatch(
                ENTITY_TYPE.Subgraph,
                ...ids.filter(id => !subgraphs.has(id)),
              ).failed,
            ),
          );
        }),
      setPropertyData,
      getPropertyDefinitions: jest.fn().mockResolvedValue([makeVsidDef()]),
    }),
    getUsecaseRepository: jest.fn().mockReturnValue({
      findUseCasesBySubgraphs: jest
        .fn()
        .mockImplementation((_fs: number, ids: number[]) =>
          Promise.resolve(
            usecases
              .filter(uc => uc.subgraphSystemIds.some(id => ids.includes(id)))
              .map(uc => ({
                keyVector: {valueSystemIds: uc.valueSystemIds},
                subgraphSystemIds: uc.subgraphSystemIds,
              })),
          ),
        ),
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

describe('SetSubgraphVsidHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const uow = makeUow({subgraph: null}) as any;
    const handler = new SetSubgraphVsidHandler(uow);
    await expect(
      handler.handle(new SetSubgraphVsidCommand(10, VSID_DEF_SYS_ID, ELEMENTS)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('rejects a system ID that is not the VSID property before writing', async () => {
    const uow = makeUow({subgraph: makeSubgraph(10, 100)}) as any;
    const handler = new SetSubgraphVsidHandler(uow);
    const command = new SetSubgraphVsidCommand(10, 999, ELEMENTS);

    await expect(handler.handle(command)).rejects.toBeInstanceOf(
      InvalidInputException,
    );
    expect(uow.startTransaction).not.toHaveBeenCalled();
    expect(uow._setPropertyData).not.toHaveBeenCalled();
    expect(uow._commit).not.toHaveBeenCalled();
  });

  it('returns empty affectedSubgraphSystemIds when VSID unchanged', async () => {
    const uow = makeUow({subgraph: makeSubgraph(10, 200)}) as any;
    const handler = new SetSubgraphVsidHandler(uow);
    const result = await handler.handle(
      new SetSubgraphVsidCommand(10, VSID_DEF_SYS_ID, ELEMENTS),
    );
    expect(result.affectedSubgraphSystemIds).toHaveLength(0);
    expect(uow._setPropertyData).not.toHaveBeenCalled();
  });

  it('writes only target subgraph when no linked subgraphs', async () => {
    const uow = makeUow({
      subgraph: makeSubgraph(10, 100),
    }) as any;
    const handler = new SetSubgraphVsidHandler(uow);
    const result = await handler.handle(
      new SetSubgraphVsidCommand(10, VSID_DEF_SYS_ID, ELEMENTS),
    );
    expect(uow._setPropertyData).toHaveBeenCalledTimes(1);
    expect(result.affectedSubgraphSystemIds).toContain('10');
    expect(uow._commit).toHaveBeenCalled();
  });

  it('updates every subgraph reachable through use cases with key values', async () => {
    const uow = makeUow({
      subgraph: makeSubgraph(10, 100),
      linked: [
        makeSubgraph(20, 100),
        makeSubgraph(30, 100),
        makeSubgraph(40, 100),
      ],
      usecases: [
        {valueSystemIds: [1], subgraphSystemIds: [10, 20]},
        {valueSystemIds: [2], subgraphSystemIds: [20, 30]},
        {valueSystemIds: [], subgraphSystemIds: [30, 40]},
      ],
    }) as any;
    const handler = new SetSubgraphVsidHandler(uow);

    const result = await handler.handle(
      new SetSubgraphVsidCommand(10, VSID_DEF_SYS_ID, ELEMENTS),
    );

    expect([...result.affectedSubgraphSystemIds].sort()).toEqual([
      '10',
      '20',
      '30',
    ]);
    expect(uow._setPropertyData).toHaveBeenCalledTimes(3);
  });

  it('skips a linked subgraph that already has the requested VSID', async () => {
    const uow = makeUow({
      subgraph: makeSubgraph(10, 100),
      linked: [makeSubgraph(20, 200), makeSubgraph(30, 100)],
      usecases: [
        {valueSystemIds: [1], subgraphSystemIds: [10, 20]},
        {valueSystemIds: [1], subgraphSystemIds: [10, 30]},
      ],
    }) as any;
    const handler = new SetSubgraphVsidHandler(uow);

    const result = await handler.handle(
      new SetSubgraphVsidCommand(10, VSID_DEF_SYS_ID, ELEMENTS),
    );

    expect([...result.affectedSubgraphSystemIds].sort()).toEqual(['10', '30']);
  });

  it('rolls back and rethrows when setPropertyData throws', async () => {
    const uow = makeUow({subgraph: makeSubgraph(10, 100)}) as any;
    uow
      .getSubgraphRepository()
      .setPropertyData.mockRejectedValueOnce(new Error('db error'));
    uow.isInTransaction.mockReturnValue(true);
    const handler = new SetSubgraphVsidHandler(uow);
    await expect(
      handler.handle(new SetSubgraphVsidCommand(10, VSID_DEF_SYS_ID, ELEMENTS)),
    ).rejects.toThrow('db error');
    expect(uow._rollback).toHaveBeenCalled();
  });

  it('throws InvalidInputException when VSID serialization fails', async () => {
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
    const handler = new SetSubgraphVsidHandler(uow);
    await expect(
      handler.handle(
        new SetSubgraphVsidCommand(10, VSID_DEF_SYS_ID, badElements),
      ),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
});
