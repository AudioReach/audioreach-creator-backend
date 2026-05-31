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

describe('TypeOrmBulkReadQueryService - readCalibrationData (voice scenarios)', () => {
  let repository: TypeOrmBulkReadQueryService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
      getRepository: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;
    repository = new TypeOrmBulkReadQueryService(mockDataSource);
  });

  it('should return empty array when there are no CKVs in the file', async () => {
    const ckvQb = makeMockQb([]);
    (mockDataSource.getRepository as jest.Mock).mockReturnValueOnce({
      createQueryBuilder: jest.fn().mockReturnValue(ckvQb),
    } as unknown as Repository<any>);

    const result = await repository.readCalibrationData(1);
    expect(result).toEqual([]);
  });

  it('should return calibration data containing both audio and voice entries', async () => {
    // Two subgraphs: audio (sg 1) and voice (sg 2)
    const ckvRows = [
      {
        systemId: 1,
        module: {instanceId: 10, subgraph: {subgraphId: 1}},
        values: [{valueDef: {keys: {keyId: 1, isDynamic: false}, valueId: 10}}],
      },
      {
        systemId: 2,
        module: {instanceId: 20, subgraph: {subgraphId: 2}},
        values: [{valueDef: {keys: {keyId: 2, isDynamic: true}, valueId: 20}}],
      },
    ];

    const ckvQb = makeMockQb(ckvRows);
    const paramQb = makeMockQb([]);

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce({
        createQueryBuilder: jest.fn().mockReturnValue(ckvQb),
      } as unknown as Repository<any>)
      .mockReturnValueOnce({
        createQueryBuilder: jest.fn().mockReturnValue(paramQb),
      } as unknown as Repository<any>);

    const result = await repository.readCalibrationData(1);

    // Both subgraphs returned — application layer does the split
    expect(result).toHaveLength(2);
    expect(result.map(r => r.subgraphId)).toEqual([1, 2]);
  });

  it('should derive master keys from CKV values for each subgraph', async () => {
    const ckvRows = [
      {
        systemId: 1,
        module: {instanceId: 10, subgraph: {subgraphId: 5}},
        values: [
          {valueDef: {keys: {keyId: 100, isDynamic: true}, valueId: 200}},
          {valueDef: {keys: {keyId: 101, isDynamic: false}, valueId: 201}},
        ],
      },
    ];

    const ckvQb = makeMockQb(ckvRows);
    const paramQb = makeMockQb([]);

    (mockDataSource.getRepository as jest.Mock)
      .mockReturnValueOnce({
        createQueryBuilder: jest.fn().mockReturnValue(ckvQb),
      } as unknown as Repository<any>)
      .mockReturnValueOnce({
        createQueryBuilder: jest.fn().mockReturnValue(paramQb),
      } as unknown as Repository<any>);

    const result = await repository.readCalibrationData(1);

    expect(result[0].masterKeys).toEqual([
      {keyId: 100, isDynamic: true},
      {keyId: 101, isDynamic: false},
    ]);
  });
});
