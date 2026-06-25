/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module, Scope} from '@nestjs/common';
import {
  CommandBus,
  QueryBus,
  CommandHandlerRegistry,
  QueryHandlerRegistry,
} from '@arc/core';
import type {
  UnitOfWorkFactory,
  QueryServices,
  FileSystemPort,
  WorkerPoolPort,
  Logger,
  ProfilerPort,
  IdGenerationPort,
} from '@arc/core';
import {DataSourceProvider} from './database/providers/data-source-provider.js';
import {createTypeOrmUnitOfWorkFactory} from './persistence/unit-of-work/typeorm-unit-of-work.factory.js';
import {DbQueryServices, EntityIdServiceRegistry} from '@arc/persistence';
import {FixCommandDispatcher} from './validation/fix-command-dispatcher.js';
import type {DataSource} from 'typeorm';
import {
  NodeFileSystemAdapter,
  NodeProfilerAdapter,
  createWorkerPool,
} from '@arc/fs';
import {ConsoleLoggerService} from './logger/index.js';

@Module({
  providers: [
    DataSourceProvider,
    {
      provide: 'DATA_SOURCE',
      useFactory: async (provider: DataSourceProvider) =>
        provider.getDataSource(),
      inject: [DataSourceProvider],
    },
    {
      provide: 'NODE_FILE_SYSTEM_ADAPTER',
      useFactory: () => new NodeFileSystemAdapter(),
      scope: Scope.REQUEST,
    },
    {
      provide: 'WORKER_POOL',
      useFactory: (logger: Logger) => {
        return createWorkerPool(undefined, logger);
      },
      inject: ['LOGGER'],
    },
    {
      provide: 'COMMAND_HANDLER_REGISTRY',
      useFactory: () => CommandHandlerRegistry.Instance,
    },
    {
      provide: 'QUERY_HANDLER_REGISTRY',
      useFactory: () => QueryHandlerRegistry.Instance,
    },
    {
      provide: 'QUERY_SERVICES',
      useFactory: (dataSource: DataSource, logger: Logger) =>
        new DbQueryServices(dataSource, logger),
      inject: ['DATA_SOURCE', 'LOGGER'],
    },
    {
      provide: 'UNIT_OF_WORK_FACTORY',
      useFactory: (
        dataSource: DataSource,
        idGeneration: IdGenerationPort,
      ): UnitOfWorkFactory =>
        createTypeOrmUnitOfWorkFactory(dataSource, idGeneration),
      inject: ['DATA_SOURCE', 'ID_GENERATION'],
    },
    {
      provide: CommandBus,
      useFactory: (
        registry: CommandHandlerRegistry,
        idGeneration: IdGenerationPort,
        fileSystem: FileSystemPort,
        uowFactory: UnitOfWorkFactory,
        queryServices: QueryServices,
        workerPool: WorkerPoolPort,
        logger: Logger,
        profiler: ProfilerPort,
      ) =>
        new CommandBus(
          registry,
          idGeneration,
          fileSystem,
          uowFactory,
          queryServices,
          workerPool,
          logger,
          profiler,
        ),
      inject: [
        'COMMAND_HANDLER_REGISTRY',
        'ID_GENERATION',
        'NODE_FILE_SYSTEM_ADAPTER',
        'UNIT_OF_WORK_FACTORY',
        'QUERY_SERVICES',
        'WORKER_POOL',
        'LOGGER',
        'PROFILER',
      ],
      scope: Scope.REQUEST,
    },
    {
      provide: FixCommandDispatcher,
      useFactory: () => new FixCommandDispatcher(),
    },
    {
      provide: QueryBus,
      useFactory: (
        queryServices: QueryServices,
        registry: QueryHandlerRegistry,
        fileSystem: FileSystemPort,
        workerPool: WorkerPoolPort,
        logger: Logger,
        profiler: ProfilerPort,
      ) =>
        new QueryBus(
          queryServices,
          registry,
          fileSystem,
          workerPool,
          logger,
          profiler,
        ),
      inject: [
        'QUERY_SERVICES',
        'QUERY_HANDLER_REGISTRY',
        'NODE_FILE_SYSTEM_ADAPTER',
        'WORKER_POOL',
        'LOGGER',
        'PROFILER',
      ],
      scope: Scope.REQUEST,
    },
    {
      provide: 'LOGGER',
      useClass: ConsoleLoggerService,
    },
    {
      provide: 'PROFILER',
      useFactory: () => new NodeProfilerAdapter(),
    },
    {
      provide: 'ID_GENERATION',
      useFactory: (dataSource: DataSource): IdGenerationPort =>
        new EntityIdServiceRegistry(dataSource),
      inject: ['DATA_SOURCE'],
    },
  ],
  exports: [
    CommandBus,
    QueryBus,
    FixCommandDispatcher,
    'QUERY_SERVICES',
    'COMMAND_HANDLER_REGISTRY',
    'QUERY_HANDLER_REGISTRY',
    'DATA_SOURCE',
    'LOGGER',
    'PROFILER',
    'WORKER_POOL',
  ],
})
export class ArcCqrsModule {}
