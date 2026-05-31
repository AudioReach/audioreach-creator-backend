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
    const ckvQb = makeMockQb([]);
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce({
      createQueryBuilder: jest.fn().mockReturnValue(ckvQb),
    } as unknown as Repository<any>);

    const result = await repository.readCalibrationData(1);

    expect(result).toEqual([]);
  });

  it('should return unified calibration data with master keys', async () => {
    const ckvRows = [
      {
        systemId: 1,
        module: {
          instanceId: 300,
          subgraph: {subgraphId: 100},
        },
        values: [
          {
            valueDef: {
              keys: {keyId: 1, isDynamic: false},
              valueId: 10,
            },
          },
          {
            valueDef: {
              keys: {keyId: 2, isDynamic: true},
              valueId: 20,
            },
          },
        ],
      },
    ];

    const paramRows = [
      {
        ckvSystemId: 1,
        spfParameter: {paramId: 400, pidType: 'SharedPersistent'},
        payload: Buffer.from('DEADBEEF', 'hex'),
      },
    ];

    const ckvQb = makeMockQb(ckvRows);
    const paramQb = makeMockQb(paramRows);

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce({
        createQueryBuilder: jest.fn().mockReturnValue(ckvQb),
      } as unknown as Repository<any>)
      .mockReturnValueOnce({
        createQueryBuilder: jest.fn().mockReturnValue(paramQb),
      } as unknown as Repository<any>);

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

  describe('SQLite variable limit chunking', () => {
    it('should execute a single parameter query for <= 999 CKV IDs', async () => {
      const ckvCount = 500;
      const ckvRows = Array.from({length: ckvCount}, (_, i) => ({
        systemId: i + 1,
        module: {instanceId: i + 1, subgraph: {subgraphId: 1}},
        values: [],
      }));

      const paramQb = makeMockQb([]);
      const ckvQb = makeMockQb(ckvRows);

      (mockDataSource.getRepository as jest.Mock)
        .mockReturnValueOnce({
          createQueryBuilder: jest.fn().mockReturnValue(ckvQb),
        } as unknown as Repository<any>)
        .mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(paramQb),
        } as unknown as Repository<any>);

      await repository.readCalibrationData(1);

      // queryInChunks calls getRepository once per chunk; 500 IDs = 1 chunk
      const paramCallCount =
        (mockDataSource.getRepository as jest.Mock).mock.calls.length - 1;
      expect(paramCallCount).toBe(1);
    });

    it('should chunk parameter queries when CKV IDs exceed 999', async () => {
      const ckvCount = 1500;
      const ckvRows = Array.from({length: ckvCount}, (_, i) => ({
        systemId: i + 1,
        module: {instanceId: i + 1, subgraph: {subgraphId: 1}},
        values: [],
      }));

      const ckvQb = makeMockQb(ckvRows);
      const paramQb = makeMockQb([]);

      (mockDataSource.getRepository as jest.Mock)
        .mockReturnValueOnce({
          createQueryBuilder: jest.fn().mockReturnValue(ckvQb),
        } as unknown as Repository<any>)
        .mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue(paramQb),
        } as unknown as Repository<any>);

      await repository.readCalibrationData(1);

      // 1500 IDs → 2 chunks (999 + 501), each hits getRepository once
      const paramCallCount =
        (mockDataSource.getRepository as jest.Mock).mock.calls.length - 1;
      expect(paramCallCount).toBe(2);
    });
  });
});
