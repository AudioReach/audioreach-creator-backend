import {Module, Scope} from '@nestjs/common';
import {
  CommandBus,
  QueryBus,
  CommandHandlerRegistry,
  QueryHandlerRegistry,
} from '@arc/core';
import type {
  UnitOfWork,
  QueryServices,
  FileReaderPort,
  WorkerPoolPort,
  Logger,
  ProfilerPort,
} from '@arc/core';
import {DataSourceProvider} from './database/providers/data-source-provider.js';
import {TypeOrmUnitOfWork} from './persistence/unit-of-work/typeorm-unit-of-work.js';
import {DbQueryServices} from './persistence/queries/typeorm-query-services.js';
import {DataSource} from 'typeorm';
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
      provide: 'UNIT_OF_WORK',
      useFactory: (dataSource: DataSource) => new TypeOrmUnitOfWork(dataSource),
      inject: ['DATA_SOURCE'],
      scope: Scope.REQUEST,
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
      provide: CommandBus,
      useFactory: (
        unitOfWork: UnitOfWork,
        registry: CommandHandlerRegistry,
        fileReader: FileReaderPort,
        workerPool: WorkerPoolPort,
        logger: Logger,
        profiler: ProfilerPort,
      ) =>
        new CommandBus(
          unitOfWork,
          registry,
          fileReader,
          workerPool,
          logger,
          profiler,
        ),
      inject: [
        'UNIT_OF_WORK',
        'COMMAND_HANDLER_REGISTRY',
        'NODE_FILE_READER_ADAPTER',
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
  ],
  exports: [
    CommandBus,
    QueryBus,
    'UNIT_OF_WORK',
    'QUERY_SERVICES',
    'COMMAND_HANDLER_REGISTRY',
    'QUERY_HANDLER_REGISTRY',
    'DATA_SOURCE',
    'LOGGER',
    'PROFILER',
    'WORKER_POOL',
  ],
})
export class ArcCqrsModule {
  constructor() {}
}
