/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {jest, describe, it, expect} from '@jest/globals';
import {SetSubgraphScenarioHandler} from '../../../../../../src/application/usecase-designer/subgraph/set-scenario/set-subgraph-scenario.handler.js';
import {SetSubgraphScenarioCommand} from '../../../../../../src/application/usecase-designer/subgraph/set-scenario/set-subgraph-scenario.command.js';
import {ResourceNotFoundException} from '../../../../../../src/shared/exceptions/resource-not-found.exception.js';
import {InvalidInputException} from '../../../../../../src/shared/exceptions/invalid-input.exception.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK,
  SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
  SUB_GRAPH_PROP_ID_VSID,
} from '../../../../../../src/domain/entities/definitions/subgraph/subgraph-ids.js';

const SESSION = {sessionId: 1, fileSystemId: 7};
const GROUP_ID = 'g1';
const SCENARIO_DEF_SYS_ID = 50;
const SCENARIO_NATURAL_ID = 0x08001010;
const SCENARIO_ELEMENTS = JSON.stringify([
  {
    elementType: 'ConfigElement',
    name: 'scenario',
    dataType: 'UInt32',
    defaultValue: '1',
  },
]);

function uint32Payload(v: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}

function makeScenarioDef() {
  return {
    systemId: SCENARIO_DEF_SYS_ID,
    naturalId: SCENARIO_NATURAL_ID,
    name: 'scenario',
    description: '',
    propertyType: 'SPF',
    maxSize: 4,
    isVoice: false,
    elementsStructure: SCENARIO_ELEMENTS,
  };
}

function makeVsidDef() {
  return {
    systemId: 51,
    naturalId: SUB_GRAPH_PROP_ID_VSID,
    name: 'vsid',
    description: '',
    propertyType: 'SPF',
    maxSize: 8,
    isVoice: false,
    elementsStructure: JSON.stringify([
      {
        elementType: 'ConfigElement',
        name: 'vsid',
        dataType: 'UInt32',
        defaultValue: '42',
      },
    ]),
  };
}

function makeSubgraph(scenarioValue: number) {
  return {
    systemId: 10,
    properties: [
      {
        systemId: 200,
        propertyDefinitionSystemId: SCENARIO_DEF_SYS_ID,
        getPayloadCopy: () => uint32Payload(scenarioValue),
      },
    ],
  };
}

function makeUow(subgraph: any, vcpmDefs: any[] = []) {
  let nextId = 1000;
  const idGeneration = {
    getNextId: jest.fn().mockImplementation(async () => nextId++),
  };
  const setPropertyData = jest.fn().mockResolvedValue(undefined);
  const startTransaction = jest.fn().mockResolvedValue(undefined);
  const commit = jest.fn().mockResolvedValue(undefined);
  const rollback = jest.fn().mockResolvedValue(undefined);
  const isInTransaction = jest.fn().mockReturnValue(false);
  const aggregates = subgraph
    ? new Map([[subgraph.systemId, subgraph]])
    : new Map();

  return {
    getWriteContext: jest
      .fn()
      .mockReturnValue({session: SESSION, groupId: GROUP_ID}),
    getSubgraphRepository: jest.fn().mockReturnValue({
      getAggregates: jest.fn().mockResolvedValue(aggregates),
      setPropertyData,
      addProperty: jest.fn().mockResolvedValue(999),
      deleteProperty: jest.fn().mockResolvedValue(undefined),
      deleteAllVcpmData: jest.fn().mockResolvedValue(undefined),
      addVcpmModule: jest.fn().mockResolvedValue(undefined),
      getPropertyDefinitions: jest
        .fn()
        .mockResolvedValue([makeScenarioDef(), makeVsidDef()]),
    }),
    getUsecaseRepository: jest.fn().mockReturnValue({
      findBySubgraph: jest.fn().mockResolvedValue([]),
    }),
    getVcpmDefinitionRepository: jest.fn().mockReturnValue({
      getAllVcpmModuleDefinitions: jest.fn().mockResolvedValue(vcpmDefs),
    }),
    getModuleRepository: jest.fn().mockReturnValue({
      getModulesBySubgraphId: jest.fn().mockResolvedValue([]),
      findModulesBySubgraphIds: jest.fn().mockResolvedValue([]),
      DeleteAllCkvData: jest.fn().mockResolvedValue(undefined),
      DeleteAllTkvData: jest.fn().mockResolvedValue(undefined),
    }),
    startTransaction,
    commit,
    rollback,
    isInTransaction,
    _setPropertyData: setPropertyData,
    _commit: commit,
    _rollback: rollback,
    _idGeneration: idGeneration,
  };
}

const AUDIO_RECORDING_ELEMENTS = [
  {
    type: 'ConfigElement',
    name: 'scenario',
    dataType: 'UInt32',
    value: '2',
    isReadOnly: false,
    description: '',
  },
] as any;

describe('SetSubgraphScenarioHandler', () => {
  it('throws ResourceNotFoundException when subgraph not found', async () => {
    const uow = makeUow(null) as any;
    const handler = new SetSubgraphScenarioHandler(uow, uow._idGeneration);
    await expect(
      handler.handle(
        new SetSubgraphScenarioCommand(10, AUDIO_RECORDING_ELEMENTS),
      ),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('returns empty mutation log when scenario unchanged', async () => {
    const uow = makeUow(
      makeSubgraph(SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK),
    ) as any;
    const audioPlaybackElements = [
      {
        type: 'ConfigElement',
        name: 'scenario',
        dataType: 'UInt32',
        value: '1',
        isReadOnly: false,
        description: '',
      },
    ] as any;
    const handler = new SetSubgraphScenarioHandler(uow, uow._idGeneration);
    const result = await handler.handle(
      new SetSubgraphScenarioCommand(10, audioPlaybackElements),
    );
    expect(result.propertiesAdded).toHaveLength(0);
    expect(uow._setPropertyData).not.toHaveBeenCalled();
  });

  it('commits scenario write for audio→audio change', async () => {
    const uow = makeUow(
      makeSubgraph(SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK),
    ) as any;
    const handler = new SetSubgraphScenarioHandler(uow, uow._idGeneration);
    const result = await handler.handle(
      new SetSubgraphScenarioCommand(10, AUDIO_RECORDING_ELEMENTS),
    );
    expect(uow._commit).toHaveBeenCalled();
    expect(result.groupId).toBe(GROUP_ID);
  });

  it('allocates VCPM hierarchy IDs in the handler', async () => {
    const uow = makeUow(
      makeSubgraph(SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK),
      [
        {
          systemId: 70,
          parameters: [
            {
              systemId: 71,
              elementsStructure: JSON.stringify([
                {
                  elementType: 'ConfigElement',
                  name: 'param',
                  dataType: 'UInt32',
                  defaultValue: '7',
                },
              ]),
            },
          ],
        },
      ],
    ) as any;
    const handler = new SetSubgraphScenarioHandler(uow, uow._idGeneration);

    await handler.handle(
      new SetSubgraphScenarioCommand(10, [
        {
          type: 'ConfigElement',
          name: 'scenario',
          dataType: 'UInt32',
          value: String(SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL),
          isReadOnly: false,
          description: '',
        },
      ] as any),
    );

    const [instance, payloadSystemIdsByParameterSystemId] =
      uow.getSubgraphRepository().addVcpmModule.mock.calls[0];
    expect(instance.systemId).toBe(1000);
    expect(instance.subgraphSystemId).toBe(10);
    expect(instance.vcpmModuleDefinitionSystemId).toBe(70);
    expect(instance.ckvs).toHaveLength(1);
    expect(instance.ckvs[0].systemId).toBe(1001);
    expect(instance.ckvs[0].parameterPayloads).toHaveLength(1);
    expect(instance.ckvs[0].parameterPayloads[0].paramDefintionSystemId).toBe(
      71,
    );
    expect(instance.ckvs[0].parameterPayloads[0].getPayloadCopy()).toEqual(
      expect.any(Uint8Array),
    );
    expect(payloadSystemIdsByParameterSystemId).toEqual(new Map([[71, 1002]]));
    expect(uow._idGeneration.getNextId).toHaveBeenCalledTimes(3);
  });

  it('rolls back and rethrows when write fails', async () => {
    const uow = makeUow(
      makeSubgraph(SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK),
    ) as any;
    uow
      .getSubgraphRepository()
      .setPropertyData.mockRejectedValueOnce(new Error('fail'));
    uow.isInTransaction.mockReturnValue(true);
    const handler = new SetSubgraphScenarioHandler(uow, uow._idGeneration);
    await expect(
      handler.handle(
        new SetSubgraphScenarioCommand(10, AUDIO_RECORDING_ELEMENTS),
      ),
    ).rejects.toThrow('fail');
    expect(uow._rollback).toHaveBeenCalled();
  });

  it('throws InvalidInputException when scenario serialization fails', async () => {
    const badElements = [
      {
        type: 'ConfigElement',
        name: 'scenario',
        dataType: 'UInt32',
        value: 'nan',
        isReadOnly: false,
        description: '',
      },
    ] as any;
    const uow = makeUow(
      makeSubgraph(SUB_GRAPH_PROP_ID_SCENARIO_VALUE_AUDIO_PLAYBACK),
    ) as any;
    const handler = new SetSubgraphScenarioHandler(uow, uow._idGeneration);
    await expect(
      handler.handle(new SetSubgraphScenarioCommand(10, badElements)),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
});
