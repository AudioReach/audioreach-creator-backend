/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {UpdateSubgraphPropertyHandler} from '../../../../../../src/application/usecase-designer/subgraph/update-property/update-subgraph-property.handler.js';
import {UpdateSubgraphPropertyCommand} from '../../../../../../src/application/usecase-designer/subgraph/update-property/update-subgraph-property.command.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_VSID,
} from '../../../../../../src/application/file-operations/shared/constants/spf-ids.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../../../../src/shared/exceptions/invalid-operation.exception.js';
import {Result} from '../../../../../../src/application/shared/result/result.js';

const SESSION = {sessionId: 1, fileSystemId: 7};
const ELEMENTS_STRUCTURE = JSON.stringify([
  {elementType: 'ConfigElement', name: 'v', dataType: 'UInt32'},
]);

function makeDef(propertyId: number) {
  return {
    systemId: 101,
    propertyId,
    name: 'prop',
    description: '',
    propertyType: 'SPF',
    maxSize: 4,
    isVoice: false,
    elementsStructure: ELEMENTS_STRUCTURE,
  };
}

function makeUow(exists: boolean) {
  const setPropertyData = jest.fn().mockResolvedValue(undefined);
  return {
    getWriteContext: jest
      .fn()
      .mockReturnValue({session: SESSION, groupId: 'g1'}),
    getSubgraphRepository: jest.fn().mockReturnValue({
      subgraphExists: jest.fn().mockResolvedValue(exists),
      setPropertyData,
    }),
    _setPropertyData: setPropertyData,
  };
}

function makeQueryServices(defResult: any) {
  return {
    subgraphPropertyDefQueryService: {
      getSubgraphPropertyDefinitionWithElements: jest
        .fn()
        .mockResolvedValue(defResult),
    },
  };
}

const GOOD_ELEMENTS = [
  {
    type: 'ConfigElement',
    name: 'v',
    dataType: 'UInt32',
    value: '3',
    isReadOnly: false,
    description: '',
  },
] as any;

describe('UpdateSubgraphPropertyHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const handler = new UpdateSubgraphPropertyHandler(
      makeUow(false) as any,
      makeQueryServices(Result.ok(makeDef(0x1234))) as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphPropertyCommand(99, 101, GOOD_ELEMENTS)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when property definition not found', async () => {
    const handler = new UpdateSubgraphPropertyHandler(
      makeUow(true) as any,
      makeQueryServices(
        Result.fail({
          code: 'ENTITY_NOT_FOUND',
          message: 'nf',
          severity: 'Error',
        }),
      ) as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('throws InvalidOperationException for reserved scenario property', async () => {
    const handler = new UpdateSubgraphPropertyHandler(
      makeUow(true) as any,
      makeQueryServices(
        Result.ok(makeDef(SUB_GRAPH_PROP_ID_SCENARIO_ID)),
      ) as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS)),
    ).rejects.toBeInstanceOf(InvalidOperationException);
  });

  it('throws InvalidOperationException for reserved VSID property', async () => {
    const handler = new UpdateSubgraphPropertyHandler(
      makeUow(true) as any,
      makeQueryServices(Result.ok(makeDef(SUB_GRAPH_PROP_ID_VSID))) as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS)),
    ).rejects.toBeInstanceOf(InvalidOperationException);
  });

  it('throws InvalidOperationException when serialization fails', async () => {
    const badElements = [
      {
        type: 'ConfigElement',
        name: 'v',
        dataType: 'UInt32',
        value: 'not-a-number',
        isReadOnly: false,
        description: '',
      },
    ] as any;
    const handler = new UpdateSubgraphPropertyHandler(
      makeUow(true) as any,
      makeQueryServices(Result.ok(makeDef(0x1234))) as any,
    );
    await expect(
      handler.handle(new UpdateSubgraphPropertyCommand(10, 101, badElements)),
    ).rejects.toBeInstanceOf(InvalidOperationException);
  });

  it('calls setPropertyData with serialized payload on success', async () => {
    const uow = makeUow(true) as any;
    const handler = new UpdateSubgraphPropertyHandler(
      uow,
      makeQueryServices(Result.ok(makeDef(0x1234))) as any,
    );
    await handler.handle(
      new UpdateSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS),
    );
    expect(uow._setPropertyData).toHaveBeenCalledWith(
      10,
      101,
      expect.any(Uint8Array),
    );
  });
});
