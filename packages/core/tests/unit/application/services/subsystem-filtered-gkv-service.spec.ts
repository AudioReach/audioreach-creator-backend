/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../src/application/shared/result/result.js';
import type {UseCaseReadModel} from '../../../../src/application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import {
  SubsystemFilteredGkvService,
  type UsecaseFilteredGkvData,
} from '../../../../src/application/services/subsystem-filtered-gkv-service.js';

const key = (systemId: number, valueSystemId: number) => ({
  key: {systemId, keyId: systemId, name: `Key ${systemId}`},
  value: {
    systemId: valueSystemId,
    valueId: valueSystemId,
    name: `Value ${valueSystemId}`,
  },
});

function usecase(
  systemId: number,
  gkv: UseCaseReadModel['gkv'],
): UseCaseReadModel {
  return {systemId, gkv};
}

function makeData(options: {
  usecases: Array<{
    systemId: number;
    subgraphSystemIds: number[];
    gkv: UseCaseReadModel['gkv'];
  }>;
  subsystems: Array<{
    systemId: number;
    name: string;
    parentId?: number;
    filteredKeySystemIds: number[];
  }>;
  modules: Array<{
    systemId: number;
    parentId?: number;
    subgraphId: number;
    instanceId: number;
    containerId: number;
  }>;
}): UsecaseFilteredGkvData {
  return {
    usecases: options.usecases.map(value => usecase(value.systemId, value.gkv)),
    subgraphSystemIdsByUsecase: new Map(
      options.usecases.map(value => [value.systemId, value.subgraphSystemIds]),
    ),
    subsystems: options.subsystems.map(value => ({
      ...value,
      filteredKeys: [],
    })),
    modules: options.modules,
  };
}

describe('SubsystemFilteredGkvService', () => {
  const service = new SubsystemFilteredGkvService();

  it('keeps raw GKV when a usecase has no subsystem topology', () => {
    const rawGkv = [key(10, 11)];
    const data = makeData({
      usecases: [{systemId: 1, subgraphSystemIds: [50], gkv: rawGkv}],
      subsystems: [],
      modules: [
        {
          systemId: 100,
          subgraphId: 50,
          instanceId: 7,
          containerId: 8,
        },
      ],
    });

    expect(service.buildFilteredGkv(data)).toEqual(
      Result.ok([{filteredGkv: rawGkv, usecaseSystemIds: [1]}]),
    );
  });

  it('removes matching keys and adds the top-level subsystem marker', () => {
    const data = makeData({
      usecases: [
        {
          systemId: 1,
          subgraphSystemIds: [50, 60],
          gkv: [key(10, 11), key(20, 21)],
        },
      ],
      subsystems: [
        {systemId: 10, name: 'Voice', filteredKeySystemIds: [10]},
        {systemId: 30, name: 'Other', filteredKeySystemIds: []},
      ],
      modules: [
        {
          systemId: 100,
          parentId: 10,
          subgraphId: 50,
          instanceId: 7,
          containerId: 8,
        },
        {
          systemId: 200,
          parentId: 30,
          subgraphId: 60,
          instanceId: 9,
          containerId: 8,
        },
      ],
    });

    const result = service.buildFilteredGkv(data);

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data[0].filteredGkv).toEqual([
      key(20, 21),
      {
        key: {systemId: 0xacdbf100, keyId: 0xacdbf100, name: 'Subsystem'},
        value: {systemId: 10, valueId: 10, name: 'Voice'},
      },
    ]);
  });

  it('preserves the hierarchy-root exception while applying a child filter', () => {
    const data = makeData({
      usecases: [
        {
          systemId: 1,
          subgraphSystemIds: [50],
          gkv: [key(10, 11), key(20, 21)],
        },
      ],
      subsystems: [
        {systemId: 10, name: 'Root', filteredKeySystemIds: [20]},
        {
          systemId: 20,
          name: 'Child',
          parentId: 10,
          filteredKeySystemIds: [10],
        },
      ],
      modules: [
        {
          systemId: 100,
          parentId: 20,
          subgraphId: 50,
          instanceId: 7,
          containerId: 8,
        },
      ],
    });

    const result = service.buildFilteredGkv(data);

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data[0].filteredGkv).toEqual([
      key(20, 21),
      {
        key: {systemId: 0xacdbf100, keyId: 0xacdbf100, name: 'Subsystem'},
        value: {systemId: 10, valueId: 10, name: 'Root'},
      },
    ]);
  });

  it('evaluates subsystem and component filters together', () => {
    const data = makeData({
      usecases: [
        {systemId: 1, subgraphSystemIds: [50], gkv: []},
        {systemId: 2, subgraphSystemIds: [60], gkv: []},
      ],
      subsystems: [{systemId: 10, name: 'Voice', filteredKeySystemIds: []}],
      modules: [
        {
          systemId: 100,
          parentId: 10,
          subgraphId: 50,
          instanceId: 7,
          containerId: 8,
        },
        {
          systemId: 200,
          subgraphId: 60,
          instanceId: 9,
          containerId: 8,
        },
      ],
    });

    const result = service.buildFilteredGkv(data, {
      type: 'AND',
      left: {type: 'condition', field: 'subsystemId', value: 10},
      right: {type: 'condition', field: 'spfModuleInstanceId', value: 7},
    });

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].usecaseSystemIds).toEqual([1]);
  });
});
