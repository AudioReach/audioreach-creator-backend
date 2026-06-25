/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {TypeOrmBulkReadQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.js';
import type {DataSource, Repository, SelectQueryBuilder} from 'typeorm';

function makeMockQb(rows: unknown[]): SelectQueryBuilder<any> {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  } as unknown as SelectQueryBuilder<any>;
}

function makeRepo(qb: SelectQueryBuilder<any>): Repository<any> {
  return {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  } as unknown as Repository<any>;
}

describe('TypeOrmBulkReadQueryService — readTagKeys', () => {
  let service: TypeOrmBulkReadQueryService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
      getRepository: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;
    service = new TypeOrmBulkReadQueryService(mockDataSource);
  });

  it('returns empty array when no tag definitions exist', async () => {
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb([])),
    );

    const result = await service.readTagKeys(1);
    expect(result).toEqual([]);
  });

  it('returns empty array when tags have no key links', async () => {
    const rows = [{tagId: 0x100, keys: []}];
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb(rows)),
    );

    const result = await service.readTagKeys(1);
    expect(result).toEqual([]); // filtered out — no keys
  });

  it('maps tagId and keyIds for a tag with key links', async () => {
    const rows = [
      {
        tagId: 0x100,
        keys: [{keyDefinition: {keyId: 0x10}}, {keyDefinition: {keyId: 0x20}}],
      },
    ];
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb(rows)),
    );

    const result = await service.readTagKeys(1);

    expect(result).toHaveLength(1);
    expect(result[0].tagId).toBe(0x100);
    expect(result[0].keyIds).toEqual([0x10, 0x20]);
  });

  it('filters out key links with null keyDefinition', async () => {
    const rows = [
      {
        tagId: 0x100,
        keys: [{keyDefinition: {keyId: 0x10}}, {keyDefinition: null}],
      },
    ];
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb(rows)),
    );

    const result = await service.readTagKeys(1);

    expect(result[0].keyIds).toEqual([0x10]);
  });

  it('returns multiple tags in query result order', async () => {
    const rows = [
      {tagId: 0x100, keys: [{keyDefinition: {keyId: 0x10}}]},
      {tagId: 0x200, keys: [{keyDefinition: {keyId: 0x30}}]},
    ];
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb(rows)),
    );

    const result = await service.readTagKeys(1);

    expect(result).toHaveLength(2);
    expect(result[0].tagId).toBe(0x100);
    expect(result[1].tagId).toBe(0x200);
  });
});

describe('TypeOrmBulkReadQueryService — readTaggedModuleData', () => {
  let service: TypeOrmBulkReadQueryService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
      getRepository: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;
    service = new TypeOrmBulkReadQueryService(mockDataSource);
  });

  it('returns empty array when no module tag map entries exist', async () => {
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb([])),
    );

    const result = await service.readTaggedModuleData(1);
    expect(result).toEqual([]);
  });

  it('groups module instances by (subgraphId, tagId)', async () => {
    const rows = [
      {
        module: {
          subgraph: {subgraphId: 1},
          definition: {moduleDefinitionId: 0xa0},
          instanceId: 0xb0,
        },
        tagDefinition: {tagId: 0x10, isVoice: false},
      },
      {
        module: {
          subgraph: {subgraphId: 1},
          definition: {moduleDefinitionId: 0xa1},
          instanceId: 0xb1,
        },
        tagDefinition: {tagId: 0x10, isVoice: false},
      },
    ];
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb(rows)),
    );

    const result = await service.readTaggedModuleData(1);

    expect(result).toHaveLength(1);
    expect(result[0].subgraphId).toBe(1);
    expect(result[0].tagId).toBe(0x10);
    expect(result[0].isVoice).toBe(false);
    expect(result[0].moduleInstances).toHaveLength(2);
    expect(result[0].moduleInstances[0]).toEqual({
      moduleId: 0xa0,
      instanceId: 0xb0,
    });
    expect(result[0].moduleInstances[1]).toEqual({
      moduleId: 0xa1,
      instanceId: 0xb1,
    });
  });

  it('creates separate groups for different (subgraphId, tagId) pairs', async () => {
    const rows = [
      {
        module: {
          subgraph: {subgraphId: 1},
          definition: {moduleDefinitionId: 1},
          instanceId: 10,
        },
        tagDefinition: {tagId: 0x10, isVoice: false},
      },
      {
        module: {
          subgraph: {subgraphId: 1},
          definition: {moduleDefinitionId: 2},
          instanceId: 20,
        },
        tagDefinition: {tagId: 0x20, isVoice: true},
      },
    ];
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb(rows)),
    );

    const result = await service.readTaggedModuleData(1);

    expect(result).toHaveLength(2);
    expect(result[0].tagId).toBe(0x10);
    expect(result[0].isVoice).toBe(false);
    expect(result[1].tagId).toBe(0x20);
    expect(result[1].isVoice).toBe(true);
  });
});

describe('TypeOrmBulkReadQueryService — readTagData', () => {
  let service: TypeOrmBulkReadQueryService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
      getRepository: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;
    service = new TypeOrmBulkReadQueryService(mockDataSource);
  });

  it('returns empty array when no module tag map rows exist', async () => {
    // Only 1 call — base query returns empty, returns early
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb([])),
    );

    const result = await service.readTagData(1);
    expect(result).toEqual([]);
  });

  it('returns empty array when row has no tkvs', async () => {
    // Call 1: base ModuleTagIdMap rows
    // Call 2: TKV rows by mapId (returns empty — no TKVs)
    const mapRows = [
      {
        systemId: 1,
        module: {subgraph: {subgraphId: 1}, instanceId: 100},
        tagDefinition: {tagId: 0x10},
      },
    ];

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce(makeRepo(makeMockQb(mapRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb([])));

    const result = await service.readTagData(1);
    expect(result).toEqual([]);
  });

  it('maps tkv data with parameters for a single entry', async () => {
    // Call 1: base ModuleTagIdMap rows
    const mapRows = [
      {
        systemId: 1,
        module: {subgraph: {subgraphId: 5}, instanceId: 300},
        tagDefinition: {tagId: 0x100},
      },
    ];

    // Call 2: TKV rows by mapId
    const tkvRows = [{systemId: 99, moduleTagIdMapSystemId: 1}];

    // Call 3: TKV values (Promise.all[0])
    const valRows = [
      {tkvSystemId: 99, valueDef: {keys: {keyId: 0x10}, valueId: 0xa0}},
      {tkvSystemId: 99, valueDef: {keys: {keyId: 0x20}, valueId: 0xb0}},
    ];

    // Call 4: TKV parameter payloads (Promise.all[1])
    const paramRows = [
      {
        tkvSystemId: 99,
        spfParameter: {paramId: 0x400},
        payload: new Uint8Array([0xde, 0xad]),
      },
    ];

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce(makeRepo(makeMockQb(mapRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(tkvRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(valRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(paramRows)));

    const result = await service.readTagData(1);

    expect(result).toHaveLength(1);
    expect(result[0].subgraphId).toBe(5);
    expect(result[0].tagId).toBe(0x100);
    expect(result[0].numTagKeyValues).toBe(2);
    expect(result[0].tkvs).toHaveLength(1);
    expect(result[0].tkvs[0].tagKeyValues).toEqual([0xa0, 0xb0]);
    expect(result[0].tkvs[0].modules[0].moduleInstanceId).toBe(300);
    expect(result[0].tkvs[0].modules[0].parameters).toHaveLength(1);
    expect(result[0].tkvs[0].modules[0].parameters[0].parameterId).toBe(0x400);
  });

  it('sorts tagKeyValues by keyId ASC', async () => {
    const mapRows = [
      {
        systemId: 1,
        module: {subgraph: {subgraphId: 1}, instanceId: 10},
        tagDefinition: {tagId: 0x10},
      },
    ];
    const tkvRows = [{systemId: 10, moduleTagIdMapSystemId: 1}];
    // values out of keyId order — app layer sorts them
    const valRows = [
      {tkvSystemId: 10, valueDef: {keys: {keyId: 0x20}, valueId: 0xb0}},
      {tkvSystemId: 10, valueDef: {keys: {keyId: 0x10}, valueId: 0xa0}},
    ];

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce(makeRepo(makeMockQb(mapRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(tkvRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(valRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb([])));

    const result = await service.readTagData(1);
    expect(result[0].tkvs[0].tagKeyValues).toEqual([0xa0, 0xb0]);
  });

  it('chunks TKV parameter queries when tkv IDs exceed 999', async () => {
    const mapRows = [
      {
        systemId: 1,
        module: {subgraph: {subgraphId: 1}, instanceId: 1},
        tagDefinition: {tagId: 0x10},
      },
    ];
    const tkvRows = Array.from({length: 1500}, (_, i) => ({
      systemId: i + 1,
      moduleTagIdMapSystemId: 1,
    }));

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce(makeRepo(makeMockQb(mapRows))) // base
      .mockReturnValueOnce(makeRepo(makeMockQb(tkvRows))) // TKVs by mapId
      .mockReturnValue(makeRepo(makeMockQb([]))); // values + params chunks

    await service.readTagData(1);

    // 1 base + 1 TKV fetch + 2 value chunks (999+501) + 2 param chunks (999+501) = 6 total
    const extraCallCount =
      (mockDataSource.getRepository as jest.Mock).mock.calls.length - 1;
    expect(extraCallCount).toBe(5);
  });
});
