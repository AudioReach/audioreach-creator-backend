/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {TypeOrmBulkReadQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.js';
import type {DataSource} from 'typeorm';

describe('TypeOrmBulkReadQueryService - readCalibrationData (integration)', () => {
  let repository: TypeOrmBulkReadQueryService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue({
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue([]),
        }),
      }),
    } as unknown as jest.Mocked<DataSource>;

    repository = new TypeOrmBulkReadQueryService(mockDataSource);
  });

  it('should return empty array when no calibration data exists', async () => {
    const result = await repository.readCalibrationData(1);

    expect(result).toEqual([]);
  });
});
