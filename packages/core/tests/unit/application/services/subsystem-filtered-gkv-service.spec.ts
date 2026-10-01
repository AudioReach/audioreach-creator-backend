/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {jest} from '@jest/globals';
import {
  Result,
  RESULT_KIND,
} from '../../../../src/application/shared/result/result.js';
import type {UseCaseReadModel} from '../../../../src/application/ports/persistence/query-services/usecase/query-models/usecase-read-model.js';
import {
  SubsystemFilteredGkvService,
  type UsecaseFilteredGkvData,
  type UsecaseFilteredTopologyData,
} from '../../../../src/application/services/subsystem-filtered-gkv-service.js';
import type {UseCaseQueryService} from '../../../../src/application/ports/persistence/query-services/usecase/usecase-query-service.js';

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
    containerNaturalId: number;
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
      filteredKeys: value.filteredKeySystemIds.map(systemId => ({
        systemId,
        naturalId: systemId,
        name: `Key ${systemId}`,
      })),
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
  const service = new SubsystemFilteredGkvService({} as UseCaseQueryService);

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
          containerNaturalId: 8,
        },
      ],
    });

    expect(service.buildFilteredGkv(data)).toEqual(
      Result.ok([
        {
          keyValuePairs: rawGkv,
          subsystems: [],
          usecases: [usecase(1, rawGkv)],
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
          containerNaturalId: 8,
        },
        {
          systemId: 200,
          parentSystemId: 30,
          subgraphSystemId: 60,
          moduleNaturalId: 9,
          containerNaturalId: 8,
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
          containerNaturalId: 8,
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
          containerNaturalId: 8,
        },
        {
          systemId: 200,
          subgraphSystemId: 60,
          moduleNaturalId: 9,
          containerNaturalId: 8,
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
    expect(result.data[0].usecases.map(u => u.systemId)).toEqual([1]);
  });

  it('matches container filters using the container natural ID', () => {
    const data = makeData({
      usecases: [
        {systemId: 1, subgraphSystemIds: [50], gkv: []},
        {systemId: 2, subgraphSystemIds: [60], gkv: []},
      ],
      subsystems: [],
      modules: [
        {
          systemId: 100,
          subgraphSystemId: 50,
          moduleNaturalId: 7,
          containerNaturalId: 800,
        },
        {
          systemId: 200,
          subgraphSystemId: 60,
          moduleNaturalId: 9,
          containerNaturalId: 900,
        },
      ],
    });

    const result = service.findMatchingUsecaseIds(
      {
        ...data,
        usecaseSystemIds: data.usecases.map(usecase => usecase.systemId),
      },
      {
        type: 'condition',
        field: 'containerNaturalId',
        value: 800,
      },
    );

    expect(result).toEqual(Result.ok([1]));
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
    expect(
      result.data.map(group => group.usecases.map(u => u.systemId)),
    ).toEqual([[1], [2]]);
  });
});

describe('SubsystemFilteredGkvService.resolveFilteredGroups', () => {
  const emptyTopology: UsecaseFilteredTopologyData = {
    usecaseSystemIds: [1, 2],
    subgraphSystemIdsByUsecase: new Map([
      [1, [50]],
      [2, [60]],
    ]),
    subgraphNaturalIdsBySystemId: new Map([
      [50, 5],
      [60, 6],
    ]),
    subsystems: [],
    modules: [],
  };

  function buildQueryService(
    topology = emptyTopology,
    usecases: UseCaseReadModel[] = [],
  ): jest.Mocked<UseCaseQueryService> {
    return {
      getUsecaseFilteredTopologyData: jest
        .fn()
        .mockResolvedValue(Result.ok(topology)),
      getUsecasesWithGkv: jest.fn().mockResolvedValue(Result.ok(usecases)),
    } as unknown as jest.Mocked<UseCaseQueryService>;
  }

  it('returns empty groups when no usecases match the filter', async () => {
    const querySvc = buildQueryService({
      ...emptyTopology,
      usecaseSystemIds: [],
    });
    const service = new SubsystemFilteredGkvService(querySvc);

    const result = await service.resolveFilteredGroups(42);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(0);
    expect(querySvc.getUsecaseFilteredTopologyData).toHaveBeenCalledWith(42);
    expect(querySvc.getUsecasesWithGkv).toHaveBeenCalledWith(42, []);
  });

  it('forwards a topology failure without calling getUsecasesWithGkv', async () => {
    const querySvc = {
      getUsecaseFilteredTopologyData: jest.fn().mockResolvedValue(
        Result.fail({
          code: 'DB_QUERY_FAILED',
          message: 'err',
          severity: 'Error',
        } as never),
      ),
      getUsecasesWithGkv: jest.fn(),
    } as unknown as jest.Mocked<UseCaseQueryService>;
    const service = new SubsystemFilteredGkvService(querySvc);

    const result = await service.resolveFilteredGroups(42);

    expect(result.kind).toBe(RESULT_KIND.Fail);
    expect(querySvc.getUsecasesWithGkv).not.toHaveBeenCalled();
  });

  it('rejects an unknown subsystem ID in the filter', async () => {
    const querySvc = buildQueryService();
    const service = new SubsystemFilteredGkvService(querySvc);

    const result = await service.resolveFilteredGroups(42, {
      type: 'condition',
      field: 'subsystemId',
      value: 999,
    });

    expect(result.kind).toBe(RESULT_KIND.Fail);
  });

  it('groups usecases with identical GKV under one entry', async () => {
    const querySvc = buildQueryService(emptyTopology, [
      usecase(1, [key(10, 11)]),
      usecase(2, [key(10, 11)]),
    ]);
    const service = new SubsystemFilteredGkvService(querySvc);

    const result = await service.resolveFilteredGroups(42);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0].usecases.map(u => u.systemId)).toEqual([1, 2]);
  });
});
