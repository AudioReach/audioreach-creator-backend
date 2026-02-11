/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {UnitOfWorkFactory} from '@arc/core';
import {TypeOrmUnitOfWork} from './typeorm-unit-of-work.js';

/**
 * Creates a factory function for TypeORM-based Unit of Work instances.
 *
 * Each invocation of the returned factory creates a new QueryRunner,
 * connects it, wraps it in a UnitOfWork, and provides a release function.
 *
 * @param dataSource - TypeORM DataSource for creating QueryRunners
 * @returns Factory function that creates UnitOfWork instances
 *
 * @example
 * const factory = createTypeOrmUnitOfWorkFactory(dataSource);
 * const {uow, release} = await factory();
 * try {
 *   await uow.startTransaction();
 *   // ... use uow
 *   await uow.commit();
 * } finally {
 *   await release();
 * }
 */
export function createTypeOrmUnitOfWorkFactory(
  dataSource: DataSource,
): UnitOfWorkFactory {
  return async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    const uow = new TypeOrmUnitOfWork(queryRunner);

    return {
      uow,
      release: async () => {
        await queryRunner.release();
      },
    };
  };
}
