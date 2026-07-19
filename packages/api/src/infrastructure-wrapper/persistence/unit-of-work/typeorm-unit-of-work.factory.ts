/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {UnitOfWorkFactory, IdGenerationPort} from '@arc/core';
import {PendingChangeCache} from '@arc/persistence';
import {TypeOrmUnitOfWork} from './typeorm-unit-of-work.js';

/**
 * Creates a factory function for TypeORM-based Unit of Work instances.
 *
 * Each invocation creates a fresh QueryRunner, a fresh PendingChangeCache
 * (scoped to the request), and wraps them in a TypeOrmUnitOfWork.
 */
export function createTypeOrmUnitOfWorkFactory(
  dataSource: DataSource,
  idGeneration: IdGenerationPort,
): UnitOfWorkFactory {
  return async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    const cache = new PendingChangeCache();
    const uow = new TypeOrmUnitOfWork(queryRunner, idGeneration, cache);

    return {
      uow,
      release: async () => {
        await queryRunner.release();
      },
    };
  };
}
