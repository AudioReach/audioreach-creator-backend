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

describe('TypeOrmBulkReadQueryService - readCalibrationData', () => {
  let repository: TypeOrmBulkReadQueryService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
      getRepository: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;
    repository = new TypeOrmBulkReadQueryService(mockDataSource);
  });

  it('should return empty array when no CKV entries exist', async () => {
    // Only 1 call — base query returns empty, returns early
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce(
      makeRepo(makeMockQb([])),
    );

    const result = await repository.readCalibrationData(1);

    expect(result).toEqual([]);
  });

  it('should return unified calibration data with master keys', async () => {
    // Query 1: CKV base rows (no values — fetched separately)
    const ckvRows = [
      {
        systemId: 1,
        module: {
          instanceId: 300,
          subgraph: {subgraphId: 100},
        },
      },
    ];

    // Query 2: CkvValues rows (Promise.all[0])
    const valRows = [
      {
        ckvSystemId: 1,
        valueDef: {keys: {keyId: 1, isDynamic: false}, valueId: 10},
      },
      {
        ckvSystemId: 1,
        valueDef: {keys: {keyId: 2, isDynamic: true}, valueId: 20},
      },
    ];

    // Query 3: CkvParameterPayload rows (Promise.all[1])
    const paramRows = [
      {
        ckvSystemId: 1,
        spfParameter: {paramId: 400, pidType: 'SharedPersistent'},
        payload: Buffer.from('DEADBEEF', 'hex'),
      },
    ];

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce(makeRepo(makeMockQb(ckvRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(valRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(paramRows)));

    const result = await repository.readCalibrationData(1);

    expect(result).toHaveLength(1);
    expect(result[0].subgraphId).toBe(100);
    expect(result[0].masterKeys).toEqual([
      {keyId: 1, isDynamic: false},
      {keyId: 2, isDynamic: true},
    ]);
    expect(result[0].keyValueCombinations).toHaveLength(1);
    expect(result[0].keyValueCombinations[0].keyIds).toEqual([1, 2]);
    expect(result[0].keyValueCombinations[0].valueIds).toEqual([10, 20]);
    expect(result[0].keyValueCombinations[0].modules).toHaveLength(1);
    expect(result[0].keyValueCombinations[0].modules[0].moduleInstanceId).toBe(
      300,
    );
    expect(
      result[0].keyValueCombinations[0].modules[0].parameters,
    ).toHaveLength(1);
    expect(
      result[0].keyValueCombinations[0].modules[0].parameters[0].parameterId,
    ).toBe(400);
    expect(
      result[0].keyValueCombinations[0].modules[0].parameters[0].pidType,
    ).toBe('SharedPersistent');
  });

  it('should return calibration data for multiple subgraphs', async () => {
    const ckvRows = [
      {systemId: 1, module: {instanceId: 10, subgraph: {subgraphId: 1}}},
      {systemId: 2, module: {instanceId: 20, subgraph: {subgraphId: 2}}},
    ];

    const valRows = [
      {
        ckvSystemId: 1,
        valueDef: {keys: {keyId: 1, isDynamic: false}, valueId: 10},
      },
      {
        ckvSystemId: 2,
        valueDef: {keys: {keyId: 2, isDynamic: true}, valueId: 20},
      },
    ];

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce(makeRepo(makeMockQb(ckvRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb(valRows)))
      .mockReturnValueOnce(makeRepo(makeMockQb([])));

    const result = await repository.readCalibrationData(1);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.subgraphId)).toEqual([1, 2]);
  });

  describe('SQLite variable limit chunking', () => {
    it('should execute 1 values chunk + 1 param chunk for <= 999 CKV IDs', async () => {
      const ckvCount = 500;
      const ckvRows = Array.from({length: ckvCount}, (_, i) => ({
        systemId: i + 1,
        module: {instanceId: i + 1, subgraph: {subgraphId: 1}},
      }));

      (mockDataSource.getRepository as jest.Mock)
        .mockReturnValueOnce(makeRepo(makeMockQb(ckvRows)))
        .mockReturnValue(makeRepo(makeMockQb([])));

      await repository.readCalibrationData(1);

      // 1 base + 1 values chunk + 1 params chunk = 3 total
      const extraCallCount =
        (mockDataSource.getRepository as jest.Mock).mock.calls.length - 1;
      expect(extraCallCount).toBe(2);
    });

    it('should chunk values and parameter queries when CKV IDs exceed 999', async () => {
      const ckvCount = 1500;
      const ckvRows = Array.from({length: ckvCount}, (_, i) => ({
        systemId: i + 1,
        module: {instanceId: i + 1, subgraph: {subgraphId: 1}},
      }));

      (mockDataSource.getRepository as jest.Mock)
        .mockReturnValueOnce(makeRepo(makeMockQb(ckvRows)))
        .mockReturnValue(makeRepo(makeMockQb([])));

      await repository.readCalibrationData(1);

      // 1500 IDs → 2 chunks each for values and params (999 + 501)
      // 1 base + 2 value chunks + 2 param chunks = 5 total
      const extraCallCount =
        (mockDataSource.getRepository as jest.Mock).mock.calls.length - 1;
      expect(extraCallCount).toBe(4);
    });
  });
});
