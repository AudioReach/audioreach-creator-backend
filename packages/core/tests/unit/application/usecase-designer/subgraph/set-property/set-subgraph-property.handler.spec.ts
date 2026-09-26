/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {SetSubgraphPropertyHandler} from '../../../../../../src/application/usecase-designer/subgraph/set-property/set-subgraph-property.handler.js';
import {SetSubgraphPropertyCommand} from '../../../../../../src/application/usecase-designer/subgraph/set-property/set-subgraph-property.command.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_VSID,
} from '../../../../../../src/domain/entities/definitions/subgraph/subgraph-ids.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {InvalidInputException} from '../../../../../../src/shared/exceptions/invalid-input.exception.js';
import {InvalidOperationException} from '../../../../../../src/shared/exceptions/invalid-operation.exception.js';

const SESSION = {sessionId: 1, fileSystemId: 7};
const ELEMENTS_STRUCTURE = JSON.stringify([
  {elementType: 'ConfigElement', name: 'v', dataType: 'UInt32'},
]);

function makeDef(naturalId: number) {
  return {
    systemId: 101,
    naturalId,
    name: 'prop',
    description: '',
    propertyType: 'SPF',
    maxSize: 4,
    isVoice: false,
    elementsStructure: ELEMENTS_STRUCTURE,
  };
}

function makeUow(exists: boolean, definition: any = makeDef(0x1234)) {
  const setPropertyData = jest.fn().mockResolvedValue(undefined);
  return {
    getWriteContext: jest
      .fn()
      .mockReturnValue({session: SESSION, groupId: 'g1'}),
    getSubgraphRepository: jest.fn().mockReturnValue({
      subgraphExists: jest.fn().mockResolvedValue(exists),
      setPropertyData,
      getPropertyDefinitions: jest
        .fn()
        .mockResolvedValue(definition === null ? [] : [definition]),
    }),
    _setPropertyData: setPropertyData,
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

describe('SetSubgraphPropertyHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const handler = new SetSubgraphPropertyHandler(makeUow(false) as any);
    await expect(
      handler.handle(new SetSubgraphPropertyCommand(99, 101, GOOD_ELEMENTS)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('throws ResourceNotFoundException when property definition not found', async () => {
    const handler = new SetSubgraphPropertyHandler(makeUow(true, null) as any);
    await expect(
      handler.handle(new SetSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS)),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('throws InvalidOperationException for reserved scenario property', async () => {
    const handler = new SetSubgraphPropertyHandler(
      makeUow(true, makeDef(SUB_GRAPH_PROP_ID_SCENARIO_ID)) as any,
    );
    await expect(
      handler.handle(new SetSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS)),
    ).rejects.toThrow(
      'Property prop is reserved and cannot be replaced through the generic property operation.',
    );
  });

  it('throws InvalidOperationException for reserved VSID property', async () => {
    const handler = new SetSubgraphPropertyHandler(
      makeUow(true, makeDef(SUB_GRAPH_PROP_ID_VSID)) as any,
    );
    await expect(
      handler.handle(new SetSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS)),
    ).rejects.toThrow(
      'Property prop is reserved and cannot be replaced through the generic property operation.',
    );
  });

  it('throws InvalidInputException when serialization fails', async () => {
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
    const handler = new SetSubgraphPropertyHandler(makeUow(true) as any);
    await expect(
      handler.handle(new SetSubgraphPropertyCommand(10, 101, badElements)),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('calls setPropertyData with serialized payload on success', async () => {
    const uow = makeUow(true) as any;
    const handler = new SetSubgraphPropertyHandler(uow);
    await handler.handle(
      new SetSubgraphPropertyCommand(10, 101, GOOD_ELEMENTS),
    );
    expect(uow._setPropertyData).toHaveBeenCalledWith(
      10,
      101,
      expect.any(Uint8Array),
    );
  });
});
