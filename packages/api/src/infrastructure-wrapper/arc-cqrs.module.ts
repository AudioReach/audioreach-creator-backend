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
  FileReaderPort,
  WorkerPoolPort,
  Logger,
  ProfilerPort,
  IdGenerationPort,
} from '@arc/core';
import {DataSourceProvider} from './database/providers/data-source-provider.js';
import {createTypeOrmUnitOfWorkFactory} from './persistence/unit-of-work/typeorm-unit-of-work.factory.js';
import {DbQueryServices, EntityIdServiceRegistry} from '@arc/persistence';
import type {DataSource} from 'typeorm';
import {
  NodeFileReaderAdapter,
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
      provide: 'NODE_FILE_READER_ADAPTER',
      useFactory: () => new NodeFileReaderAdapter(),
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
      useFactory: (dataSource: DataSource) => new DbQueryServices(dataSource),
      inject: ['DATA_SOURCE'],
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
        fileReader: FileReaderPort,
        uowFactory: UnitOfWorkFactory,
        workerPool: WorkerPoolPort,
        logger: Logger,
        profiler: ProfilerPort,
      ) =>
        new CommandBus(
          registry,
          idGeneration,
          fileReader,
          uowFactory,
          workerPool,
          logger,
          profiler,
        ),
      inject: [
        'COMMAND_HANDLER_REGISTRY',
        'ID_GENERATION',
        'NODE_FILE_READER_ADAPTER',
        'UNIT_OF_WORK_FACTORY',
        'WORKER_POOL',
        'LOGGER',
        'PROFILER',
      ],
      scope: Scope.REQUEST,
    },
    {
      provide: QueryBus,
      useFactory: (
        queryServices: QueryServices,
        registry: QueryHandlerRegistry,
      ) => new QueryBus(queryServices, registry),
      inject: ['QUERY_SERVICES', 'QUERY_HANDLER_REGISTRY'],
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
