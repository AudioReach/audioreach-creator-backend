/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {UnitOfWorkFactory, IdGenerationPort, Logger} from '@arc/core';
import {TypeOrmUnitOfWork} from './typeorm-unit-of-work.js';

/**
 * Creates a factory function for TypeORM-based Unit of Work instances.
 *
 * Each invocation creates a fresh QueryRunner and wraps it in a TypeOrmUnitOfWork.
 */
export function createTypeOrmUnitOfWorkFactory(
  dataSource: DataSource,
  idGeneration: IdGenerationPort,
  logger: Logger,
): UnitOfWorkFactory {
  return async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    const uow = new TypeOrmUnitOfWork(queryRunner, idGeneration, logger);

    return {
      uow,
      release: async () => {
        await queryRunner.release();
      },
    };
  };
}
