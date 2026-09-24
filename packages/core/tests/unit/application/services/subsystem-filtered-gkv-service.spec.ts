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
    naturalId?: number;
    name: string;
    parentSystemId?: number;
    filteredKeySystemIds: number[];
  }>;
  modules: Array<{
    systemId: number;
    parentSystemId?: number;
    subgraphSystemId: number;
    moduleNaturalId: number;
    containerSystemId: number;
  }>;
}): UsecaseFilteredGkvData {
  return {
    usecases: options.usecases.map(value => usecase(value.systemId, value.gkv)),
    subgraphSystemIdsByUsecase: new Map(
      options.usecases.map(value => [value.systemId, value.subgraphSystemIds]),
    ),
    subsystems: options.subsystems.map(value => ({
      systemId: value.systemId,
      naturalId: value.naturalId ?? value.systemId,
      name: value.name,
      parentSystemId: value.parentSystemId ?? null,
      moduleSystemIds: [],
      subsystemSystemIds: [],
      filteredKeys: value.filteredKeySystemIds.map(systemId => ({
        systemId,
        naturalId: systemId,
        name: `Key ${systemId}`,
      })),
      dataPorts: [],
      controlPorts: [],
    })),
    subgraphNaturalIdsBySystemId: new Map(
      options.usecases.flatMap(value =>
        value.subgraphSystemIds.map(id => [id, id] as const),
      ),
    ),
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
          subgraphSystemId: 50,
          moduleNaturalId: 7,
          containerSystemId: 8,
        },
      ],
    });

    expect(service.buildFilteredGkv(data)).toEqual(
      Result.ok([
        {
          keyValuePairs: rawGkv,
          subsystems: [],
          usecaseSystemIds: [1],
        },
      ]),
    );
  });

  it('removes matching keys and returns the top-level subsystem', () => {
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
          parentSystemId: 10,
          subgraphSystemId: 50,
          moduleNaturalId: 7,
          containerSystemId: 8,
        },
        {
          systemId: 200,
          parentSystemId: 30,
          subgraphSystemId: 60,
          moduleNaturalId: 9,
          containerSystemId: 8,
        },
      ],
    });

    const result = service.buildFilteredGkv(data);

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data[0].keyValuePairs).toEqual([key(20, 21)]);
    expect(result.data[0].subsystems).toEqual([
      {subsystemNaturalId: 10, name: 'Voice'},
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
          parentSystemId: 10,
          filteredKeySystemIds: [10],
        },
      ],
      modules: [
        {
          systemId: 100,
          parentSystemId: 20,
          subgraphSystemId: 50,
          moduleNaturalId: 7,
          containerSystemId: 8,
        },
      ],
    });

    const result = service.buildFilteredGkv(data);

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data[0].keyValuePairs).toEqual([key(20, 21)]);
    expect(result.data[0].subsystems).toEqual([
      {subsystemNaturalId: 10, name: 'Root'},
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
          parentSystemId: 10,
          subgraphSystemId: 50,
          moduleNaturalId: 7,
          containerSystemId: 8,
        },
        {
          systemId: 200,
          subgraphSystemId: 60,
          moduleNaturalId: 9,
          containerSystemId: 8,
        },
      ],
    });

    const result = service.buildFilteredGkv(data, {
      type: 'AND',
      left: {type: 'condition', field: 'subsystemId', value: 10},
      right: {
        type: 'condition',
        field: 'spfModuleInstanceNaturalId',
        value: 7,
      },
    });

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].usecaseSystemIds).toEqual([1]);
  });

  it('keeps usecases with differently ordered GKVs in separate groups', () => {
    const first = [key(10, 11), key(20, 21)];
    const second = [key(20, 21), key(10, 11)];
    const data = makeData({
      usecases: [
        {systemId: 1, subgraphSystemIds: [], gkv: first},
        {systemId: 2, subgraphSystemIds: [], gkv: second},
      ],
      subsystems: [],
      modules: [],
    });

    const result = service.buildFilteredGkv(data);

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data).toHaveLength(2);
    expect(result.data.map(group => group.usecaseSystemIds)).toEqual([
      [1],
      [2],
    ]);
  });
});
